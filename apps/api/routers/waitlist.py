"""Waitlist — public email capture endpoint (no auth required)"""
import os, re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from supabase import create_client

router = APIRouter()

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _supa():
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    return create_client(url, key)


class WaitlistEntry(BaseModel):
    email: str


@router.post("")
async def join_waitlist(entry: WaitlistEntry):
    email = entry.email.strip().lower()

    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="Invalid email address")

    try:
        _supa().table("waitlist").upsert(
            {"email": email},
            on_conflict="email"   # silently ignore duplicates
        ).execute()
    except Exception as e:
        # Don't expose Supabase errors to the client
        raise HTTPException(status_code=500, detail="Could not save email")

    return {"ok": True}
