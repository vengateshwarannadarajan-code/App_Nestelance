"""T-REPORT-003 + T-REPORT-005: Reports router"""
import io, os, uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from supabase import create_client
from auth import get_current_user, require_plan, UserProfile
from services.report_generator import generate_pdf_report

router = APIRouter()

MOCK_RECS = [
    {"action": "Fixer un objectif de réduction GHG", "scoreImpact": 0.8, "effort": "Low", "csrdMapping": "ESRS E1-4"},
    {"action": "Nommer un membre indépendant au conseil", "scoreImpact": 0.6, "effort": "Medium", "csrdMapping": "ESRS G1-2"},
    {"action": "Désigner un DPO", "scoreImpact": 0.5, "effort": "Low", "csrdMapping": "ESRS G1-1"},
]

def _supa():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

class GenerateRequest(BaseModel):
    company_id: str
    snapshot_id: str
    framework: str = "CSRD"
    language: str = "fr"
    scope: str = "full"   # full | executive

@router.post("/generate")
async def generate_report(
    body: GenerateRequest,
    user: UserProfile = Depends(require_plan("professional")),
):
    if user.company_id != body.company_id:
        raise HTTPException(403, "Access denied")

    supabase = _supa()

    # Fetch snapshot
    snap_res = supabase.table("score_snapshots").select("*").eq("id", body.snapshot_id).single().execute()
    if not snap_res.data:
        raise HTTPException(404, "Snapshot not found")
    snapshot = snap_res.data
    theme_scores = snapshot.get("theme_scores", {})

    # Fetch company (for name, logo — T-REPORT-005)
    co_res = supabase.table("companies").select("name, logo_url").eq("id", body.company_id).single().execute()
    company = co_res.data or {}
    company_name = company.get("name", "Votre Entreprise")

    # Logo only for professional/consultant (T-REPORT-005)
    logo_url = company.get("logo_url") if user.plan in ("professional", "consultant") else None

    # Insert pending record
    report_id = str(uuid.uuid4())
    supabase.table("reports").insert({
        "id": report_id,
        "company_id": body.company_id,
        "user_id": user.id,
        "snapshot_id": body.snapshot_id,
        "framework": body.framework,
        "format": "pdf",
        "locale": body.language,
        "status": "generating",
    }).execute()

    try:
        pdf_bytes = generate_pdf_report(
            company_name=company_name,
            snapshot=snapshot,
            theme_scores=theme_scores,
            recommendations=MOCK_RECS,
            language=body.language,
            framework=body.framework,
            logo_url=logo_url,
            plan=user.plan,
        )

        # Upload to Supabase Storage
        file_path = f"reports/{body.company_id}/{report_id}.pdf"
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
        raise HTTPException(500, f"Report generation failed: {str(e)}")


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
    res = supabase.table("reports").select("*").eq("id", report_id).single().execute()
    if not res.data:
        raise HTTPException(404, "Report not found")
    if res.data.get("company_id") != user.company_id:
        raise HTTPException(403, "Access denied")
    if res.data.get("status") != "ready":
        raise HTTPException(400, "Report not ready")

    # Return signed URL (24h)
    file_path = f"reports/{user.company_id}/{report_id}.pdf"
    signed = supabase.storage.from_("reports").create_signed_url(file_path, 86400)
    return {"signed_url": signed.get("signedURL", "")}
