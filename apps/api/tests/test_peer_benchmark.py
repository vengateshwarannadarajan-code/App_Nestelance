"""apply_peer_percentiles() — the missing normalisation step that was
letting raw numeric answers (e.g. "300" tCO2e/an) reach score_company()
unnormalised instead of as a 0.0-1.0 peer percentile, saturating any
theme with a numeric question toward 5.0 regardless of whether the real
value was good or bad. See routers/scoring.py and routers/simulate.py
for where this is actually wired in.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.peer_benchmark import apply_peer_percentiles, inject_peer_scores


def test_apply_peer_percentiles_replaces_numeric_values():
    responses = {"climate_transition_q2": 450.0, "climate_transition_q1": True}
    peer_pcts = {"climate_transition_q2": 0.5}
    result = apply_peer_percentiles(responses, peer_pcts)
    assert result["climate_transition_q2"] == 0.5


def test_apply_peer_percentiles_leaves_booleans_untouched():
    responses = {"climate_transition_q1": True}
    # Even if a bogus percentile were supplied for a boolean question id,
    # it must never overwrite the boolean answer itself.
    result = apply_peer_percentiles(responses, {"climate_transition_q1": 0.9})
    assert result["climate_transition_q1"] is True


def test_apply_peer_percentiles_leaves_unlisted_keys_alone():
    responses = {"climate_transition_q2": 450.0}
    result = apply_peer_percentiles(responses, {})
    assert result["climate_transition_q2"] == 450.0


def test_inject_then_apply_normalizes_a_large_raw_value():
    responses = {"climate_transition_q2": 100_000.0}
    enriched = inject_peer_scores(responses, "manufacturing")
    peer_pcts = {k.replace("_peer_score_", ""): v for k, v in enriched.items() if k.startswith("_peer_score_")}
    normalized = apply_peer_percentiles(enriched, peer_pcts)
    assert 0.0 <= normalized["climate_transition_q2"] <= 1.0
