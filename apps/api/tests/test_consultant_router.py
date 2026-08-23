"""Consultant router — covers the endpoints the real Consultant Dashboard UI
now calls (previously all mock data client-side: CONSULTING_CLIENTS)."""
import sys, os
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("STRIPE_SECRET_KEY", "sk_test_dummy")
os.environ.setdefault("STRIPE_WEBHOOK_SECRET", "whsec_dummy")

CONSULTANT_USER = {"id": "cons-1", "email": "consultant@example.com", "role": "consultant", "plan": "consultant", "company_id": None}
SME_USER = {"id": "sme-1", "email": "sme@example.com", "role": "sme_owner", "plan": "growth", "company_id": "co-1"}


def _client_as(user_dict):
    from main import app
    from auth import get_current_user, UserProfile
    app.dependency_overrides[get_current_user] = lambda: UserProfile(**user_dict)
    return TestClient(app)


class FakeResult:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, data):
        self._data = data

    def __getattr__(self, name):
        return lambda *a, **k: self

    def execute(self):
        return FakeResult(self._data)


class FakeSupabase:
    def __init__(self, table_data: dict):
        self._table_data = table_data

    def table(self, name):
        return FakeQuery(self._table_data.get(name))


# ── GET /clients ──────────────────────────────────────────────

@patch("routers.consultant._supa")
def test_get_clients_returns_theme_scores_for_heatmap(mock_supa):
    """Regression: theme_scores used to be computed (for weakest_theme) but
    never returned, so the portfolio heat-map had nothing real to render."""
    mock_supa.return_value = FakeSupabase({
        "consultant_clients": [{"company_id": "co-1", "status": "active", "notes": None, "created_at": "2026-01-01"}],
        "companies": [{"id": "co-1", "name": "Boulangerie Martin", "sector_group": "retail", "industry_id": None}],
        "score_snapshots": [{
            "company_id": "co-1", "overall_score": 3.2, "pillar_e": 3.0, "pillar_s": 3.5, "pillar_g": 3.1,
            "theme_scores": {"climate_transition": 2.0, "data_privacy": 4.5},
            "created_at": "2026-08-20T00:00:00Z",
        }],
    })
    client = _client_as(CONSULTANT_USER)
    response = client.get("/api/consultant/clients")
    assert response.status_code == 200
    data = response.json()["clients"][0]
    assert data["theme_scores"] == {"climate_transition": 2.0, "data_privacy": 4.5}
    assert data["weakest_theme"] == "climate_transition"
    assert data["has_assessment"] is True


@patch("routers.consultant._supa")
def test_get_clients_with_no_assessment_yet(mock_supa):
    mock_supa.return_value = FakeSupabase({
        "consultant_clients": [{"company_id": "co-2", "status": "active", "notes": None, "created_at": "2026-01-01"}],
        "companies": [{"id": "co-2", "name": "New Client SARL", "sector_group": "services", "industry_id": None}],
        "score_snapshots": [],
    })
    client = _client_as(CONSULTANT_USER)
    response = client.get("/api/consultant/clients")
    assert response.status_code == 200
    data = response.json()["clients"][0]
    assert data["has_assessment"] is False
    assert data["overall_score"] is None
    assert data["theme_scores"] == {}


@patch("routers.consultant._supa")
def test_get_clients_empty_portfolio(mock_supa):
    mock_supa.return_value = FakeSupabase({"consultant_clients": []})
    client = _client_as(CONSULTANT_USER)
    response = client.get("/api/consultant/clients")
    assert response.status_code == 200
    assert response.json() == {"clients": []}


def test_get_clients_as_sme_owner_returns_403():
    client = _client_as(SME_USER)
    response = client.get("/api/consultant/clients")
    assert response.status_code == 403


# ── invite / remove ───────────────────────────────────────────

@patch("routers.consultant._supa")
def test_invite_client(mock_supa):
    mock_supa.return_value = MagicMock()
    client = _client_as(CONSULTANT_USER)
    response = client.post("/api/consultant/clients/invite", json={"email": "new@client.com", "company_name": "New Co"})
    assert response.status_code == 201
    assert response.json()["email"] == "new@client.com"


@patch("routers.consultant._supa")
def test_remove_client_archives_not_deletes(mock_supa):
    mock_client = MagicMock()
    mock_supa.return_value = mock_client
    client = _client_as(CONSULTANT_USER)
    response = client.delete("/api/consultant/clients/co-1")
    assert response.status_code == 200
    mock_client.table.return_value.update.assert_called_once_with({"status": "archived"})


# ── API keys ──────────────────────────────────────────────────

@patch("routers.consultant._supa")
def test_get_api_key_none_yet(mock_supa):
    mock_supa.return_value = FakeSupabase({"api_keys": []})
    client = _client_as(CONSULTANT_USER)
    response = client.get("/api/consultant/api-keys")
    assert response.status_code == 200
    assert response.json() == {"key": None}


@patch("routers.consultant._supa")
def test_get_api_key_existing_is_masked(mock_supa):
    mock_supa.return_value = FakeSupabase({
        "api_keys": [{"id": "key-1", "label": "Default", "last_used_at": "2026-08-20T00:00:00Z",
                       "created_at": "2026-08-01T00:00:00Z", "key_hash": "hashed"}],
    })
    client = _client_as(CONSULTANT_USER)
    response = client.get("/api/consultant/api-keys")
    assert response.status_code == 200
    data = response.json()
    assert data["key_id"] == "key-1"
    assert "•" in data["masked"]
    assert "hashed" not in data["masked"]


@patch("routers.consultant._supa")
def test_rotate_api_key_returns_raw_key_once(mock_supa):
    mock_supa.return_value = MagicMock()
    client = _client_as(CONSULTANT_USER)
    response = client.post("/api/consultant/api-keys/rotate")
    assert response.status_code == 200
    data = response.json()
    assert data["new_key"].startswith("ne_live_")


# ── Bulk reports ──────────────────────────────────────────────

@patch("routers.consultant._supa")
def test_bulk_reports_queues_one_task_per_client_with_a_snapshot(mock_supa):
    mock_supa.return_value = FakeSupabase({
        "score_snapshots": [{"id": "snap-1"}],
    })
    with patch("tasks.celery_app") as mock_celery:
        client = _client_as(CONSULTANT_USER)
        response = client.post("/api/consultant/bulk-reports", json={"client_ids": ["co-1", "co-2"], "framework": "CSRD", "language": "fr"})
        assert response.status_code == 200
        data = response.json()
        assert data["client_count"] == 2
        assert mock_celery.send_task.call_count == 2


@patch("routers.consultant._supa")
def test_bulk_report_status(mock_supa):
    mock_supa.return_value = FakeSupabase({
        "reports": [{"company_id": "co-1", "status": "ready", "file_url": "https://example.com/r.pdf", "created_at": "2026-08-22T00:00:00Z"}],
    })
    client = _client_as(CONSULTANT_USER)
    response = client.get("/api/consultant/bulk-reports/job-1")
    assert response.status_code == 200
    assert len(response.json()["reports"]) == 1
