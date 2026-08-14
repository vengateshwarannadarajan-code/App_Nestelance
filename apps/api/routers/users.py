"""
All Users module (T-USRS_01–51 from the User Management test-case spec).

Field validation rules below are transcribed directly from that spec:
  - full_name: letters, numbers, dots, spaces only
  - username:  letters, numbers, dot, underscore, @, &, hyphen only
  - mobile:    exactly 10 digits, numeric only
  - designation / department: letters + spaces only
  - telephone: numeric only
  - dob:       date, no future dates

2FA/OTP are NOT reimplemented here — Supabase Auth's native MFA (TOTP)
and OTP (signInWithOtp) cover that; wiring them into the UI is a
separate, later pass, not custom crypto written from scratch.
"""
import os
import re
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, field_validator
from supabase import create_client

from auth import get_current_user, can_view_org, UserProfile
from services.activity_log import log_activity

router = APIRouter()

NAME_RE       = re.compile(r"^[A-Za-zÀ-ÿ0-9. ]+$")
USERNAME_RE   = re.compile(r"^[A-Za-z0-9._@&-]+$")
ALPHA_SPACE_RE = re.compile(r"^[A-Za-zÀ-ÿ ]+$")
DIGITS_RE     = re.compile(r"^[0-9]+$")


def _supa():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])


def _validate_common(full_name: str | None, username: str | None, mobile: str | None,
                      designation: str | None, department: str | None,
                      telephone: str | None, dob: date | None) -> None:
    if full_name is not None and not NAME_RE.match(full_name):
        raise HTTPException(422, "Name must contain only letters, numbers, dots, and spaces.")
    if username is not None and not USERNAME_RE.match(username):
        raise HTTPException(422, "Username may only contain letters, numbers, dot, underscore, @, &, and hyphen.")
    if mobile is not None:
        if not DIGITS_RE.match(mobile):
            raise HTTPException(422, "Mobile number must contain digits only.")
        if len(mobile) != 10:
            raise HTTPException(422, "Mobile number must be exactly 10 digits.")
    if designation is not None and not ALPHA_SPACE_RE.match(designation):
        raise HTTPException(422, "Designation must contain only letters and spaces.")
    if department is not None and not ALPHA_SPACE_RE.match(department):
        raise HTTPException(422, "Department must contain only letters and spaces.")
    if telephone is not None and not DIGITS_RE.match(telephone):
        raise HTTPException(422, "Telephone must contain digits only.")
    if dob is not None and dob > date.today():
        raise HTTPException(422, "Date of birth cannot be in the future.")


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str | None = None
    username: str | None = None
    mobile: str | None = None
    designation: str | None = None
    department: str | None = None
    telephone: str | None = None
    dob: date | None = None
    org_id: str
    org_role: str  # admin | viewer | verifier | approver

    @field_validator("org_role")
    @classmethod
    def _valid_role(cls, v: str) -> str:
        if v not in ("admin", "viewer", "verifier", "approver"):
            raise ValueError("org_role must be one of admin, viewer, verifier, approver")
        return v


class UserUpdate(BaseModel):
    full_name: str | None = None
    username: str | None = None
    mobile: str | None = None
    designation: str | None = None
    department: str | None = None
    telephone: str | None = None
    dob: date | None = None
    org_role: str | None = None


def _can_manage_org(supa, actor: UserProfile, org_id: str) -> bool:
    """Creation/edit rights: Super Admin anywhere, or that exact org's own Admin."""
    if actor.is_super_admin:
        return True
    return actor.org_id == org_id and actor.org_role == "admin"


@router.get("")
async def list_users(
    name: str | None = None,
    org_role: str | None = None,
    org_id: str | None = None,
    status: str | None = None,
    include_deleted: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    user: UserProfile = Depends(get_current_user),
):
    supa = _supa()
    query = supa.table("users").select(
        "id, email, full_name, username, mobile, designation, department, telephone, dob, "
        "org_id, org_role, status, deleted_at, created_at, organizations!org_id(name, org_type, path)",
        count="exact",
    )

    if not user.is_super_admin:
        if not user.org_path:
            return {"users": [], "total": 0, "page": page, "page_size": page_size}
        # Visibility is by the *target user's org* path, not a column on
        # `users` itself — filter client-side after fetch since PostgREST
        # can't prefix-match a joined table's column directly in one query.

    if not include_deleted:
        query = query.is_("deleted_at", "null")
    if name:
        query = query.or_(f"full_name.ilike.%{name}%,username.ilike.%{name}%,email.ilike.%{name}%")
    if org_role:
        query = query.eq("org_role", org_role)
    if org_id:
        query = query.eq("org_id", org_id)
    if status:
        query = query.eq("status", status)

    offset = (page - 1) * page_size
    result = query.order("created_at", desc=True).range(offset, offset + page_size - 1).execute()

    rows = result.data or []
    if not user.is_super_admin:
        rows = [
            r for r in rows
            if r.get("organizations") and can_view_org(user, r["organizations"]["path"])
        ]

    return {"users": rows, "total": result.count or 0, "page": page, "page_size": page_size}


