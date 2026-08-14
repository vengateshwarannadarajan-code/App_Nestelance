"""
Login History + Activity Log (T-lGN_HIS, T-ACT_LOG from the User
Management spec). Both are read-only audit trails scoped by the same
org-hierarchy visibility as everything else — Super Admin sees all,
everyone else sees self-or-descendant orgs only.
"""
import csv
import io
import os
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from supabase import create_client

from auth import get_current_user, can_view_org, UserProfile

router = APIRouter()
_optional_bearer = HTTPBearer(auto_error=False)


def _supa():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])


def _client_ip(request: Request) -> str | None:
    # Railway (and most PaaS) sit behind a proxy — the real client IP is
    # the first hop in X-Forwarded-For, not request.client.host (that's
    # the proxy's own address).
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


class LoginEvent(BaseModel):
    email: str
    event_type: str = "login"   # login | logout
    success: bool = True
    description: str | None = None


@router.post("/login-event", status_code=201)
async def record_login_event(
    body: LoginEvent,
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
):
    """
    Deliberately NOT behind get_current_user — a failed login has no
    session to authenticate with. Best-effort user_id resolution from
    the token when one is present (the success/logout case); failures
    are recorded by email alone. Known tradeoff: this endpoint accepts
    unauthenticated writes, so it can be spammed with fake failure rows
    for arbitrary emails — acceptable for now, not hardened against abuse.
    """
    supa = _supa()
    user_id = None
    if credentials:
        try:
            user_resp = supa.auth.get_user(credentials.credentials)
            if user_resp and user_resp.user:
                user_id = user_resp.user.id
        except Exception:
            pass

    supa.table("login_history").insert({
        "user_id": user_id,
        "email": body.email,
        "event_type": body.event_type,
        "success": body.success,
        "description": body.description,
        "ip_address": _client_ip(request),
        "user_agent": request.headers.get("user-agent"),
    }).execute()

    return {"status": "recorded"}


def _visible_user_ids(supa, user: UserProfile) -> list[str] | None:
    """Returns None if unrestricted (Super Admin), else a list of visible user ids."""
    if user.is_super_admin:
        return None
    if not user.org_path:
        return []
    rows = (
        supa.table("users")
        .select("id, organizations!org_id(path)")
        .execute()
    )
    return [
        r["id"] for r in (rows.data or [])
        if r.get("organizations") and can_view_org(user, r["organizations"]["path"])
    ]


@router.get("/login-history")
async def get_login_history(
    name: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    user_id: str | None = None,
    export: str | None = Query(None, pattern="^csv$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    user: UserProfile = Depends(get_current_user),
):
    supa = _supa()
    visible_ids = _visible_user_ids(supa, user)
    if visible_ids is not None and not visible_ids:
        return {"entries": [], "total": 0}

    query = supa.table("login_history").select("*", count="exact")
    if visible_ids is not None:
        query = query.in_("user_id", visible_ids)
    if name:
        query = query.ilike("email", f"%{name}%")
    if user_id:
        query = query.eq("user_id", user_id)
    if date_from:
        query = query.gte("created_at", date_from)
    if date_to:
        query = query.lte("created_at", date_to)

    if export == "csv":
        result = query.order("created_at", desc=True).execute()
        return _to_csv(result.data or [],
                       ["created_at", "email", "event_type", "success", "description", "ip_address"])

    offset = (page - 1) * page_size
    result = query.order("created_at", desc=True).range(offset, offset + page_size - 1).execute()
    return {"entries": result.data or [], "total": result.count or 0, "page": page, "page_size": page_size}


@router.get("/activity-log")
async def get_activity_log(
    module: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    user_id: str | None = None,
    export: str | None = Query(None, pattern="^csv$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    user: UserProfile = Depends(get_current_user),
):
    if not user.is_super_admin and not user.org_path:
        return {"entries": [], "total": 0}

    supa = _supa()
    query = supa.table("activity_log").select(
        "id, user_id, org_id, module, action, details, created_at, "
        "users!user_id(email, full_name), organizations!org_id(name, path)",
    )

    if module:
        query = query.eq("module", module)
    if user_id:
        query = query.eq("user_id", user_id)
    if date_from:
        query = query.gte("created_at", date_from)
    if date_to:
        query = query.lte("created_at", date_to)

    # Filtered client-side by org visibility (mirrors users.py's list_users) —
    # PostgREST embedded-resource filtering via the Python client isn't
    # reliable enough to depend on here, so fetch broadly then narrow.
    result = query.order("created_at", desc=True).execute()
    rows = result.data or []
    if not user.is_super_admin:
        rows = [
            r for r in rows
            if r.get("organizations") and can_view_org(user, r["organizations"]["path"])
        ]

    if export == "csv":
        csv_rows = [
            {"created_at": r["created_at"], "module": r["module"], "action": r["action"],
             "user": (r.get("users") or {}).get("email", ""), "details": r.get("details")}
            for r in rows
        ]
        return _to_csv(csv_rows, ["created_at", "module", "action", "user", "details"])

    total = len(rows)
    offset = (page - 1) * page_size
    page_rows = rows[offset:offset + page_size]
    return {"entries": page_rows, "total": total, "page": page, "page_size": page_size}


def _to_csv(rows: list[dict], columns: list[str]) -> StreamingResponse:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=export.csv"},
    )
