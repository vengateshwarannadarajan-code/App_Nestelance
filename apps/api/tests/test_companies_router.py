"""POST /api/companies — regression coverage for the idempotency fix.

Live-diagnosed: a user kept ending up with a new company_id every time they
re-visited /onboarding/profile (a stale link, the demo-nav menu, a browser
back button, or a companyId not yet synced on a fresh tab). The endpoint
unconditionally minted a new organizations+companies row and repointed
users.company_id every time it was hit, orphaning the previous company and
every snapshot/answer/report tied to it. It must now return the user's
existing company instead of creating a duplicate."""
import sys, os
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("STRIPE_SECRET_KEY", "sk_test_dummy")
os.environ.setdefault("STRIPE_WEBHOOK_SECRET", "whsec_dummy")

NEW_COMPANY_REQUEST = {
    "name": "Martin SARL",
    "country": "France",
    "revenue_band": "1m-10m",
    "eu_supply_chain_pct": 35.0,
}


def _client_as(company_id):
    from main import app
    from auth import get_current_user, UserProfile
    user = {"id": "user-1", "email": "test@example.com", "role": "sme_owner", "plan": "starter", "company_id": company_id}
    app.dependency_overrides[get_current_user] = lambda: UserProfile(**user)
    return TestClient(app)


@patch("routers.companies._supa")
def test_repeat_onboarding_returns_existing_company_not_a_duplicate(mock_supa):
    mock_client = MagicMock()
    existing_company = {"id": "co-existing", "name": "Already Onboarded SARL", "org_id": "org-existing"}
    mock_client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = existing_company
    mock_supa.return_value = mock_client

    client = _client_as("co-existing")
    response = client.post("/api/companies", json=NEW_COMPANY_REQUEST)
    assert response.status_code == 200
    assert response.json() == existing_company

    # The whole point: no new organizations/companies row gets inserted.
    mock_client.table.return_value.insert.assert_not_called()


@patch("routers.companies._supa")
def test_first_time_onboarding_creates_a_new_company(mock_supa):
    mock_client = MagicMock()
    org_row = {"id": "org-new"}
    company_row = {"id": "co-new", "name": "Martin SARL", "org_id": "org-new"}
    mock_client.table.return_value.insert.return_value.execute.side_effect = [
        MagicMock(data=[org_row]),
        MagicMock(data=[company_row]),
    ]
    mock_supa.return_value = mock_client

    client = _client_as(None)  # no company yet
    response = client.post("/api/companies", json=NEW_COMPANY_REQUEST)
    assert response.status_code == 201
    data = response.json()
    assert data["id"] == "co-new"
    assert data["org_id"] == "org-new"
