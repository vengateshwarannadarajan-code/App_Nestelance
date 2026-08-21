"""Billing router — regression coverage for Stripe errors that used to
crash with a raw unhandled 500 instead of a clean HTTPException.
Surfaced live: STRIPE_PRICE_* set to a Product id instead of a Price
id raised stripe.error.InvalidRequestError inside create_checkout,
which nothing caught."""
import sys, os
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("STRIPE_SECRET_KEY", "sk_test_dummy")
os.environ.setdefault("STRIPE_WEBHOOK_SECRET", "whsec_dummy")

MOCK_USER = {"id": "user-1", "email": "test@example.com", "role": "sme_owner", "plan": "starter", "company_id": "co-1"}


def _client():
    from main import app
    from auth import get_current_user, UserProfile
    app.dependency_overrides[get_current_user] = lambda: UserProfile(**MOCK_USER)
    return TestClient(app)


def _supa_with_customer_id(customer_id):
    mock_client = MagicMock()
    mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        {"stripe_customer_id": customer_id} if customer_id else {}
    )
    return mock_client


@patch("routers.billing._supa")
def test_checkout_unknown_plan_returns_400(mock_supa):
    client = _client()
    response = client.post("/api/billing/checkout", json={"plan": "not-a-real-plan"})
    assert response.status_code == 400


@patch("routers.billing._supa")
def test_checkout_downgrade_returns_400(mock_supa):
    starter_user = {**MOCK_USER, "plan": "professional"}
    from main import app
    from auth import get_current_user, UserProfile
    app.dependency_overrides[get_current_user] = lambda: UserProfile(**starter_user)
    client = TestClient(app)
    response = client.post("/api/billing/checkout", json={"plan": "starter"})
    assert response.status_code == 400
    assert "downgrade" in response.json()["detail"].lower()


@patch("stripe.checkout.Session.create")
@patch("routers.billing._supa")
def test_checkout_stripe_error_returns_clean_502_not_raw_500(mock_supa, mock_create):
    import stripe
    mock_supa.return_value = _supa_with_customer_id(None)
    mock_create.side_effect = stripe.error.InvalidRequestError(
        "No such price: 'prod_V7DhzpEF6kcdAV'", param="price"
    )
    client = _client()
    response = client.post("/api/billing/checkout", json={"plan": "growth"})
    assert response.status_code == 502
    assert "No such price" in response.json()["detail"]


@patch("stripe.checkout.Session.create")
@patch("routers.billing._supa")
def test_checkout_success_returns_url(mock_supa, mock_create):
    mock_supa.return_value = _supa_with_customer_id(None)
    mock_create.return_value = MagicMock(url="https://checkout.stripe.com/session/xyz")
    client = _client()
    response = client.post("/api/billing/checkout", json={"plan": "growth"})
    assert response.status_code == 200
    assert response.json()["checkout_url"] == "https://checkout.stripe.com/session/xyz"


@patch("stripe.billing_portal.Session.create")
@patch("routers.billing._supa")
def test_portal_stripe_error_returns_clean_502(mock_supa, mock_create):
    import stripe
    mock_supa.return_value = _supa_with_customer_id("cus_123")
    mock_create.side_effect = stripe.error.InvalidRequestError("No such customer: 'cus_123'", param="customer")
    client = _client()
    response = client.get("/api/billing/portal")
    assert response.status_code == 502


def test_portal_no_customer_returns_400():
    with patch("routers.billing._supa") as mock_supa:
        mock_supa.return_value = _supa_with_customer_id(None)
        client = _client()
        response = client.get("/api/billing/portal")
        assert response.status_code == 400


@patch("stripe.Invoice.list")
@patch("routers.billing._supa")
def test_invoices_stripe_error_returns_clean_502(mock_supa, mock_list):
    import stripe
    mock_supa.return_value = _supa_with_customer_id("cus_123")
    mock_list.side_effect = stripe.error.APIConnectionError("Network error")
    client = _client()
    response = client.get("/api/billing/invoices")
    assert response.status_code == 502


def test_invoices_no_customer_returns_empty_list():
    with patch("routers.billing._supa") as mock_supa:
        mock_supa.return_value = _supa_with_customer_id(None)
        client = _client()
        response = client.get("/api/billing/invoices")
        assert response.status_code == 200
        assert response.json() == {"invoices": []}
