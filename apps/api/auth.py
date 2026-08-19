from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client
from pydantic import BaseModel
import os

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

PLAN_RANK = {
    "starter":      0,
    "growth":       1,
    "professional": 2,
    "consultant":   3,
}

bearer_scheme = HTTPBearer()


ORG_ROLE_RANK = {
    "viewer":   0,
    "verifier": 1,
    "approver": 2,
    "admin":    3,
}


class UserProfile(BaseModel):
    id: str
    email: str
    role: str
    plan: str
    company_id: str | None
    org_id: str | None = None
    org_role: str | None = None
    is_super_admin: bool = False
    org_path: str | None = None    # this user's own org's ancestor path, e.g. "/id1/id2/"


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> UserProfile:
    token = credentials.credentials
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    try:
        user_response = supabase.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                                detail="Invalid or expired token")

        uid = user_response.user.id
        profile = (
            supabase.table("users")
            .select("id, email, role, plan, company_id, org_id, org_role, is_super_admin, "
                    "status, deleted_at, organizations!org_id(path)")
            .eq("id", uid)
            .single()
            .execute()
        )

        if not profile.data:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                                detail="User profile not found")

        data = dict(profile.data)
        org = data.pop("organizations", None)

        if data.pop("deleted_at", None):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                                detail="Account has been deleted")
        if data.pop("status", "active") == "inactive":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Account is inactive")

        data["org_path"] = org.get("path") if org else None

        return UserProfile(**data)

    except HTTPException:
        raise
    except Exception as e:
        # Was previously swallowed into a generic "Authentication failed"
        # with no trace of what actually happened — this is almost always
        # an expired/invalid JWT causing supabase.auth.get_user() to raise
        # rather than return a null user, but logging it properly means the
        # next occurrence is actually diagnosable instead of guessed at.
        print(f"[auth.get_current_user] unexpected error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Session expired — please log in again")


def require_org_role(minimum_role: str):
    """
    Dependency factory for the admin/approver/verifier/viewer axis —
    orthogonal to require_plan (subscription tier). Super Admin always
    passes. Usage:
        @router.post("/endpoint")
        async def endpoint(user=Depends(require_org_role("approver"))):
    """
    async def _check(user: UserProfile = Depends(get_current_user)) -> UserProfile:
        if user.is_super_admin:
            return user
        user_rank = ORG_ROLE_RANK.get(user.org_role or "", -1)
        required_rank = ORG_ROLE_RANK.get(minimum_role, 0)
        if user_rank < required_rank:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Org role '{minimum_role}' or higher required. "
                       f"Current role: '{user.org_role}'",
            )
        return user

    return _check


def can_view_org(actor: UserProfile, target_org_path: str) -> bool:
    """Self-or-descendant check mirroring the organizations_visibility RLS policy."""
    if actor.is_super_admin:
        return True
    if not actor.org_path:
        return False
    return target_org_path.startswith(actor.org_path)


def require_plan(minimum_plan: str):
    """
    Dependency factory. Usage:
        @router.get("/endpoint")
        async def endpoint(user=Depends(require_plan("growth"))):
    """
    async def _check(user: UserProfile = Depends(get_current_user)) -> UserProfile:
        user_rank = PLAN_RANK.get(user.plan, 0)
        required_rank = PLAN_RANK.get(minimum_plan, 0)
        if user_rank < required_rank:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Plan '{minimum_plan}' or higher required. Current plan: '{user.plan}'",
            )
        return user

    return _check
