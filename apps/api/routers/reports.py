"""T-REPORT-003 + T-REPORT-005: Reports router"""
import io, os, sys, uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from supabase import create_client
from auth import get_current_user, require_plan, UserProfile
from services.report_generator import generate_pdf_report, THEME_LABELS, CSRD_MAPPING

router = APIRouter()

# Needed for _build_recommendations()'s question_id -> theme_id lookup.
# Set up independently (not relying on routers.scoring having already
# run this at import time) since the Celery worker process imports
# this module via tasks.py -> routers.reports directly, never through
# main.py's router import order.
for _path in ["/app/packages/scoring-engine",
              os.path.join(os.path.dirname(__file__), "../../../packages/scoring-engine")]:
    if os.path.exists(_path) and _path not in sys.path:
        sys.path.insert(0, _path)

_CONFIG_DIR = os.environ.get("CONFIG_DIR", os.path.join(os.path.dirname(__file__), "../../../packages/config"))
if not os.path.exists(_CONFIG_DIR):
    _CONFIG_DIR = "/app/packages/config"


def _load_config_yaml(name: str) -> dict:
    import yaml
    with open(os.path.join(_CONFIG_DIR, name)) as f:
        return yaml.safe_load(f)


_CAPPING_QUESTION_IDS = {
    cfg["question_id"] for cfg in _load_config_yaml("capping_indicators.yaml")["capping_indicators"].values()
}

_EFFORT_LABELS = {
    "aspirational_capping": {"fr": "Facile",  "en": "Easy"},
    "aspirational":         {"fr": "Facile",  "en": "Easy"},
    "performance":          {"fr": "Difficile", "en": "Hard"},
}


def _build_recommendations(snapshot_id: str, language: str, limit: int = 5) -> list[dict]:
    """
    Real recommendations from this snapshot's actual SHAP values — the
    top negative-contribution questions (the ones dragging the score
    down), not a fixed canned list. If SHAP hasn't finished computing
    yet (it's async — can race a report generated right after scoring),
    returns an empty list rather than fabricated data; the PDF template
    simply renders no recommendation cards in that case.

    "effort" is a heuristic, not a real estimate: aspirational
    (policy/commitment) questions are generally lower-effort than
    performance (demonstrated-outcome) ones — there's no real effort
    classification anywhere in the data model to draw from instead.
    """
    from db import get_shap_result
    from questions import QUESTIONS_BY_THEME

    shap = get_shap_result(snapshot_id)
    if not shap or not shap.get("shap_values"):
        return []

    lang = language if language in ("fr", "en") else "fr"
    question_meta = {
        q["id"]: {"theme_id": theme_id, "type": q["type"]}
        for theme_id, qs in QUESTIONS_BY_THEME.items()
        for q in qs
    }

    negative = sorted(
        ((qid, val) for qid, val in shap["shap_values"].items() if val < 0),
        key=lambda item: item[1],
    )[:limit]

    recommendations = []
    for qid, impact in negative:
        meta = question_meta.get(qid)
        if not meta:
            continue
        theme_id = meta["theme_id"]
        theme_label = THEME_LABELS.get(theme_id, {}).get(lang, theme_id)
        csrd = CSRD_MAPPING.get(theme_id, {})
        is_capping = qid in _CAPPING_QUESTION_IDS
        effort_key = "aspirational_capping" if is_capping else meta["type"]
        effort = _EFFORT_LABELS.get(effort_key, _EFFORT_LABELS["performance"])[lang]

        if is_capping:
            action = (
                f"Réévaluer votre réponse à la question clé du thème « {theme_label} » "
                f"— une réponse positive lève le plafonnement à 3,0/5 sur ce thème."
                if lang == "fr" else
                f"Revisit the key (gateway) question for the “{theme_label}” theme — "
                f"a positive answer lifts the 3.0/5 cap on this theme."
            )
        else:
            action = (
                f"Améliorer votre performance sur le thème « {theme_label} »."
                if lang == "fr" else
                f"Improve your performance on the “{theme_label}” theme."
            )

        recommendations.append({
            "action": action,
            "scoreImpact": round(abs(impact), 2),
            "effort": effort,
            "csrdMapping": f"ESRS {csrd['esrs']}" if csrd.get("esrs") else "",
        })
    return recommendations


def _supa():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

