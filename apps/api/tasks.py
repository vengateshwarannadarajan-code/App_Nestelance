"""
NEST ÉLANCE — Celery Tasks
trigger_shap: fires Modal SHAP job non-blocking, caches result in Redis.
"""

import os
import json
from celery import Celery
from db import get_redis, save_shap_result, get_shap_result

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
CELERY_BROKER = os.environ.get("CELERY_BROKER_URL", REDIS_URL)
CELERY_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", REDIS_URL)

celery_app = Celery(
    "nest_elance",
    broker=CELERY_BROKER,
    backend=CELERY_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)


@celery_app.task(
    bind=True,
    name="tasks.trigger_shap",
    max_retries=3,
    default_retry_delay=30,
)
def trigger_shap(self, snapshot_id: str, responses: dict, sector_group: str) -> dict:
    """
    1. Check Redis cache — if result exists, skip Modal call.
    2. Call Modal SHAP function remotely.
    3. Store in Redis (24h TTL) + persist to Supabase.
    """
    # Check Redis cache first
    cached = get_shap_result(snapshot_id)
    if cached:
        return {"status": "cached", "snapshot_id": snapshot_id}

    try:
        # Call Modal function
        import modal
        fn = modal.Function.lookup("nest-elance-shap", "run_shap")
        result = fn.remote(snapshot_id, responses, sector_group)

        # Persist result
        company_id = _get_company_from_snapshot(snapshot_id)
        save_shap_result(snapshot_id, company_id or "", result)

        return {"status": "computed", "snapshot_id": snapshot_id}

    except Exception as exc:
        # Retry up to 3 times on failure
        raise self.retry(exc=exc)


@celery_app.task(
    bind=True,
    name="tasks.generate_report",
    max_retries=2,
    default_retry_delay=15,
)
def generate_report(
    self,
    company_id: str,
    snapshot_id: str,
    framework: str = "CSRD",
    language: str = "fr",
    job_id: str | None = None,
    user_id: str | None = None,
    user_plan: str = "consultant",
) -> dict:
    """
    T-CONS-005: one report per client in a consultant's bulk-report batch.
    Queued from routers/consultant.py's /bulk-reports endpoint and polled
    via GET /bulk-reports/{job_id}, which filters `reports` by job_id.
    """
    from routers.reports import generate_and_store_report

    try:
        return generate_and_store_report(
            company_id=company_id,
            snapshot_id=snapshot_id,
            user_id=user_id or "",
            user_plan=user_plan,
            framework=framework,
            language=language,
            job_id=job_id,
        )
    except ValueError:
        # Snapshot not found — not retryable, don't spam Celery retries.
        return {"status": "failed", "company_id": company_id, "reason": "snapshot not found"}
    except Exception as exc:
        raise self.retry(exc=exc)


def _get_company_from_snapshot(snapshot_id: str) -> str | None:
    """Helper to retrieve company_id for a snapshot."""
    try:
        from supabase import create_client
        supa = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
        result = supa.table("score_snapshots").select("company_id").eq("id", snapshot_id).single().execute()
        return result.data.get("company_id") if result.data else None
    except Exception:
        return None
