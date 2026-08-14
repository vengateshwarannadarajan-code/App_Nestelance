"""
Organization hierarchy router.

Super Admin -> Distributor -> Aggregator -> Enterprise | Consultant -> Enterprise

Whoever onboards an org becomes its parent. Creating a non-Enterprise org
(or an Enterprise via this endpoint rather than the public signup flow)
also provisions that org's first user as its Admin, via a Supabase Auth
invite email — matching "while onboarding them, users also automatically
need to be created in user management module."
"""
import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from supabase import create_client

from auth import get_current_user, can_view_org, UserProfile
from services.activity_log import log_activity

router = APIRouter()

# Who is allowed to create which org type directly beneath themselves.
# Super Admin bypasses this matrix entirely (can create anything, anywhere).
ALLOWED_CHILD_TYPES: dict[str, set[str]] = {
    "distributor": {"aggregator", "enterprise", "consultant"},
    "aggregator":  {"enterprise", "consultant"},
    "consultant":  {"enterprise"},
    "enterprise":  set(),  # leaf — onboards nobody
}


def _supa():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])


class OrganizationCreate(BaseModel):
    org_type: str          # distributor | aggregator | enterprise | consultant
    name: str
    domain: str | None = None
    max_users: int | None = None
    admin_email: EmailStr | None = None    # if set, invites this org's first Admin
    admin_full_name: str | None = None


class OrganizationOut(BaseModel):
    id: str
    org_type: str
    name: str
    parent_org_id: str | None
    path: str
    domain: str | None
    max_users: int | None


def _actor_org_type(supa, user: UserProfile) -> str | None:
    if not user.org_id:
        return None
    org = supa.table("organizations").select("org_type").eq("id", user.org_id).single().execute()
    return org.data["org_type"] if org.data else None


@router.post("", status_code=201, response_model=OrganizationOut)
async def create_organization(body: OrganizationCreate, user: UserProfile = Depends(get_current_user)):
    if body.org_type not in ALLOWED_CHILD_TYPES:
        raise HTTPException(400, f"Unknown org_type: {body.org_type}")

    supa = _supa()

    if user.is_super_admin:
        parent_org_id = None  # Super Admin-onboarded orgs are tree roots
    else:
        actor_type = _actor_org_type(supa, user)
        if not actor_type or body.org_type not in ALLOWED_CHILD_TYPES.get(actor_type, set()):
            raise HTTPException(
                403,
                f"Your organization ({actor_type or 'none'}) cannot onboard a '{body.org_type}' org.",
            )
        if user.org_role != "admin":
            raise HTTPException(403, "Only an org Admin can onboard a new organization.")
        parent_org_id = user.org_id

    org_result = supa.table("organizations").insert({
        "org_type": body.org_type,
        "name": body.name,
        "parent_org_id": parent_org_id,
        "domain": body.domain,
        "max_users": body.max_users,
        "created_by": user.id,
    }).execute()

    if not org_result.data:
        raise HTTPException(500, "Failed to create organization")
    org = org_result.data[0]

    log_activity(supa, user.id, org["id"], "organizations", "create",
                 {"org_type": body.org_type, "name": body.name, "parent_org_id": parent_org_id})

    # Auto-provision the org's first Admin user (T-USRS: "while onboarding
    # them, users also automatically need to be created in user management").
    if body.admin_email:
        try:
            invite = supa.auth.admin.invite_user_by_email(
                body.admin_email,
                {"data": {"org_id": org["id"], "org_role": "admin", "full_name": body.admin_full_name}},
            )
            new_user_id = invite.user.id if invite and invite.user else None
            if new_user_id:
                supa.table("users").upsert({
                    "id": new_user_id,
                    "email": body.admin_email,
                    "full_name": body.admin_full_name,
                    "org_id": org["id"],
                    "org_role": "admin",
                    "role": "sme_owner" if body.org_type == "enterprise" else "consultant",
                    "plan": "starter",
                }).execute()
        except Exception as e:
            # Org itself was created successfully; surface the invite failure
            # separately rather than rolling back — admin can retry inviting
            # a user to this org from the Users screen.
            return {**org, "admin_invite_error": str(e)}

    return org


@router.get("")
async def list_organizations(org_type: str | None = None, user: UserProfile = Depends(get_current_user)):
    supa = _supa()
    query = supa.table("organizations").select("*")

    if not user.is_super_admin:
        if not user.org_path:
            return {"organizations": []}
        # Self-or-descendant, via the materialized path prefix (mirrors the RLS policy).
        query = query.like("path", f"{user.org_path}%")

    if org_type:
        query = query.eq("org_type", org_type)

    result = query.order("created_at", desc=True).execute()
    return {"organizations": result.data or []}


@router.get("/{org_id}")
async def get_organization(org_id: str, user: UserProfile = Depends(get_current_user)):
    supa = _supa()
    result = supa.table("organizations").select("*").eq("id", org_id).single().execute()
    if not result.data:
        raise HTTPException(404, "Organization not found")
    if not can_view_org(user, result.data["path"]):
        raise HTTPException(403, "Access denied")
    return result.data


class OrganizationUpdate(BaseModel):
    name: str | None = None
    domain: str | None = None
    max_users: int | None = None


@router.patch("/{org_id}")
async def update_organization(org_id: str, body: OrganizationUpdate, user: UserProfile = Depends(get_current_user)):
    supa = _supa()
    existing = supa.table("organizations").select("path, org_type").eq("id", org_id).single().execute()
    if not existing.data:
        raise HTTPException(404, "Organization not found")
    if not (user.is_super_admin or (user.org_id == org_id and user.org_role == "admin")):
        raise HTTPException(403, "Only that organization's own Admin (or Super Admin) can edit it")

    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(400, "No fields to update")
    result = supa.table("organizations").update(data).eq("id", org_id).execute()
    return result.data[0]
