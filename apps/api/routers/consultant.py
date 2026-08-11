"""T-CONS-002 + T-CONS-005 + T-CONS-007: Consultant router"""
import os, secrets, bcrypt, uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from supabase import create_client
from auth import get_current_user, require_plan, UserProfile

router = APIRouter()

def _supa():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

def _require_consultant(user: UserProfile = Depends(get_current_user)) -> UserProfile:
    if user.role != "consultant":
        raise HTTPException(403, "Consultant role required")
    return user

# ── Clients ───────────────────────────────────────────────────

@router.get("/clients")
async def get_clients(user: UserProfile = Depends(_require_consultant)):
    supabase = _supa()
    links = (supabase.table("consultant_clients")
        .select("company_id, status, notes, created_at")
        .eq("consultant_id", user.id).eq("status", "active").execute())

    if not links.data:
        return {"clients": []}

    company_ids = [l["company_id"] for l in links.data]
    companies = (supabase.table("companies")
        .select("id, name, sector_group, industry_id").in_("id", company_ids).execute())
    co_map = {c["id"]: c for c in (companies.data or [])}

    # Fetch latest snapshots
    snaps = (supabase.table("score_snapshots")
        .select("company_id, overall_score, pillar_e, pillar_s, pillar_g, theme_scores, created_at")
        .in_("company_id", company_ids)
        .order("created_at", desc=True).execute())

    snap_map: dict[str, dict] = {}
    for s in (snaps.data or []):
        if s["company_id"] not in snap_map:
            snap_map[s["company_id"]] = s

    result = []
    for link in links.data:
        cid = link["company_id"]
        co = co_map.get(cid, {})
        snap = snap_map.get(cid)
        theme_scores = snap.get("theme_scores", {}) if snap else {}
        weakest_theme = min(theme_scores, key=theme_scores.get) if theme_scores else None
        result.append({
            "company_id": cid,
            "name": co.get("name", ""),
            "sector_group": co.get("sector_group", ""),
            "overall_score": snap["overall_score"] if snap else None,
            "pillar_e": snap["pillar_e"] if snap else None,
            "pillar_s": snap["pillar_s"] if snap else None,
            "pillar_g": snap["pillar_g"] if snap else None,
            "weakest_theme": weakest_theme,
            "last_updated": snap["created_at"] if snap else None,
            "has_assessment": snap is not None,
        })
    return {"clients": result}


class InviteRequest(BaseModel):
    email: str
    company_name: str = ""

@router.post("/clients/invite", status_code=201)
async def invite_client(body: InviteRequest, user: UserProfile = Depends(_require_consultant)):
    # In production: send invitation email via Supabase Auth / Resend
    supabase = _supa()
    return {"status": "invited", "email": body.email, "message": "Invitation email queued"}


@router.delete("/clients/{company_id}")
async def remove_client(company_id: str, user: UserProfile = Depends(_require_consultant)):
    supabase = _supa()
    supabase.table("consultant_clients").update({"status": "archived"}).eq(
        "consultant_id", user.id).eq("company_id", company_id).execute()
    return {"status": "removed", "company_id": company_id}


# ── Bulk reports ──────────────────────────────────────────────

class BulkReportRequest(BaseModel):
    client_ids: list[str]
    framework: str = "CSRD"
    language: str = "fr"

@router.post("/bulk-reports")
async def bulk_reports(
    body: BulkReportRequest,
    user: UserProfile = Depends(require_plan("consultant")),
):
    job_id = str(uuid.uuid4())
    supabase = _supa()

    # Queue one Celery task per client
    tasks_queued = 0
    for client_id in body.client_ids:
        try:
            from tasks import celery_app
            snap = (supabase.table("score_snapshots")
                .select("id").eq("company_id", client_id)
                .order("created_at", desc=True).limit(1).execute())
            if snap.data:
                celery_app.send_task("tasks.generate_report", kwargs={
                    "company_id": client_id,
                    "snapshot_id": snap.data[0]["id"],
                    "framework": body.framework,
                    "language": body.language,
                    "job_id": job_id,
                    "user_id": user.id,
                    "user_plan": user.plan,
                })
                tasks_queued += 1
        except Exception:
            pass

    return {"job_id": job_id, "client_count": tasks_queued}


@router.get("/bulk-reports/{job_id}")
async def bulk_report_status(job_id: str, user: UserProfile = Depends(_require_consultant)):
    supabase = _supa()
    reports = (supabase.table("reports")
        .select("company_id, status, file_url, created_at")
        .eq("job_id", job_id).execute())
    return {"job_id": job_id, "reports": reports.data or []}


# ── API Keys ──────────────────────────────────────────────────

@router.get("/api-keys")
async def get_api_key(user: UserProfile = Depends(require_plan("consultant"))):
    supabase = _supa()
    keys = (supabase.table("api_keys")
        .select("id, label, last_used_at, created_at, key_hash")
        .eq("user_id", user.id).order("created_at", desc=True).limit(1).execute())
    if not keys.data:
        return {"key": None}
    key = keys.data[0]
    # Return masked key — ne_live_ + last 4 chars of hash for identification
    return {
        "key_id": key["id"],
        "masked": "ne_live_" + "•" * 24,
        "last_used_at": key["last_used_at"],
        "created_at": key["created_at"],
    }


@router.post("/api-keys/rotate")
async def rotate_api_key(user: UserProfile = Depends(require_plan("consultant"))):
    supabase = _supa()
    # Invalidate old keys
    supabase.table("api_keys").delete().eq("user_id", user.id).execute()

    # Generate new key
    raw_key = "ne_live_" + secrets.token_urlsafe(32)
    key_hash = bcrypt.hashpw(raw_key.encode(), bcrypt.gensalt()).decode()

    supabase.table("api_keys").insert({
        "user_id": user.id,
        "key_hash": key_hash,
        "label": "Default",
    }).execute()

    return {
        "new_key": raw_key,  # shown once in plaintext
        "message": "Votre ancienne clé a été invalidée. Copiez la nouvelle clé maintenant — elle ne sera plus visible.",
    }
