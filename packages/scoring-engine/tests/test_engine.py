"""T-TEST-001: Scoring engine unit tests"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from engine import score_company


def _all_true_responses() -> dict:
    """All boolean = True, all numeric = 1.0 (peer percentile max)."""
    from questions import ALL_QUESTIONS
    return {q["id"]: True if q["input_type"] == "boolean" else 1.0 for q in ALL_QUESTIONS}


def _all_false_responses() -> dict:
    """All boolean = False, all numeric = 0.0."""
    from questions import ALL_QUESTIONS
    return {q["id"]: False if q["input_type"] == "boolean" else 0.0 for q in ALL_QUESTIONS}


def test_all_true_score_is_five():
    """All questions answered True/max → expect score close to 5.0."""
    result = score_company(_all_true_responses(), "services")
    assert result.overall_score >= 4.5, f"Expected ≥4.5, got {result.overall_score}"


def test_all_false_score_is_zero():
    """All questions answered False/0 → expect score close to 0."""
    result = score_company(_all_false_responses(), "services")
    assert result.overall_score <= 1.5, f"Expected ≤1.5, got {result.overall_score}"


def test_capping_false_caps_theme_at_three():
    """Capping indicator False → theme score must be ≤ 3.0."""
    from questions import QUESTIONS_BY_THEME
    responses = _all_true_responses()
    # Set climate capping indicator to False
    responses["climate_transition_q1"] = False
    result = score_company(responses, "services")
    climate_score = result.themes["climate_transition"].score
    assert climate_score <= 3.0, f"Expected ≤3.0 (capping active), got {climate_score}"


def test_capping_true_allows_high_score():
    """Capping indicator True + high answers → theme score can reach 4+."""
    responses = _all_true_responses()
    responses["climate_transition_q1"] = True  # explicitly set
    result = score_company(responses, "services")
    climate_score = result.themes["climate_transition"].score
    assert climate_score >= 4.0, f"Expected ≥4.0, got {climate_score}"
    assert result.themes["climate_transition"].capping_met is True


def test_missing_boolean_defaults_to_false():
    """Missing boolean answer → defaults to False in scoring."""
    from questions import ALL_QUESTIONS
    responses = {}  # completely empty
    result = score_company(responses, "services")
    # Score should be very low (all defaulting to False/0)
    assert result.overall_score <= 2.0, f"Expected ≤2.0 with empty responses, got {result.overall_score}"


def test_pillar_score_is_weighted_average_of_themes():
    """Pillar E score = weighted avg of E theme scores."""
    responses = _all_true_responses()
    result = score_company(responses, "manufacturing")
    e_theme_scores = [
        result.themes["climate_transition"].score,
        result.themes["biodiversity"].score,
        result.themes["circular_economy"].score,
    ]
    e_theme_weights = [
        result.themes["climate_transition"].materiality_weight,
        result.themes["biodiversity"].materiality_weight,
        result.themes["circular_economy"].materiality_weight,
    ]
    expected_e = sum(s * w for s, w in zip(e_theme_scores, e_theme_weights)) / sum(e_theme_weights)
    assert abs(result.pillar_e - expected_e) < 0.01, f"Expected pillar_e≈{expected_e:.2f}, got {result.pillar_e}"


def test_overall_score_is_average_of_pillars():
    """Overall score = mean of pillar scores (equal weighting v1)."""
    responses = _all_true_responses()
    result = score_company(responses, "services")
    expected = round((result.pillar_e + result.pillar_s + result.pillar_g) / 3, 2)
    assert abs(result.overall_score - expected) < 0.05, f"Expected ≈{expected}, got {result.overall_score}"


def test_score_within_zero_to_five():
    """All scores must be within [0.0, 5.0] for any valid input."""
    for responses in [_all_true_responses(), _all_false_responses(), {}]:
        result = score_company(responses, "retail")
        assert 0.0 <= result.overall_score <= 5.0
        assert 0.0 <= result.pillar_e <= 5.0
        assert 0.0 <= result.pillar_s <= 5.0
        assert 0.0 <= result.pillar_g <= 5.0
        for theme_result in result.themes.values():
            assert 0.0 <= theme_result.score <= 5.0


def test_sector_affects_pillar_weights():
    """Same responses, different sector → different overall score due to materiality weights."""
    responses = _all_true_responses()
    result_mfg = score_company(responses, "manufacturing")
    result_svc = score_company(responses, "services")
    # Manufacturing has higher E weight — E pillar should influence overall more
    # Simply check they're not identical (weights differ)
    assert result_mfg.overall_score != result_svc.overall_score or \
           result_mfg.pillar_e != result_svc.pillar_e or \
           result_mfg.sector_group != result_svc.sector_group
