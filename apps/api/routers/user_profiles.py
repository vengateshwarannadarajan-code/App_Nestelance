"""
User Profile (T-USR_PRF_01-29) — reusable password/account security
policy templates, NOT "a user's profile" in the everyday sense. One
default per org, auto-applied to new users who don't specify a
profile_id (see routers/users.py's create_user).

Enforcement note: these fields are a real, working data model with
validation matching the spec exactly (min password length, complexity
requirements, inactivity days, etc.) — actually enforcing them against
Supabase Auth at signup/password-change time is a separate, deeper
integration deliberately not done in this pass.
"""
import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from auth import get_current_user, can_view_org, UserProfile
from services.activity_log import log_activity

router = APIRouter()


def _supa():
    from supabase import create_client
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])


def _can_manage_org(user: UserProfile, org_id: str) -> bool:
    if user.is_super_admin:
        return True
    return user.org_id == org_id and user.org_role == "admin"


class ProfileFields(BaseModel):
    name: str
    user_id_length_min: int = 5
    user_id_length_max: int = 16
    account_inactivity_days: int = 30
    min_password_length: int = 8
    max_wrong_password_attempts: int = 3
    previous_password_reuse_limit: int = 3
    password_validity_days: int = 60
    password_expiry_warning_days: int = 10
    min_digits: int = 1
    min_uppercase: int = 1
    min_lowercase: int = 1
    min_special_chars: int = 1
    is_default: bool = False

    @field_validator("name")
    @classmethod
    def _name_len(cls, v: str) -> str:
        if not (5 <= len(v) <= 16):
            raise ValueError("Name must be 5-16 characters")
        return v

    @field_validator("account_inactivity_days")
    @classmethod
    def _inactivity(cls, v: int) -> int:
        if not (1 <= v <= 30):
            raise ValueError("Account inactivity days must be 1-30")
        return v

    @field_validator("min_password_length")
    @classmethod
    def _min_pwd(cls, v: int) -> int:
        if v < 8:
            raise ValueError("Min password length must be >= 8")
        return v

    @field_validator("max_wrong_password_attempts")
    @classmethod
    def _max_wrong(cls, v: int) -> int:
        if v > 3:
            raise ValueError("Max wrong password attempts must be <= 3")
        return v

    @field_validator("previous_password_reuse_limit")
    @classmethod
    def _reuse(cls, v: int) -> int:
        if not (3 <= v <= 7):
            raise ValueError("Previous password reuse limit must be 3-7")
        return v

    @field_validator("password_validity_days")
    @classmethod
    def _validity(cls, v: int) -> int:
        if not (1 <= v <= 60):
            raise ValueError("Password validity days must be 1-60")
        return v

    @field_validator("password_expiry_warning_days")
    @classmethod
    def _warning(cls, v: int) -> int:
        if v < 10:
            raise ValueError("Password expiry warning days must be >= 10")
        return v

    @field_validator("min_digits", "min_uppercase", "min_lowercase", "min_special_chars")
    @classmethod
    def _complexity(cls, v: int) -> int:
        if not (1 <= v <= 9):
            raise ValueError("Complexity requirements must be 1-9")
        return v


class ProfileCreate(ProfileFields):
    org_id: str


class ProfileUpdate(BaseModel):
    name: str | None = None
    user_id_length_min: int | None = None
    user_id_length_max: int | None = None
    account_inactivity_days: int | None = None
    min_password_length: int | None = None
    max_wrong_password_attempts: int | None = None
    previous_password_reuse_limit: int | None = None
    password_validity_days: int | None = None
    password_expiry_warning_days: int | None = None
    min_digits: int | None = None
    min_uppercase: int | None = None
    min_lowercase: int | None = None
    min_special_chars: int | None = None
    is_default: bool | None = None


def _unset_other_defaults(supa, org_id: str, except_id: str | None = None):
    query = supa.table("user_profiles").update({"is_default": False}).eq("org_id", org_id).eq("is_default", True)
    if except_id:
        query = query.neq("id", except_id)
    query.execute()


@router.get("")
async def list_profiles(org_id: str | None = None, user: UserProfile = Depends(get_current_user)):
    supa = _supa()
    query = supa.table("user_profiles").select("*, organizations!org_id(path)")
    if org_id:
        query = query.eq("org_id", org_id)
    result = query.order("created_at", desc=True).execute()

    rows = result.data or []
    if not user.is_super_admin:
        rows = [r for r in rows if r.get("organizations") and can_view_org(user, r["organizations"]["path"])]
    for r in rows:
        r.pop("organizations", None)
    return {"profiles": rows}


@router.post("", status_code=201)
async def create_profile(body: ProfileCreate, user: UserProfile = Depends(get_current_user)):
    if not _can_manage_org(user, body.org_id):
        raise HTTPException(403, "Only that organization's Admin (or Super Admin) can create profiles.")

    supa = _supa()
    data = body.model_dump()
    if data["is_default"]:
        _unset_other_defaults(supa, body.org_id)

    result = supa.table("user_profiles").insert({**data, "created_by": user.id}).execute()
    if not result.data:
        raise HTTPException(500, "Failed to create profile")
    log_activity(supa, user.id, body.org_id, "user_profiles", "create", {"name": body.name})
    return result.data[0]


@router.get("/{profile_id}")
async def get_profile(profile_id: str, user: UserProfile = Depends(get_current_user)):
    supa = _supa()
    result = supa.table("user_profiles").select("*, organizations!org_id(path)").eq("id", profile_id).single().execute()
    if not result.data:
        raise HTTPException(404, "Profile not found")
    org = result.data.pop("organizations", None)
    if not user.is_super_admin and not (org and can_view_org(user, org["path"])):
        raise HTTPException(403, "Access denied")
    return result.data


@router.patch("/{profile_id}")
async def update_profile(profile_id: str, body: ProfileUpdate, user: UserProfile = Depends(get_current_user)):
    supa = _supa()
    existing = supa.table("user_profiles").select("org_id").eq("id", profile_id).single().execute()
    if not existing.data:
        raise HTTPException(404, "Profile not found")
    if not _can_manage_org(user, existing.data["org_id"]):
        raise HTTPException(403, "Access denied")

    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(400, "No fields to update")

    if data.get("is_default"):
        _unset_other_defaults(supa, existing.data["org_id"], except_id=profile_id)

    result = supa.table("user_profiles").update(data).eq("id", profile_id).execute()
    log_activity(supa, user.id, existing.data["org_id"], "user_profiles", "update", {"profile_id": profile_id})
    return result.data[0]


@router.delete("/{profile_id}", status_code=204)
async def delete_profile(profile_id: str, user: UserProfile = Depends(get_current_user)):
    supa = _supa()
    existing = supa.table("user_profiles").select("org_id").eq("id", profile_id).single().execute()
    if not existing.data:
        raise HTTPException(404, "Profile not found")
    if not _can_manage_org(user, existing.data["org_id"]):
        raise HTTPException(403, "Access denied")
    supa.table("user_profiles").delete().eq("id", profile_id).execute()
