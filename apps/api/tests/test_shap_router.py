"""GET /api/shap/results/{snapshot_id} and db.get_shap_result() —
regression coverage for the maybe_single() fix. Before this fix,
get_shap_result() used .single(), which raises
postgrest.exceptions.APIError ("PGRST116: 0 rows") instead of
returning None whenever SHAP genuinely hadn't finished computing yet
for a snapshot — a completely normal, expected state (every caller
already checks the return value for falsy and treats it as "pending").
This meant GET /api/shap/results/{id} 500'd instead of returning
{"status": "pending"} any time it was called before SHAP finished,
and routers.reports._build_recommendations crashed report generation
the same way.
"""
import sys, os
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("STRIPE_SECRET_KEY", "sk_test_dummy")
os.environ.setdefault("STRIPE_WEBHOOK_SECRET", "whsec_dummy")

PROFESSIONAL_USER = {"id": "user-1", "email": "pro@example.com", "role": "sme_owner",
                      "plan": "professional", "company_id": "co-1"}
STARTER_USER = {"id": "user-2", "email": "starter@example.com", "role": "sme_owner",
                 "plan": "starter", "company_id": "co-2"}


def _client_as(user_dict):
    from main import app
    from auth import get_current_user, UserProfile
    app.dependency_overrides[get_current_user] = lambda: UserProfile(**user_dict)
    return TestClient(app)


@patch("db.get_redis")
@patch("db._supa")
def test_get_shap_result_returns_none_when_no_row_exists(mock_supa, mock_redis):
    """Direct unit test of the maybe_single() fix: simulates postgrest's
    real 0-rows behavior (execute() returns None) rather than mocking
    around it."""
    from db import get_shap_result
    mock_redis.return_value = MagicMock()
    mock_redis.return_value.get.return_value = None  # cache miss

    mock_client = MagicMock()
    mock_client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = None
    mock_supa.return_value = mock_client

    assert get_shap_result("nonexistent-snapshot") is None


@patch("routers.shap.get_shap_result", return_value=None)
def test_shap_endpoint_returns_pending_not_500_when_not_computed(mock_get):
    client = _client_as(PROFESSIONAL_USER)
    response = client.get("/api/shap/results/snap-1")
    assert response.status_code == 200
    assert response.json()["status"] == "pending"


@patch("routers.shap.get_shap_result")
def test_shap_endpoint_returns_ready_with_real_data(mock_get):
    mock_get.return_value = {
        "base_value": 2.5,
        "shap_values": {"climate_transition_q1": 0.3},
        "top_drivers": [{"question_id": "climate_transition_q1", "impact": 0.3, "direction": "positive"}],
    }
    client = _client_as(PROFESSIONAL_USER)
    response = client.get("/api/shap/results/snap-1")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["shap_values"] == {"climate_transition_q1": 0.3}


def test_shap_endpoint_requires_professional_plan():
    client = _client_as(STARTER_USER)
    response = client.get("/api/shap/results/snap-1")
    assert response.status_code == 403
