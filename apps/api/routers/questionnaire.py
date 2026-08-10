"""T-QUEST-006: Questionnaire router"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any
from supabase import create_client
import os

from auth import get_current_user, UserProfile

router = APIRouter()

def _supa():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

class AnswerRequest(BaseModel):
    question_id: str
    theme_id: str
    answer_value: Any
    source_label: str | None = None
    submitted_by: str | None = None

@router.post("/answer", status_code=201)
async def upsert_answer(body: AnswerRequest, user: UserProfile = Depends(get_current_user)):
    if not user.company_id:
        raise HTTPException(400, "No company linked to user")
    supabase = _supa()
    data = {
        "company_id":   user.company_id,
        "user_id":      user.id,
        "question_id":  body.question_id,
        "theme_id":     body.theme_id,
        "answer_value": body.answer_value,
        "source_label": body.source_label,
        "submitted_by": body.submitted_by,
    }
    result = (supabase.table("questionnaire_responses")
        .upsert(data, on_conflict="company_id,question_id").execute())
    if not result.data:
        raise HTTPException(500, "Failed to save answer")
    return {"status": "saved", "question_id": body.question_id}

@router.get("/responses/{company_id}")
async def get_responses(company_id: str, user: UserProfile = Depends(get_current_user)):
    if user.company_id != company_id:
        raise HTTPException(403, "Access denied")
    supabase = _supa()
    result = (supabase.table("questionnaire_responses")
        .select("question_id, answer_value, source_label, theme_id")
        .eq("company_id", company_id).execute())
    flat = {r["question_id"]: r["answer_value"] for r in (result.data or [])}
    return {"company_id": company_id, "responses": flat, "count": len(flat)}
