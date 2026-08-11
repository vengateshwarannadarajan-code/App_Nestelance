"""T-ADMIN-003 + T-ADMIN-005: Admin router"""
import os
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from supabase import create_client
from auth import get_current_user, UserProfile
import scipy.stats as stats

router = APIRouter()

PLAN_MRR = {"starter": 49, "growth": 149, "professional": 299, "consultant": 499}

def _supa():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

def _require_admin(user: UserProfile = Depends(get_current_user)) -> UserProfile:
    if user.role != "admin":
        raise HTTPException(403, "Admin role required")
    return user

@router.get("/metrics")
async def get_metrics(user: UserProfile = Depends(_require_admin)):
    supabase = _supa()
    users = supabase.table("users").select("id, plan, created_at, role").execute()
    all_users = users.data or []
    companies = supabase.table("companies").select("id").execute()
    snaps = supabase.table("score_snapshots").select("overall_score, created_at").execute()
    reports = supabase.table("reports").select("id, created_at").execute()

    # MRR
    mrr = sum(PLAN_MRR.get(u["plan"], 0) for u in all_users if u["role"] == "sme_owner")

    # Avg score
    scores = [s["overall_score"] for s in (snaps.data or []) if s.get("overall_score") is not None]
    avg_score = round(sum(scores) / len(scores), 2) if scores else 0.0

    # Tier distribution
    tiers: dict[str, int] = {}
    for u in all_users:
        if u["role"] == "sme_owner":
            tiers[u["plan"]] = tiers.get(u["plan"], 0) + 1

    # Reports this month
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0)
    reports_month = sum(1 for r in (reports.data or [])
        if r.get("created_at") and r["created_at"] >= month_start.isoformat())

    # Daily signups last 30 days
    daily: dict[str, int] = {}
    for u in all_users:
        if not u.get("created_at"): continue
        day = u["created_at"][:10]
        if datetime.fromisoformat(day) >= now - timedelta(days=30):
            daily[day] = daily.get(day, 0) + 1

    return {
        "total_companies": len(companies.data or []),
        "total_users": len(all_users),
        "mrr": mrr,
        "avg_score": avg_score,
        "reports_this_month": reports_month,
        "tier_distribution": tiers,
        "daily_signups": [{"date": k, "count": v} for k, v in sorted(daily.items())],
    }


@router.get("/clients")
async def get_clients(
    search: str = Query(""), tier: str = Query(""), status: str = Query(""),
    page: int = Query(1), limit: int = Query(20),
    user: UserProfile = Depends(_require_admin),
):
    supabase = _supa()
    q = supabase.table("users").select("id, email, plan, role, created_at, company_id")
    result = q.execute()
    clients = [u for u in (result.data or []) if u["role"] == "sme_owner"]
    if search: clients = [c for c in clients if search.lower() in (c.get("email", "") + "").lower()]
    if tier: clients = [c for c in clients if c.get("plan") == tier]
    total = len(clients)
    start = (page - 1) * limit
    return {"clients": clients[start:start+limit], "total": total, "page": page, "limit": limit}


class TierUpdate(BaseModel):
    plan: str

@router.patch("/clients/{user_id}/tier")
async def update_tier(user_id: str, body: TierUpdate, admin: UserProfile = Depends(_require_admin)):
    supabase = _supa()
    supabase.table("users").update({"plan": body.plan}).eq("id", user_id).execute()
    return {"status": "updated", "user_id": user_id, "plan": body.plan}

@router.post("/clients/{user_id}/suspend")
async def suspend_client(user_id: str, admin: UserProfile = Depends(_require_admin)):
    supabase = _supa()
    supabase.table("users").update({"suspended": True}).eq("id", user_id).execute()
    return {"status": "suspended", "user_id": user_id}

@router.delete("/clients/{user_id}")
async def delete_client(user_id: str, admin: UserProfile = Depends(_require_admin)):
    supabase = _supa()
    user = supabase.table("users").select("company_id").eq("id", user_id).single().execute()
    if user.data and user.data.get("company_id"):
        cid = user.data["company_id"]
        for table in ["questionnaire_responses","score_snapshots","shap_results","simulator_plans","reports","api_keys"]:
            supabase.table(table).delete().eq("company_id", cid).execute()
        supabase.table("companies").delete().eq("id", cid).execute()
    supabase.table("users").delete().eq("id", user_id).execute()
    return {"status": "deleted", "user_id": user_id}


# ── AI Health (T-ADMIN-005) ───────────────────────────────────
THEMES_LIST = ["climate_transition","biodiversity","circular_economy","employee_wellbeing",
               "human_rights_community","supply_chain_responsibility","board_governance",
               "ethics_anticorruption","data_privacy","shareholder_rights"]

def _compute_spearman(theme_id: str, supabase) -> float:
    """Compute Spearman r for SHAP importance vs baseline for one theme. v1 stub returns 0.92."""
    return 0.92  # TODO v2: real Spearman from SHAP vs baseline importance rankings

@router.get("/ai-health")
async def ai_health(user: UserProfile = Depends(_require_admin)):
    supabase = _supa()
    results = []
    for theme in THEMES_LIST:
        r = _compute_spearman(theme, supabase)
        results.append({
            "theme_id": theme,
            "spearman_r": r,
            "status": "stable" if r >= 0.85 else "drift_detected",
            "last_check": datetime.utcnow().isoformat(),
        })
    return {"themes": results}

@router.post("/ai-health/check")
async def run_drift_check(user: UserProfile = Depends(_require_admin)):
    supabase = _supa()
    results = []
    for theme in THEMES_LIST:
        r = _compute_spearman(theme, supabase)
        status = "stable" if r >= 0.85 else "drift_detected"
        try:
            supabase.table("ai_drift_log").insert({
                "theme_id": theme, "spearman_r": r, "status": status,
            }).execute()
        except Exception:
            pass
        results.append({"theme_id": theme, "spearman_r": r, "status": status})
    return {"checked_at": datetime.utcnow().isoformat(), "themes": results}

@router.get("/ai-health/log")
async def drift_log(user: UserProfile = Depends(_require_admin)):
    supabase = _supa()
    try:
        log = (supabase.table("ai_drift_log").select("*")
            .order("created_at", desc=True).limit(10).execute())
        return {"events": log.data or []}
    except Exception:
        return {"events": []}
