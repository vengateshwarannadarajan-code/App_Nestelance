"""
Users Group (T-USR_GRP_01-13) — bundles ACL permissions, assignable to
users within an org. Org-scoped; managed by that org's own Admin or
Super Admin, same rights pattern as organizations.py/users.py.
"""
import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

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


class GroupCreate(BaseModel):
    org_id: str
    name: str
    description: str | None = None
    permission_ids: list[str] = []


class GroupUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    permission_ids: list[str] | None = None


def _attach_permissions(supa, group_id: str, permission_ids: list[str]):
    supa.table("user_group_permissions").delete().eq("group_id", group_id).execute()
    if permission_ids:
        supa.table("user_group_permissions").insert([
            {"group_id": group_id, "permission_id": pid} for pid in permission_ids
        ]).execute()


def _serialize(supa, group: dict) -> dict:
    perms = (
        supa.table("user_group_permissions")
        .select("permission_id, acl_permissions(id, module, submodule, action, name)")
        .eq("group_id", group["id"])
        .execute()
    )
    group["permissions"] = [p["acl_permissions"] for p in (perms.data or []) if p.get("acl_permissions")]
    return group


@router.get("")
async def list_groups(org_id: str | None = None, user: UserProfile = Depends(get_current_user)):
    supa = _supa()
    query = supa.table("user_groups").select("*, organizations!org_id(path)")
    if org_id:
        query = query.eq("org_id", org_id)
    result = query.order("created_at", desc=True).execute()

    rows = result.data or []
    if not user.is_super_admin:
        rows = [r for r in rows if r.get("organizations") and can_view_org(user, r["organizations"]["path"])]
    for r in rows:
        r.pop("organizations", None)
        _serialize(supa, r)
    return {"groups": rows}


@router.post("", status_code=201)
async def create_group(body: GroupCreate, user: UserProfile = Depends(get_current_user)):
    if not _can_manage_org(user, body.org_id):
        raise HTTPException(403, "Only that organization's Admin (or Super Admin) can create groups.")
    supa = _supa()
    result = supa.table("user_groups").insert({
        "org_id": body.org_id,
        "name": body.name,
        "description": body.description,
        "created_by": user.id,
    }).execute()
    if not result.data:
        raise HTTPException(500, "Failed to create group")
    group = result.data[0]
    _attach_permissions(supa, group["id"], body.permission_ids)
    log_activity(supa, user.id, body.org_id, "user_groups", "create", {"name": body.name})
    return _serialize(supa, group)


@router.get("/{group_id}")
async def get_group(group_id: str, user: UserProfile = Depends(get_current_user)):
    supa = _supa()
    result = supa.table("user_groups").select("*, organizations!org_id(path)").eq("id", group_id).maybe_single().execute()
    if not result or not result.data:
        raise HTTPException(404, "Group not found")
    org = result.data.pop("organizations", None)
    if not user.is_super_admin and not (org and can_view_org(user, org["path"])):
        raise HTTPException(403, "Access denied")
    return _serialize(supa, result.data)


@router.patch("/{group_id}")
async def update_group(group_id: str, body: GroupUpdate, user: UserProfile = Depends(get_current_user)):
    supa = _supa()
    existing = supa.table("user_groups").select("org_id").eq("id", group_id).maybe_single().execute()
    if not existing or not existing.data:
        raise HTTPException(404, "Group not found")
    if not _can_manage_org(user, existing.data["org_id"]):
        raise HTTPException(403, "Access denied")

    data = body.model_dump(exclude_none=True, exclude={"permission_ids"})
    if data:
        supa.table("user_groups").update(data).eq("id", group_id).execute()
    if body.permission_ids is not None:
        _attach_permissions(supa, group_id, body.permission_ids)

    log_activity(supa, user.id, existing.data["org_id"], "user_groups", "update", {"group_id": group_id})
    result = supa.table("user_groups").select("*").eq("id", group_id).maybe_single().execute()
    return _serialize(supa, result.data if result else None)


@router.post("/{group_id}/clone", status_code=201)
async def clone_group(group_id: str, user: UserProfile = Depends(get_current_user)):
    """T-USR_GRP-10: Clone option."""
    supa = _supa()
    existing = supa.table("user_groups").select("*").eq("id", group_id).maybe_single().execute()
    if not existing or not existing.data:
        raise HTTPException(404, "Group not found")
    if not _can_manage_org(user, existing.data["org_id"]):
        raise HTTPException(403, "Access denied")

    clone = supa.table("user_groups").insert({
        "org_id": existing.data["org_id"],
        "name": f"{existing.data['name']} (copie)",
        "description": existing.data.get("description"),
        "created_by": user.id,
    }).execute()
    new_group = clone.data[0]

    perms = supa.table("user_group_permissions").select("permission_id").eq("group_id", group_id).execute()
    permission_ids = [p["permission_id"] for p in (perms.data or [])]
    _attach_permissions(supa, new_group["id"], permission_ids)

    return _serialize(supa, new_group)


@router.delete("/{group_id}", status_code=204)
async def delete_group(group_id: str, user: UserProfile = Depends(get_current_user)):
    supa = _supa()
    existing = supa.table("user_groups").select("org_id").eq("id", group_id).maybe_single().execute()
    if not existing or not existing.data:
        raise HTTPException(404, "Group not found")
    if not _can_manage_org(user, existing.data["org_id"]):
        raise HTTPException(403, "Access denied")
    supa.table("user_groups").delete().eq("id", group_id).execute()
