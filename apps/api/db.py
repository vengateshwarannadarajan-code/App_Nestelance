"""
NEST ÉLANCE — DB helpers
save_snapshot, get_snapshot, save_shap_result, get_shap_result, get_redis
"""

import json, os
from typing import Any, Optional
import redis as redis_lib
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

SHAP_CACHE_TTL = 86_400  # 24 hours


def _supa():
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def get_redis() -> redis_lib.Redis:
    return redis_lib.from_url(REDIS_URL, decode_responses=True)


# ── Snapshot ──────────────────────────────────────────────────
def save_snapshot(
    company_id: str,
    user_id: str,
    score_result,  # ScoreResult dataclass
) -> str:
    """Saves score snapshot to Supabase. Returns snapshot_id."""
    supabase = _supa()

    theme_scores = {
        tid: tr.score for tid, tr in score_result.themes.items()
    }

    data = {
        "company_id":     company_id,
        "user_id":        user_id,
        "overall_score":  score_result.overall_score,
        "pillar_e":       score_result.pillar_e,
        "pillar_s":       score_result.pillar_s,
        "pillar_g":       score_result.pillar_g,
        "theme_scores":   theme_scores,
        "sector_group":   score_result.sector_group,
        "question_count": score_result.question_count,
        "engine_version": score_result.engine_version,
        "materiality_weights": {},  # v1: empty, populated in v2
    }

    result = supabase.table("score_snapshots").insert(data).execute()
    if not result.data:
        raise RuntimeError("Failed to save snapshot")

    return result.data[0]["id"]


def get_snapshot(snapshot_id: str) -> Optional[dict]:
    """Fetches snapshot from Supabase by ID."""
    supabase = _supa()
    result = (
        supabase.table("score_snapshots")
        .select("*")
        .eq("id", snapshot_id)
        .single()
        .execute()
    )
    return result.data


# ── SHAP ──────────────────────────────────────────────────────
def save_shap_result(snapshot_id: str, company_id: str, shap_data: dict) -> None:
    """Saves SHAP result to Redis (TTL 24h) and Supabase."""
    # Redis cache
    try:
        r = get_redis()
        r.setex(f"shap:{snapshot_id}", SHAP_CACHE_TTL, json.dumps(shap_data))
    except Exception:
        pass  # Redis failure is non-blocking

    # Supabase persist
    supabase = _supa()
    supabase.table("shap_results").insert({
        "snapshot_id":  snapshot_id,
        "company_id":   company_id,
        "shap_values":  shap_data.get("shap_values", {}),
        "base_value":   shap_data.get("baseline_score", 0.0),
        "top_drivers":  shap_data.get("top_drivers", []),
    }).execute()


def get_shap_result(snapshot_id: str) -> Optional[dict]:
    """
    Checks Redis cache first (key: shap:{snapshot_id}, TTL 24h),
    falls back to Supabase.
    """
    # Redis check
    try:
        r = get_redis()
        cached = r.get(f"shap:{snapshot_id}")
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    # Supabase fallback. maybe_single() (not single()) — SHAP not having
    # finished computing yet for this snapshot is an expected, normal
    # state (every caller checks this return value for falsy and treats
    # it as "pending"), not an error condition. single() raises
    # postgrest.exceptions.APIError (PGRST116, "0 rows") in that case
    # instead of returning None, which crashed both GET
    # /api/shap/results/{id} and routers.reports._build_recommendations
    # with a 500 any time SHAP genuinely hadn't finished yet.
    supabase = _supa()
    result = (
        supabase.table("shap_results")
        .select("*")
        .eq("snapshot_id", snapshot_id)
        .maybe_single()
        .execute()
    )
    return result.data if result else None
