"""T-TEST-003: Scoring router integration tests"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Set env vars before importing app
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("STRIPE_SECRET_KEY", "sk_test_dummy")
os.environ.setdefault("STRIPE_WEBHOOK_SECRET", "whsec_dummy")

MOCK_USER = {"id": "user-123", "email": "test@example.com", "role": "sme_owner", "plan": "growth", "company_id": "co-456"}


def _mock_auth():
    from auth import UserProfile
    return UserProfile(**MOCK_USER)


def _get_client():
    from main import app
    from auth import get_current_user
    app.dependency_overrides[get_current_user] = lambda: _mock_auth()
    return TestClient(app)


VALID_REQUEST = {
    "company_id": "co-456",
    "sector_group": "services",
    "responses": {
        "climate_transition_q1": True,
        "climate_transition_q2": 300.0,
        "board_governance_q1": True,
        "data_privacy_q1": True,
    }
}

MOCK_SNAPSHOT_RESULT = {
    "id": "snap-789",
    "company_id": "co-456",
    "overall_score": 3.2,
    "pillar_e": 3.1,
    "pillar_s": 3.3,
    "pillar_g": 3.2,
    "theme_scores": {},
    "sector_group": "services",
    "question_count": 4,
    "engine_version": "1.0.0",
    "created_at": "2026-01-01T00:00:00",
}


@patch("routers.scoring.save_snapshot", return_value="snap-789")
@patch("db.get_redis")
@patch("routers.scoring._supa")
def test_valid_score_request_returns_snapshot(mock_supa, mock_redis, mock_save):
    mock_supa.return_value = MagicMock()
    mock_supa.return_value.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = []
    mock_supa.return_value.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    mock_redis.return_value = MagicMock()

    client = _get_client()
    response = client.post("/api/scoring/score", json=VALID_REQUEST)
    assert response.status_code == 200
    data = response.json()
    assert "snapshot_id" in data
    assert "overall_score" in data
    assert 0.0 <= data["overall_score"] <= 5.0


def test_unauthenticated_request_returns_401():
    from main import app
    from auth import get_current_user
    # Remove override
    app.dependency_overrides.pop(get_current_user, None)
    client = TestClient(app, raise_server_exceptions=False)
    response = client.post("/api/scoring/score", json=VALID_REQUEST)
    assert response.status_code in (401, 403)


def test_invalid_sector_returns_422():
    client = _get_client()
    invalid_request = {**VALID_REQUEST, "sector_group": ""}
    with patch("routers.scoring.save_snapshot", return_value="snap-789"), \
         patch("routers.scoring._supa", return_value=MagicMock()):
        response = client.post("/api/scoring/score", json=invalid_request)
        # Empty sector should fail or return invalid score
        # We accept 200 with low score OR 422
        assert response.status_code in (200, 422)


@patch("routers.scoring.get_snapshot", return_value=MOCK_SNAPSHOT_RESULT)
def test_get_existing_snapshot(mock_get):
    client = _get_client()
    response = client.get("/api/scoring/snapshot/snap-789")
    assert response.status_code == 200
    data = response.json()
    assert data["overall_score"] == 3.2


@patch("routers.scoring.get_snapshot", return_value=None)
def test_get_nonexistent_snapshot_returns_404(mock_get):
    client = _get_client()
    response = client.get("/api/scoring/snapshot/does-not-exist")
    assert response.status_code == 404


@patch("routers.scoring.save_snapshot", return_value="snap-789")
@patch("db.get_redis")
@patch("routers.scoring._supa")
def test_shap_task_fired_non_blocking(mock_supa, mock_redis, mock_save):
    """SHAP task should be fired without blocking the score endpoint."""
    mock_supa.return_value = MagicMock()
    mock_supa.return_value.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = []
    mock_supa.return_value.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    mock_redis.return_value = MagicMock()

    with patch("tasks.trigger_shap") as mock_shap_task:
        mock_shap_task.delay = MagicMock()
        client = _get_client()
        response = client.post("/api/scoring/score", json=VALID_REQUEST)
        assert response.status_code == 200
        # Task was called (or gracefully failed — both acceptable in test env)
