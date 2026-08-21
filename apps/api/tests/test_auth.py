"""T-TEST-004: Auth module unit tests"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")

from auth import UserProfile, require_plan, PLAN_RANK
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials


def _make_user(plan: str, role: str = "sme_owner") -> UserProfile:
    return UserProfile(id="u-1", email="test@example.com", role=role, plan=plan, company_id="co-1")


# ── PLAN_RANK ordering ────────────────────────────────────────

def test_plan_rank_ordering():
    assert PLAN_RANK["starter"] < PLAN_RANK["growth"]
    assert PLAN_RANK["growth"] < PLAN_RANK["professional"]
    assert PLAN_RANK["professional"] < PLAN_RANK["consultant"]


def test_plan_rank_has_all_plans():
    for plan in ("starter", "growth", "professional", "consultant"):
        assert plan in PLAN_RANK


# ── require_plan dependency ───────────────────────────────────

@pytest.mark.asyncio
async def test_require_plan_growth_with_starter_returns_403():
    """Starter user cannot access growth-gated endpoints."""
    user = _make_user("starter")
    check_fn = require_plan("growth")

    with pytest.raises(HTTPException) as exc:
        await check_fn(user=user)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_require_plan_growth_with_growth_passes():
    """Growth user can access growth-gated endpoints."""
    user = _make_user("growth")
    check_fn = require_plan("growth")
    result = await check_fn(user=user)
    assert result.plan == "growth"


@pytest.mark.asyncio
async def test_require_plan_consultant_with_professional_returns_403():
    """Professional user cannot access consultant-gated endpoints."""
    user = _make_user("professional")
    check_fn = require_plan("consultant")
    with pytest.raises(HTTPException) as exc:
        await check_fn(user=user)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_require_plan_higher_plan_satisfies_lower_requirement():
    """Professional user CAN access growth-gated endpoints."""
    user = _make_user("professional")
    check_fn = require_plan("growth")
    result = await check_fn(user=user)
    assert result.plan == "professional"


@pytest.mark.asyncio
async def test_require_plan_consultant_satisfies_all():
    """Consultant plan satisfies all plan requirements."""
    user = _make_user("consultant")
    for required in ("starter", "growth", "professional", "consultant"):
        check_fn = require_plan(required)
        result = await check_fn(user=user)
        assert result.plan == "consultant"


# ── get_current_user ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_invalid_jwt_returns_401():
    """Invalid JWT → 401 Unauthorized."""
    from auth import get_current_user

    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="invalid.jwt.token")

    mock_client = MagicMock()
    mock_client.auth.get_user.return_value = MagicMock(user=None)

    with patch("auth.create_client", return_value=mock_client):
        with pytest.raises(HTTPException) as exc:
            await get_current_user(credentials)
        assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_valid_jwt_returns_user_profile():
    """Valid JWT → UserProfile with correct fields."""
    from auth import get_current_user

    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid.jwt.token")

    mock_user = MagicMock()
    mock_user.id = "u-123"
    mock_client = MagicMock()
    mock_client.auth.get_user.return_value = MagicMock(user=mock_user)
    mock_client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
        "id": "u-123", "email": "test@example.com", "role": "sme_owner",
        "plan": "growth", "company_id": "co-456"
    }

    with patch("auth.create_client", return_value=mock_client):
        profile = await get_current_user(credentials)
        assert profile.id == "u-123"
        assert profile.plan == "growth"
        assert profile.role == "sme_owner"