class GenerateRequest(BaseModel):
    company_id: str
    snapshot_id: str
    framework: str = "CSRD"
    language: str = "fr"
    scope: str = "full"   # full | executive


def generate_and_store_report(
    company_id: str,
    snapshot_id: str,
    user_id: str,
    user_plan: str,
    framework: str = "CSRD",
    language: str = "fr",
    job_id: str | None = None,
) -> dict:
    """
    Shared by the synchronous /generate endpoint (T-REPORT-003) and the
    Celery bulk-report task (T-CONS-005) — fetches the snapshot + company,
    renders the PDF, uploads it, and records it in `reports`.
    Plain sync function: nothing it calls actually needs to be awaited.
    """
    supabase = _supa()

    snap_res = supabase.table("score_snapshots").select("*").eq("id", snapshot_id).maybe_single().execute()
    if not snap_res or not snap_res.data:
        raise ValueError("Snapshot not found")
    snapshot = snap_res.data
    theme_scores = snapshot.get("theme_scores", {})

    # Fetch company (for name, logo — T-REPORT-005)
    co_res = supabase.table("companies").select("name, logo_url").eq("id", company_id).maybe_single().execute()
    company = (co_res.data if co_res else None) or {}
    company_name = company.get("name", "Votre Entreprise")

    # Logo only for professional/consultant (T-REPORT-005)
    logo_url = company.get("logo_url") if user_plan in ("professional", "consultant") else None

    report_id = str(uuid.uuid4())
    insert_row = {
        "id": report_id,
        "company_id": company_id,
        "user_id": user_id,
        "snapshot_id": snapshot_id,
        "framework": framework,
        "format": "pdf",
        "locale": language,
        "status": "generating",
    }
    if job_id:
        insert_row["job_id"] = job_id
    supabase.table("reports").insert(insert_row).execute()

    try:
        pdf_bytes = generate_pdf_report(
            company_name=company_name,
            snapshot=snapshot,
            theme_scores=theme_scores,
            recommendations=_build_recommendations(snapshot_id, language),
            language=language,
            framework=framework,
            logo_url=logo_url,
            plan=user_plan,
        )

        file_path = f"reports/{company_id}/{report_id}.pdf"
        supabase.storage.from_("reports").upload(
            file_path, pdf_bytes, {"content-type": "application/pdf"}
        )
        signed = supabase.storage.from_("reports").create_signed_url(file_path, 3600)
        pdf_url = signed.get("signedURL", "")

        supabase.table("reports").update({
            "status": "ready", "file_url": pdf_url,
        }).eq("id", report_id).execute()

        return {"report_id": report_id, "pdf_url": pdf_url, "status": "ready"}

    except Exception as e:
        supabase.table("reports").update({"status": "failed"}).eq("id", report_id).execute()
        raise RuntimeError(f"Report generation failed: {e}") from e


@router.post("/generate")
async def generate_report(
    body: GenerateRequest,
    user: UserProfile = Depends(require_plan("professional")),
):
    if user.company_id != body.company_id:
        raise HTTPException(403, "Access denied")

    try:
        return generate_and_store_report(
            company_id=body.company_id,
            snapshot_id=body.snapshot_id,
            user_id=user.id,
            user_plan=user.plan,
            framework=body.framework,
            language=body.language,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.get("/{company_id}")
async def get_reports(company_id: str, user: UserProfile = Depends(get_current_user)):
    if user.company_id != company_id:
        raise HTTPException(403, "Access denied")
    supabase = _supa()
    res = (supabase.table("reports").select("*")
        .eq("company_id", company_id)
        .order("created_at", desc=True).limit(10).execute())
    return {"reports": res.data or []}


@router.get("/download/{report_id}")
async def download_report(report_id: str, user: UserProfile = Depends(get_current_user)):
    supabase = _supa()
    res = supabase.table("reports").select("*").eq("id", report_id).maybe_single().execute()
    if not res or not res.data:
        raise HTTPException(404, "Report not found")
    if res.data.get("company_id") != user.company_id:
        raise HTTPException(403, "Access denied")
    if res.data.get("status") != "ready":
        raise HTTPException(400, "Report not ready")

    # Return signed URL (24h)
    file_path = f"reports/{user.company_id}/{report_id}.pdf"
    signed = supabase.storage.from_("reports").create_signed_url(file_path, 86400)
    return {"signed_url": signed.get("signedURL", "")}