@router.post("", status_code=201)
async def create_user(body: UserCreate, user: UserProfile = Depends(get_current_user)):
    _validate_common(body.full_name, body.username, body.mobile,
                      body.designation, body.department, body.telephone, body.dob)

    supa = _supa()
    if not _can_manage_org(supa, user, body.org_id):
        raise HTTPException(403, "Only that organization's own Admin (or Super Admin) can add users to it.")

    org = supa.table("organizations").select("org_type").eq("id", body.org_id).single().execute()
    if not org.data:
        raise HTTPException(404, "Organization not found")

    try:
        invite = supa.auth.admin.invite_user_by_email(
            body.email,
            {"data": {"org_id": body.org_id, "org_role": body.org_role, "full_name": body.full_name}},
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to send invite: {e}")

    new_user_id = invite.user.id if invite and invite.user else None
    if not new_user_id:
        raise HTTPException(500, "Invite succeeded but no user id was returned")

    row = {
        "id": new_user_id,
        "email": body.email,
        "full_name": body.full_name,
        "username": body.username,
        "mobile": body.mobile,
        "designation": body.designation,
        "department": body.department,
        "telephone": body.telephone,
        "dob": body.dob.isoformat() if body.dob else None,
        "org_id": body.org_id,
        "org_role": body.org_role,
        "role": "sme_owner" if org.data["org_type"] == "enterprise" else "consultant",
        "plan": "starter",
    }
    result = supa.table("users").upsert(row).execute()
    log_activity(supa, user.id, body.org_id, "users", "create",
                 {"invited_email": body.email, "org_role": body.org_role})
    return result.data[0] if result.data else row


@router.get("/{user_id}")
async def get_user(user_id: str, user: UserProfile = Depends(get_current_user)):
    supa = _supa()
    result = (
        supa.table("users")
        .select("id, email, full_name, username, mobile, designation, department, telephone, dob, "
                "org_id, org_role, status, deleted_at, created_at, organizations!org_id(name, org_type, path)")
        .eq("id", user_id).single().execute()
    )
    if not result.data:
        raise HTTPException(404, "User not found")
    org = result.data.get("organizations")
    if user_id != user.id and not (org and can_view_org(user, org["path"])):
        raise HTTPException(403, "Access denied")
    return result.data


@router.patch("/{user_id}")
async def update_user(user_id: str, body: UserUpdate, user: UserProfile = Depends(get_current_user)):
    _validate_common(body.full_name, body.username, body.mobile,
                      body.designation, body.department, body.telephone, body.dob)

    supa = _supa()
    existing = supa.table("users").select("org_id").eq("id", user_id).single().execute()
    if not existing.data:
        raise HTTPException(404, "User not found")
    if not (user_id == user.id or _can_manage_org(supa, user, existing.data["org_id"])):
        raise HTTPException(403, "Access denied")

    if body.org_role and not _can_manage_org(supa, user, existing.data["org_id"]):
        raise HTTPException(403, "Only that organization's Admin (or Super Admin) can change roles.")

    data = body.model_dump(exclude_none=True)
    if "dob" in data and data["dob"]:
        data["dob"] = data["dob"].isoformat()
    if not data:
        raise HTTPException(400, "No fields to update")

    result = supa.table("users").update(data).eq("id", user_id).execute()
    if not result.data:
        raise HTTPException(404, "User not found")
    log_activity(supa, user.id, existing.data["org_id"], "users", "update",
                 {"target_user_id": user_id, "fields": list(data.keys())})
    return result.data[0]


@router.patch("/{user_id}/status")
async def set_user_status(user_id: str, active: bool, user: UserProfile = Depends(get_current_user)):
    """T-USRS-48: Active/Inactive toggle — inactive users are blocked at auth.get_current_user."""
    supa = _supa()
    existing = supa.table("users").select("org_id").eq("id", user_id).single().execute()
    if not existing.data:
        raise HTTPException(404, "User not found")
    if not _can_manage_org(supa, user, existing.data["org_id"]):
        raise HTTPException(403, "Access denied")

    result = supa.table("users").update({"status": "active" if active else "inactive"}).eq("id", user_id).execute()
    log_activity(supa, user.id, existing.data["org_id"], "users", "status_change",
                 {"target_user_id": user_id, "active": active})
    return result.data[0]


@router.delete("/{user_id}", status_code=204)
async def delete_user(user_id: str, user: UserProfile = Depends(get_current_user)):
    """Soft delete — T-USRS-47 requires deleted users to remain viewable."""
    supa = _supa()
    existing = supa.table("users").select("org_id").eq("id", user_id).single().execute()
    if not existing.data:
        raise HTTPException(404, "User not found")
    if not _can_manage_org(supa, user, existing.data["org_id"]):
        raise HTTPException(403, "Access denied")

    from datetime import datetime, timezone
    supa.table("users").update({"deleted_at": datetime.now(timezone.utc).isoformat()}).eq("id", user_id).execute()
    log_activity(supa, user.id, existing.data["org_id"], "users", "delete", {"target_user_id": user_id})


@router.post("/{user_id}/reset-password")
async def reset_password(user_id: str, user: UserProfile = Depends(get_current_user)):
    """T-USRS-15: Reset Password — sends a real Supabase reset email."""
    supa = _supa()
    existing = supa.table("users").select("org_id, email").eq("id", user_id).single().execute()
    if not existing.data:
        raise HTTPException(404, "User not found")
    if not (user_id == user.id or _can_manage_org(supa, user, existing.data["org_id"])):
        raise HTTPException(403, "Access denied")

    try:
        # generate_link() only returns link data, it doesn't send mail by
        # default — reset_password_for_email() is the same call Login.tsx's
        # own "Mot de passe oublié ?" already uses and is confirmed to
        # actually deliver, so an admin-triggered reset uses the same path.
        supa.auth.reset_password_for_email(existing.data["email"])
    except Exception as e:
        raise HTTPException(500, f"Failed to send reset email: {e}")
    return {"status": "sent", "email": existing.data["email"]}
