"""Compliance Simulator router — regression coverage for the same
missing peer-percentile normalisation fixed in routers/scoring.py
(see tests/test_peer_benchmark.py and
test_large_numeric_answer_does_not_saturate_theme_score in
test_scoring_router.py for the full explanation)."""
import sys, os
from unittest.mock import patch
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("STRIPE_SECRET_KEY", "sk_test_dummy")
os.environ.setdefault("STRIPE_WEBHOOK_SECRET", "whsec_dummy")

MOCK_USER = {"id": "user-123", "email": "test@example.com", "role": "sme_owner", "plan": "growth", "company_id": "co-456"}


def _get_client():
    from main import app
    from auth import get_current_user, UserProfile
    app.dependency_overrides[get_current_user] = lambda: UserProfile(**MOCK_USER)
    return TestClient(app)


def test_simulate_baseline_does_not_saturate_from_large_raw_value():
    client = _get_client()
    request = {
        "base_responses": {
            "climate_transition_q1": True,
            "climate_transition_q2": 999999.0,
        },
        "previous_responses": {},
        "actions": [],
        "sector": "manufacturing",
        "horizon_months": 6,
    }
    response = client.post("/api/simulate/", json=request)
    assert response.status_code == 200
    data = response.json()
    assert 0.0 <= data["baseline_score"] <= 5.0
    # With the fix, mostly-unanswered questions shouldn't push month-0
    # overall score anywhere near the top of the range.
    assert data["baseline_score"] < 3.0, f"Expected a moderate baseline, got {data['baseline_score']} (looks saturated)"


def test_simulate_month_zero_matches_baseline():
    client = _get_client()
    request = {
        "base_responses": {"board_governance_q1": True},
        "previous_responses": {},
        "actions": [],
        "sector": "services",
        "horizon_months": 6,
    }
    response = client.post("/api/simulate/", json=request)
    assert response.status_code == 200
    data = response.json()
    assert data["monthly_projections"]["0"]["overall_score"] == data["baseline_score"]


def test_simulate_requires_growth_plan():
    from main import app
    from auth import get_current_user, UserProfile
    starter_user = {**MOCK_USER, "plan": "starter"}
    app.dependency_overrides[get_current_user] = lambda: UserProfile(**starter_user)
    client = TestClient(app)
    response = client.post("/api/simulate/", json={
        "base_responses": {}, "actions": [], "sector": "services", "horizon_months": 6,
    })
    assert response.status_code == 403
