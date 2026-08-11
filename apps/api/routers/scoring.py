"""T-ENGINE-005: Scoring router"""
import sys, os
# In Docker: scoring engine is at /app/packages/scoring-engine
# In local dev: relative path
for path in ["/app/packages/scoring-engine",
             os.path.join(os.path.dirname(__file__), "../../../packages/scoring-engine")]:
    if os.path.exists(path) and path not in sys.path:
        sys.path.insert(0, path)

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any
from supabase import create_client

from auth import get_current_user, UserProfile
from db import save_snapshot, get_snapshot
from services.peer_benchmark import inject_peer_scores

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
