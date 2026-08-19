"""T-ENGINE-005: Scoring router"""
import sys, os
# In Docker: scoring engine is at /app/packages/scoring-engine
# In local dev: relative path
for path in ["/app/packages/scoring-engine",
             os.path.join(os.path.dirname(__file__), "../../../packages/scoring-engine")]:
    if os.path.exists(path) and path not in sys.path:
        sys.path.insert(0, path)

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any
from supabase import create_client

from auth import get_current_user, require_org_role, can_view_org, ORG_ROLE_RANK, UserProfile
from db import save_snapshot, get_snapshot
from services.peer_benchmark import inject_peer_scores
from services.activity_log import log_activity

router = APIRouter()

def _supa():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

class ScoreRequest(BaseModel):
    company_id: str
    sector_group: str
    responses: dict[str, Any]

@router.post("/score")
async def score_company_endpoint(body: ScoreRequest, user: UserProfile = Depends(get_current_user)):
    from engine import score_company
    from buffer_rule import apply_buffer_rule

    enriched = inject_peer_scores(body.responses, body.sector_group)

    supabase = _supa()
    prev_snap = (supabase.table("score_snapshots")
        .select("*").eq("company_id", body.company_id)
        .order("created_at", desc=True).limit(1).execute())
    prev_responses = {}
    if prev_snap.data:
        prev_q = (supabase.table("questionnaire_responses")
            .select("question_id, answer_value").eq("company_id", body.company_id).execute())
        if prev_q.data:
            prev_responses = {r["question_id"]: r["answer_value"] for r in prev_q.data}

    peer_pcts = {k.replace("_peer_score_", ""): v for k, v in enriched.items() if k.startswith("_peer_score_")}
    adjusted = apply_buffer_rule(enriched, prev_responses, peer_pcts)

    result = score_company(adjusted, body.sector_group)
    snapshot_id = save_snapshot(body.company_id, user.id, result)

    try:
        from tasks import trigger_shap
        trigger_shap.delay(snapshot_id, body.responses, body.sector_group)
    except Exception:
        pass

    return {
        "snapshot_id": snapshot_id,
        "overall_score": result.overall_score,
        "pillar_e": result.pillar_e,
        "pillar_s": result.pillar_s,
        "pillar_g": result.pillar_g,
        "themes": {tid: {"score": tr.score, "capping_met": tr.capping_met,
                          "materiality_weight": tr.materiality_weight}
                   for tid, tr in result.themes.items()},
    }

@router.get("/snapshot/{snapshot_id}")
async def get_snapshot_endpoint(snapshot_id: str, user: UserProfile = Depends(get_current_user)):
    snap = get_snapshot(snapshot_id)
    if not snap:
        raise HTTPException(404, "Snapshot not found")
    if snap.get("company_id") != user.company_id:
        raise HTTPException(403, "Access denied")
    return snap

@router.get("/snapshots/{company_id}")
async def get_snapshots(company_id: str, user: UserProfile = Depends(get_current_user)):
    if user.company_id != company_id:
        raise HTTPException(403, "Access denied")
    supabase = _supa()
    result = (supabase.table("score_snapshots")
        .select("*").eq("company_id", company_id)
        .order("created_at", desc=True).execute())
    return {"snapshots": result.data or []}


# ── Verify / Approve / Reject workflow ──────────────────────────
#
# org_role (viewer < verifier < approver < admin, see auth.ORG_ROLE_RANK)
# gates these transitions. Reviewers are almost never the SME's own
# `users.company_id` owner — they're org-hierarchy accounts (created via
# routers/users.py, which sets org_id but deliberately leaves company_id
# unset) — so access here is checked via org-path visibility
# (can_view_org), the same mechanism organizations.py/users.py use,
# not the company_id-equality check the read endpoints above use.

class RejectRequest(BaseModel):
    reason: str


def _company_org_path(supa, company_id: str) -> str | None:
    co = (supa.table("companies")
        .select("org_id, organizations!org_id(path)")
        .eq("id", company_id).single().execute())
    if not co.data or not co.data.get("organizations"):
        return None
    return co.data["organizations"]["path"]


def _assert_can_review(supa, user: UserProfile, company_id: str) -> str | None:
    """Returns the company's org_id (for activity logging) if access is allowed."""
    if user.is_super_admin:
        co = supa.table("companies").select("org_id").eq("id", company_id).single().execute()
        return co.data["org_id"] if co.data else None

    org_path = _company_org_path(supa, company_id)
    if not org_path or not can_view_org(user, org_path):
        raise HTTPException(403, "Access denied")
    return org_path.strip("/").split("/")[-1]


