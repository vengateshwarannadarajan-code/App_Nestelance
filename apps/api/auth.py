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


class UserProfile(BaseModel):
    id: str
    email: str
    role: str
    plan: str
    company_id: str | None


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
            .select("id, email, role, plan, company_id")
            .eq("id", uid)
            .single()
            .execute()
        )

        if not profile.data:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                                detail="User profile not found")

        return UserProfile(**profile.data)

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Authentication failed")


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
