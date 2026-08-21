"""_build_recommendations() — replaces the fixed MOCK_RECS list in
routers/reports.py with real recommendations derived from a snapshot's
actual SHAP values."""
import sys, os
from unittest.mock import patch
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("STRIPE_SECRET_KEY", "sk_test_dummy")
os.environ.setdefault("STRIPE_WEBHOOK_SECRET", "whsec_dummy")


def _shap_result(shap_values):
    return {"status": "ready", "baseline_score": 2.5, "shap_values": shap_values, "top_drivers": []}


@patch("db.get_shap_result", return_value=None)
def test_returns_empty_list_when_shap_not_ready(mock_get):
    from routers.reports import _build_recommendations
    assert _build_recommendations("snap-1", "fr") == []


@patch("db.get_shap_result", return_value={"status": "pending"})
def test_returns_empty_list_when_shap_values_missing(mock_get):
    from routers.reports import _build_recommendations
    assert _build_recommendations("snap-1", "fr") == []


@patch("db.get_shap_result")
def test_capping_question_gets_gateway_message(mock_get):
    from routers.reports import _build_recommendations
    mock_get.return_value = _shap_result({"climate_transition_q1": -0.42})  # theme's capping question
    recs = _build_recommendations("snap-1", "fr")
    assert len(recs) == 1
    assert "plafonnement" in recs[0]["action"]
    assert recs[0]["scoreImpact"] == 0.42
    assert recs[0]["csrdMapping"] == "ESRS E1"
    assert recs[0]["effort"] == "Facile"


@patch("db.get_shap_result")
def test_non_capping_performance_question_gets_generic_message_and_hard_effort(mock_get):
    from routers.reports import _build_recommendations
    mock_get.return_value = _shap_result({"climate_transition_q2": -0.2})  # numeric performance, not capping
    recs = _build_recommendations("snap-1", "fr")
    assert len(recs) == 1
    assert "plafonnement" not in recs[0]["action"]
    assert recs[0]["effort"] == "Difficile"


@patch("db.get_shap_result")
def test_positive_contributions_excluded(mock_get):
    from routers.reports import _build_recommendations
    mock_get.return_value = _shap_result({"climate_transition_q1": 0.3, "climate_transition_q2": -0.1})
    recs = _build_recommendations("snap-1", "fr")
    assert len(recs) == 1
    assert recs[0]["scoreImpact"] == 0.1


@patch("db.get_shap_result")
def test_sorted_most_negative_first_and_limited(mock_get):
    from routers.reports import _build_recommendations
    mock_get.return_value = _shap_result({
        "climate_transition_q1": -0.1,
        "board_governance_q1": -0.5,
        "ethics_anticorruption_q1": -0.3,
    })
    recs = _build_recommendations("snap-1", "fr", limit=2)
    assert len(recs) == 2
    assert recs[0]["scoreImpact"] == 0.5
    assert recs[1]["scoreImpact"] == 0.3


@patch("db.get_shap_result")
def test_english_language_variant(mock_get):
    from routers.reports import _build_recommendations
    mock_get.return_value = _shap_result({"climate_transition_q1": -0.42})
    recs = _build_recommendations("snap-1", "en")
    assert "gateway" in recs[0]["action"]
    assert recs[0]["effort"] == "Easy"


@patch("db.get_shap_result")
def test_unknown_question_id_skipped_without_crashing(mock_get):
    from routers.reports import _build_recommendations
    mock_get.return_value = _shap_result({"totally_made_up_question": -0.9})
    assert _build_recommendations("snap-1", "fr") == []