@router.post("/snapshot/{snapshot_id}/verify")
async def verify_snapshot(snapshot_id: str, user: UserProfile = Depends(require_org_role("verifier"))):
    snap = get_snapshot(snapshot_id)
    if not snap:
        raise HTTPException(404, "Snapshot not found")

    supabase = _supa()
    org_id = _assert_can_review(supabase, user, snap["company_id"])

    if snap["status"] != "draft":
        raise HTTPException(400, f"Cannot verify a snapshot in status '{snap['status']}' — only draft snapshots can be verified.")

    result = supabase.table("score_snapshots").update({
        "status": "verified",
        "verified_by": user.id,
        "verified_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", snapshot_id).execute()
    if not result.data:
        raise HTTPException(404, "Snapshot not found")
    log_activity(supabase, user.id, org_id, "score_snapshots", "verify", {"snapshot_id": snapshot_id})
    return result.data[0]


@router.post("/snapshot/{snapshot_id}/approve")
async def approve_snapshot(snapshot_id: str, user: UserProfile = Depends(require_org_role("approver"))):
    snap = get_snapshot(snapshot_id)
    if not snap:
        raise HTTPException(404, "Snapshot not found")

    supabase = _supa()
    org_id = _assert_can_review(supabase, user, snap["company_id"])

    if snap["status"] != "verified":
        raise HTTPException(400, f"Cannot approve a snapshot in status '{snap['status']}' — it must be verified first.")

    result = supabase.table("score_snapshots").update({
        "status": "approved",
        "approved_by": user.id,
        "approved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", snapshot_id).execute()
    if not result.data:
        raise HTTPException(404, "Snapshot not found")
    log_activity(supabase, user.id, org_id, "score_snapshots", "approve", {"snapshot_id": snapshot_id})
    return result.data[0]


@router.post("/snapshot/{snapshot_id}/reject")
async def reject_snapshot(snapshot_id: str, body: RejectRequest, user: UserProfile = Depends(require_org_role("verifier"))):
    snap = get_snapshot(snapshot_id)
    if not snap:
        raise HTTPException(404, "Snapshot not found")

    supabase = _supa()
    org_id = _assert_can_review(supabase, user, snap["company_id"])

    if snap["status"] not in ("draft", "verified"):
        raise HTTPException(400, f"Cannot reject a snapshot in status '{snap['status']}'.")
    # Rejecting an already-verified snapshot is an approver-level call —
    # undoing a verification carries the same weight as approving one.
    if snap["status"] == "verified" and not user.is_super_admin:
        if ORG_ROLE_RANK.get(user.org_role or "", -1) < ORG_ROLE_RANK["approver"]:
            raise HTTPException(403, "Rejecting a verified snapshot requires the 'approver' org role or higher.")
    if not body.reason.strip():
        raise HTTPException(422, "A rejection reason is required.")

    result = supabase.table("score_snapshots").update({
        "status": "rejected",
        "rejected_by": user.id,
        "rejected_at": datetime.now(timezone.utc).isoformat(),
        "rejection_reason": body.reason.strip(),
    }).eq("id", snapshot_id).execute()
    if not result.data:
        raise HTTPException(404, "Snapshot not found")
    log_activity(supabase, user.id, org_id, "score_snapshots", "reject",
                 {"snapshot_id": snapshot_id, "reason": body.reason.strip()})
    return result.data[0]


@router.get("/pending")
async def list_pending_snapshots(
    status: str | None = None,
    user: UserProfile = Depends(require_org_role("verifier")),
):
    """Review queue for Verifiers/Approvers: snapshots awaiting action,
    scoped to companies in the reviewer's own org or any descendant org."""
    supabase = _supa()
    query = supabase.table("score_snapshots").select(
        "id, company_id, overall_score, pillar_e, pillar_s, pillar_g, status, created_at, "
        "verified_by, verified_at, approved_by, approved_at, rejected_by, rejected_at, rejection_reason"
    )
    query = query.eq("status", status) if status else query.in_("status", ["draft", "verified"])
    result = query.order("created_at", desc=True).execute()
    rows = result.data or []
    if not rows:
        return {"snapshots": []}

    company_ids = list({r["company_id"] for r in rows})
    companies = (supabase.table("companies").select("id, name, org_id, organizations!org_id(path)")
        .in_("id", company_ids).execute())
    co_by_id = {c["id"]: c for c in (companies.data or [])}

    visible = []
    for r in rows:
        co = co_by_id.get(r["company_id"])
        if not co or not co.get("organizations"):
            continue
        if not (user.is_super_admin or can_view_org(user, co["organizations"]["path"])):
            continue
        r["company_name"] = co["name"]
        visible.append(r)

    return {"snapshots": visible}
