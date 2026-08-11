"""T-TEST-002: Buffer rule unit tests"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from buffer_rule import apply_buffer_rule


def test_buffer_applied_when_previously_met_and_in_buffer_zone():
    """Company previously met threshold, now within 10 percentile pts → buffer applied."""
    current = {"climate_transition_q2": 380.0}
    previous = {"climate_transition_q2": 420.0}
    peer_pcts = {
        "climate_transition_q2": 0.93,       # current: in buffer zone (0.90–1.0)
        "_prev_climate_transition_q2": 0.96, # previously met threshold
    }
    result = apply_buffer_rule(current, previous, peer_pcts)
    # Buffer should preserve previous value
    assert result.get("_buffer_applied_climate_transition_q2") is True
    assert result["climate_transition_q2"] == 420.0


def test_no_buffer_when_below_buffer_zone():
    """Company previously met threshold, now BELOW buffer zone → no buffer applied."""
    current = {"climate_transition_q2": 200.0}
    previous = {"climate_transition_q2": 420.0}
    peer_pcts = {
        "climate_transition_q2": 0.40,       # well below buffer zone
        "_prev_climate_transition_q2": 0.96,
    }
    result = apply_buffer_rule(current, previous, peer_pcts)
    # No buffer — degradation is too large
    assert "_buffer_applied_climate_transition_q2" not in result
    assert result["climate_transition_q2"] == 200.0


def test_no_buffer_when_never_met_threshold():
    """Company never met threshold → no buffer applied."""
    current = {"climate_transition_q2": 380.0}
    previous = {"climate_transition_q2": 360.0}
    peer_pcts = {
        "climate_transition_q2": 0.93,
        "_prev_climate_transition_q2": 0.40,  # never met threshold (was at 40th pct)
    }
    result = apply_buffer_rule(current, previous, peer_pcts)
    assert "_buffer_applied_climate_transition_q2" not in result


def test_no_buffer_when_no_previous_responses():
    """No previous responses → no buffer applied to any question."""
    current = {"board_governance_q3": 45.0, "employee_wellbeing_q5": 8.0}
    previous = {}
    peer_pcts = {"board_governance_q3": 0.92, "employee_wellbeing_q5": 0.91}
    result = apply_buffer_rule(current, previous, peer_pcts)
    assert "_buffer_applied_board_governance_q3" not in result
    assert "_buffer_applied_employee_wellbeing_q5" not in result


def test_boolean_answers_not_affected_by_buffer():
    """Buffer rule applies only to numeric questions — booleans are unchanged."""
    current = {"climate_transition_q1": False}
    previous = {"climate_transition_q1": True}
    peer_pcts = {}
    result = apply_buffer_rule(current, previous, peer_pcts)
    # Boolean should not be buffered
    assert result["climate_transition_q1"] is False
    assert "_buffer_applied_climate_transition_q1" not in result


def test_multiple_questions_independent():
    """Buffer applied to q1 does not affect q2 (each question is independent)."""
    current = {"board_governance_q3": 45.0, "board_governance_q4": 20.0}
    previous = {"board_governance_q3": 52.0, "board_governance_q4": 35.0}
    peer_pcts = {
        "board_governance_q3": 0.92,
        "_prev_board_governance_q3": 0.97,  # met threshold previously
        "board_governance_q4": 0.30,
        "_prev_board_governance_q4": 0.35,  # never met threshold
    }
    result = apply_buffer_rule(current, previous, peer_pcts)
    # q3 in buffer zone after previously meeting threshold → buffered
    assert result.get("_buffer_applied_board_governance_q3") is True
    # q4 never met threshold → not buffered
    assert "_buffer_applied_board_governance_q4" not in result
