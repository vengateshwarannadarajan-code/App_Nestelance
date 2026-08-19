"""
ACL — Access Control List (T-ACL_01-16).

The low-level permission catalog: (module, submodule, action) entries.
Platform-wide, not org-scoped — only Super Admin manages entries;
any authenticated user can list/read them (needed to populate the
Users Group permission-assignment UI).
"""
import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user, UserProfile

router = APIRouter()


def _supa():
    from supabase import create_client
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])


class PermissionCreate(BaseModel):
    module: str
    submodule: str | None = None
    action: str
    name: str


class PermissionUpdate(BaseModel):
    name: str | None = None
    module: str | None = None
    submodule: str | None = None
    action: str | None = None


def _require_super_admin(user: UserProfile):
    if not user.is_super_admin:
        raise HTTPException(403, "Only Super Admin can manage ACL entries.")


@router.get("")
async def list_permissions(module: str | None = None, user: UserProfile = Depends(get_current_user)):
    supa = _supa()
    query = supa.table("acl_permissions").select("*")
    if module:
        query = query.eq("module", module)
    result = query.order("module").order("action").execute()
    return {"permissions": result.data or []}


@router.post("", status_code=201)
async def create_permission(body: PermissionCreate, user: UserProfile = Depends(get_current_user)):
    _require_super_admin(user)
    supa = _supa()
    result = supa.table("acl_permissions").insert({
        **body.model_dump(),
        "created_by": user.id,
    }).execute()
    if not result.data:
        raise HTTPException(500, "Failed to create permission")
    return result.data[0]


@router.get("/{permission_id}")
async def get_permission(permission_id: str, user: UserProfile = Depends(get_current_user)):
    supa = _supa()
    result = supa.table("acl_permissions").select("*").eq("id", permission_id).single().execute()
    if not result.data:
        raise HTTPException(404, "Permission not found")
    return result.data


@router.patch("/{permission_id}")
async def update_permission(permission_id: str, body: PermissionUpdate, user: UserProfile = Depends(get_current_user)):
    _require_super_admin(user)
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(400, "No fields to update")
    supa = _supa()
    result = supa.table("acl_permissions").update(data).eq("id", permission_id).execute()
    if not result.data:
        raise HTTPException(404, "Permission not found")
    return result.data[0]


@router.delete("/{permission_id}", status_code=204)
async def delete_permission(permission_id: str, user: UserProfile = Depends(get_current_user)):
    _require_super_admin(user)
    supa = _supa()
    supa.table("acl_permissions").delete().eq("id", permission_id).execute()
