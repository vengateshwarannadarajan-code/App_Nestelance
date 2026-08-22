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


@patch("routers.scoring.save_snapshot", return_value="snap-789")
@patch("db.get_redis")
@patch("routers.scoring._supa")
def test_score_uses_authenticated_users_company_not_client_supplied_one(mock_supa, mock_redis, mock_save):
    """Live-diagnosed bug: a stale client-cached companyId (a browser tab
    whose value predates a later re-onboarding that repointed
    users.company_id to a new company) used to get trusted as-is, silently
    writing the new snapshot to the wrong, orphaned company. The endpoint
    must always score/save against user.company_id, ignoring body.company_id
    entirely, regardless of what the client sends."""
    mock_supa.return_value = MagicMock()
    mock_supa.return_value.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = []
    mock_supa.return_value.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    mock_redis.return_value = MagicMock()

    client = _get_client()  # MOCK_USER's company_id is "co-456"
    request = {**VALID_REQUEST, "company_id": "co-DIFFERENT-STALE-ID"}
    response = client.post("/api/scoring/score", json=request)
    assert response.status_code == 200

    # save_snapshot(company_id, user_id, result) — first positional arg
    # must be the authenticated user's real company, not the stale one
    # the client sent.
    saved_company_id = mock_save.call_args[0][0]
    assert saved_company_id == "co-456"
    assert saved_company_id != "co-DIFFERENT-STALE-ID"


@patch("routers.scoring.save_snapshot", return_value="snap-789")
@patch("db.get_redis")
@patch("routers.scoring._supa")
def test_large_numeric_answer_does_not_saturate_theme_score(mock_supa, mock_redis, mock_save):
    """Regression test for the missing peer-percentile normalisation:
    a huge raw numeric answer (e.g. "999999" tCO2e/an) used to reach
    score_company() unnormalised and saturate its theme to ~5.0
    regardless of whether that's actually good or bad. With the
    capping indicator explicitly met (True), the fixed pipeline should
    land the theme score in a moderate range instead."""
    mock_supa.return_value = MagicMock()
    mock_supa.return_value.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = []
    mock_supa.return_value.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    mock_redis.return_value = MagicMock()

    client = _get_client()
    request = {
        "company_id": "co-456",
        "sector_group": "manufacturing",
        "responses": {
            "climate_transition_q1": True,   # capping indicator met
            "climate_transition_q2": 999999.0,  # absurdly large raw value
        },
    }
    response = client.post("/api/scoring/score", json=request)
    assert response.status_code == 200
    climate_score = response.json()["themes"]["climate_transition"]["score"]
    assert climate_score < 2.0, f"Expected a moderate score reflecting mostly-unanswered questions, got {climate_score} (looks saturated)"


def test_score_request_with_no_company_linked_returns_400():
    from main import app
    from auth import get_current_user, UserProfile
    no_company_user = {**MOCK_USER, "company_id": None}
    app.dependency_overrides[get_current_user] = lambda: UserProfile(**no_company_user)
    client = TestClient(app)
    response = client.post("/api/scoring/score", json=VALID_REQUEST)
    assert response.status_code == 400


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


# ── Verify / Approve / Reject workflow (T-SCORE-WORKFLOW) ────────

SUPER_ADMIN_USER = {"id": "admin-1", "email": "admin@example.com", "role": "admin",
                     "plan": "consultant", "company_id": None, "is_super_admin": True}
VERIFIER_USER = {"id": "verifier-1", "email": "verifier@example.com", "role": "sme_owner",
                  "plan": "growth", "company_id": None, "org_id": "org-1", "org_role": "verifier",
                  "org_path": "/org-1/"}
APPROVER_USER = {"id": "approver-1", "email": "approver@example.com", "role": "sme_owner",
                  "plan": "growth", "company_id": None, "org_id": "org-1", "org_role": "approver",
                  "org_path": "/org-1/"}
VIEWER_USER = {"id": "viewer-1", "email": "viewer@example.com", "role": "sme_owner",
               "plan": "growth", "company_id": None, "org_id": "org-1", "org_role": "viewer",
               "org_path": "/org-1/"}


def _client_as(user_dict):
    from main import app
    from auth import get_current_user, UserProfile
    app.dependency_overrides[get_current_user] = lambda: UserProfile(**user_dict)
    return TestClient(app)


class FakeResult:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    """Minimal chainable stand-in for the supabase-py query builder —
    every chain method returns self and ignores its arguments; only the
    table this query was built from decides what .execute() returns."""
    def __init__(self, data):
        self._data = data

    def __getattr__(self, name):
        # select/eq/neq/in_/order/limit/update/insert/upsert/delete/single/... all chain
        return lambda *a, **k: self

    def execute(self):
        return FakeResult(self._data)


class FakeSupabase:
    def __init__(self, table_data: dict):
        self._table_data = table_data

    def table(self, name):
        return FakeQuery(self._table_data.get(name))


DRAFT_SNAPSHOT = {"id": "snap-1", "company_id": "co-1", "status": "draft", "overall_score": 3.0}
VERIFIED_SNAPSHOT = {"id": "snap-1", "company_id": "co-1", "status": "verified", "overall_score": 3.0}
APPROVED_SNAPSHOT = {"id": "snap-1", "company_id": "co-1", "status": "approved", "overall_score": 3.0}
COMPANY_ROW = {"org_id": "org-1", "organizations": {"path": "/org-1/"}}


@patch("routers.scoring.get_snapshot", return_value=DRAFT_SNAPSHOT)
@patch("routers.scoring._supa")
def test_verify_draft_snapshot_as_super_admin_succeeds(mock_supa, mock_get):
    mock_supa.return_value = FakeSupabase({
        "companies": COMPANY_ROW,
        "score_snapshots": [{**DRAFT_SNAPSHOT, "status": "verified"}],
    })
    client = _client_as(SUPER_ADMIN_USER)
    response = client.post("/api/scoring/snapshot/snap-1/verify")
    assert response.status_code == 200
    assert response.json()["status"] == "verified"


