"""POST /api/questionnaire/answers — regression coverage for the bulk-upsert
endpoint. Before this, the questionnaire UI saved every answer as its own
request (Questionnaire.tsx's per-theme flush, and its final submit's
Promise.all over every answered question) — up to ~47 individual requests
for a full submit, each paying its own get_current_user round-trip on top
of a single-row upsert. This endpoint replaces that fan-out with one
request that upserts every row in a single call."""
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


@patch("routers.questionnaire._supa")
def test_bulk_upsert_saves_all_answers_in_one_call(mock_supa):
    mock_client = MagicMock()
    upserted_rows = [
        {"question_id": "climate_transition_q1", "answer_value": True},
        {"question_id": "climate_transition_q2", "answer_value": 42},
    ]
    mock_client.table.return_value.upsert.return_value.execute.return_value.data = upserted_rows
    mock_supa.return_value = mock_client

    client = _client()
    response = client.post("/api/questionnaire/answers", json={
        "answers": [
            {"question_id": "climate_transition_q1", "theme_id": "climate_transition", "answer_value": True},
            {"question_id": "climate_transition_q2", "theme_id": "climate_transition", "answer_value": 42},
        ]
    })
    assert response.status_code == 201
    assert response.json() == {"status": "saved", "count": 2}

    # Exactly one upsert call, carrying every row — not one call per answer.
    assert mock_client.table.return_value.upsert.call_count == 1
    upserted_arg = mock_client.table.return_value.upsert.call_args[0][0]
    assert len(upserted_arg) == 2
    assert {r["question_id"] for r in upserted_arg} == {"climate_transition_q1", "climate_transition_q2"}
    assert all(r["company_id"] == "co-1" for r in upserted_arg)


@patch("routers.questionnaire._supa")
def test_bulk_upsert_empty_list_returns_zero_without_calling_db(mock_supa):
    mock_client = MagicMock()
    mock_supa.return_value = mock_client

    client = _client()
    response = client.post("/api/questionnaire/answers", json={"answers": []})
    assert response.status_code == 201
    assert response.json() == {"status": "saved", "count": 0}
    mock_client.table.assert_not_called()


def test_bulk_upsert_no_company_returns_400():
    from main import app
    from auth import get_current_user, UserProfile
    no_company_user = {**MOCK_USER, "company_id": None}
    app.dependency_overrides[get_current_user] = lambda: UserProfile(**no_company_user)
    client = TestClient(app)
    response = client.post("/api/questionnaire/answers", json={
        "answers": [{"question_id": "q1", "theme_id": "t1", "answer_value": True}]
    })
    assert response.status_code == 400