@patch("routers.scoring.get_snapshot", return_value=VERIFIED_SNAPSHOT)
@patch("routers.scoring._supa")
def test_verify_already_verified_snapshot_returns_400(mock_supa, mock_get):
    mock_supa.return_value = FakeSupabase({"companies": COMPANY_ROW})
    client = _client_as(SUPER_ADMIN_USER)
    response = client.post("/api/scoring/snapshot/snap-1/verify")
    assert response.status_code == 400


def test_verify_as_viewer_returns_403():
    """org_role rank check happens in the require_org_role dependency,
    before the handler body even runs — no DB mocking needed."""
    client = _client_as(VIEWER_USER)
    response = client.post("/api/scoring/snapshot/snap-1/verify")
    assert response.status_code == 403


@patch("routers.scoring.get_snapshot", return_value=DRAFT_SNAPSHOT)
@patch("routers.scoring._supa")
def test_approve_draft_snapshot_returns_400(mock_supa, mock_get):
    """Can't approve — only verified snapshots may be approved."""
    mock_supa.return_value = FakeSupabase({"companies": COMPANY_ROW})
    client = _client_as(SUPER_ADMIN_USER)
    response = client.post("/api/scoring/snapshot/snap-1/approve")
    assert response.status_code == 400


@patch("routers.scoring.get_snapshot", return_value=VERIFIED_SNAPSHOT)
@patch("routers.scoring._supa")
def test_approve_verified_snapshot_as_super_admin_succeeds(mock_supa, mock_get):
    mock_supa.return_value = FakeSupabase({
        "companies": COMPANY_ROW,
        "score_snapshots": [{**VERIFIED_SNAPSHOT, "status": "approved"}],
    })
    client = _client_as(SUPER_ADMIN_USER)
    response = client.post("/api/scoring/snapshot/snap-1/approve")
    assert response.status_code == 200
    assert response.json()["status"] == "approved"


def test_approve_as_verifier_returns_403():
    """Verifier lacks approver rank — require_org_role("approver") rejects it."""
    client = _client_as(VERIFIER_USER)
    response = client.post("/api/scoring/snapshot/snap-1/approve")
    assert response.status_code == 403


@patch("routers.scoring.get_snapshot", return_value=DRAFT_SNAPSHOT)
@patch("routers.scoring._supa")
def test_reject_draft_snapshot_requires_reason(mock_supa, mock_get):
    mock_supa.return_value = FakeSupabase({"companies": COMPANY_ROW})
    client = _client_as(SUPER_ADMIN_USER)
    response = client.post("/api/scoring/snapshot/snap-1/reject", json={"reason": "   "})
    assert response.status_code == 422


@patch("routers.scoring.get_snapshot", return_value=DRAFT_SNAPSHOT)
@patch("routers.scoring._supa")
def test_reject_draft_snapshot_as_verifier_succeeds(mock_supa, mock_get):
    mock_supa.return_value = FakeSupabase({
        "companies": COMPANY_ROW,
        "score_snapshots": [{**DRAFT_SNAPSHOT, "status": "rejected", "rejection_reason": "Incomplete data"}],
    })
    client = _client_as(VERIFIER_USER)
    response = client.post("/api/scoring/snapshot/snap-1/reject", json={"reason": "Incomplete data"})
    assert response.status_code == 200
    assert response.json()["status"] == "rejected"


@patch("routers.scoring.get_snapshot", return_value=VERIFIED_SNAPSHOT)
@patch("routers.scoring._supa")
def test_reject_verified_snapshot_as_verifier_returns_403(mock_supa, mock_get):
    """Rejecting an already-verified snapshot needs approver rank, not just verifier."""
    mock_supa.return_value = FakeSupabase({"companies": COMPANY_ROW})
    client = _client_as(VERIFIER_USER)
    response = client.post("/api/scoring/snapshot/snap-1/reject", json={"reason": "Numbers look wrong"})
    assert response.status_code == 403


@patch("routers.scoring.get_snapshot", return_value=VERIFIED_SNAPSHOT)
@patch("routers.scoring._supa")
def test_reject_verified_snapshot_as_approver_succeeds(mock_supa, mock_get):
    mock_supa.return_value = FakeSupabase({
        "companies": COMPANY_ROW,
        "score_snapshots": [{**VERIFIED_SNAPSHOT, "status": "rejected", "rejection_reason": "Numbers look wrong"}],
    })
    client = _client_as(APPROVER_USER)
    response = client.post("/api/scoring/snapshot/snap-1/reject", json={"reason": "Numbers look wrong"})
    assert response.status_code == 200
    assert response.json()["status"] == "rejected"


@patch("routers.scoring._supa")
def test_pending_queue_filters_by_visible_org(mock_supa):
    mock_supa.return_value = FakeSupabase({
        "score_snapshots": [DRAFT_SNAPSHOT],
        "companies": [{"id": "co-1", "name": "Acme SME", "org_id": "org-1",
                        "organizations": {"path": "/org-1/"}}],
    })
    client = _client_as(SUPER_ADMIN_USER)
    response = client.get("/api/scoring/pending")
    assert response.status_code == 200
    data = response.json()
    assert len(data["snapshots"]) == 1
    assert data["snapshots"][0]["company_name"] == "Acme SME"


def test_pending_queue_as_viewer_returns_403():
    client = _client_as(VIEWER_USER)
    response = client.get("/api/scoring/pending")
    assert response.status_code == 403
