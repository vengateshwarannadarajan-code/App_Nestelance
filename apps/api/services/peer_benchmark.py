"""
NEST ÉLANCE — Peer Benchmark Service v1
inject_peer_scores() adds _peer_score_{key} percentile values to responses.
v1: returns 0.5 (midpoint) for all numeric questions.
v2: replace with real cohort percentile calculation.
"""

from typing import Any


def inject_peer_scores(
    responses: dict[str, Any],
    sector_group: str,
) -> dict[str, Any]:
    """
    Injects _peer_score_{key} for all numeric response fields.
    Boolean values are never modified.

    Returns enriched responses dict.
    """
    enriched = dict(responses)

    for q_id, value in responses.items():
        # Skip booleans, skip already-injected keys, skip flag keys
        if isinstance(value, bool):
            continue
        if q_id.startswith("_"):
            continue
        if not isinstance(value, (int, float)):
            continue

        # v1 stub: 0.5 for all numeric questions
        # TODO v2: wire to real cohort percentile table
        enriched[f"_peer_score_{q_id}"] = _get_peer_percentile(q_id, value, sector_group)

    return enriched


def _get_peer_percentile(
    question_id: str,
    value: float,
    sector_group: str,
) -> float:
    """
    Returns the company's percentile rank (0.0–1.0) vs sector peers.
    v1: always returns 0.5 (median).
    TODO v2: query cohort percentile table with sector_group filter.
    """
    # v1 stub
    return 0.5


def apply_peer_percentiles(
    responses: dict[str, Any],
    peer_pcts: dict[str, float],
) -> dict[str, Any]:
    """
    Replaces each numeric question's raw real-world value (e.g. "300"
    tCO2e/an) with its 0.0-1.0 peer percentile before the responses
    reach score_company() — that's the contract score_company() is
    actually built and tested against (see
    packages/scoring-engine/tests/test_engine.py's
    _all_true_responses(), which documents numeric answers as
    "1.0 (peer percentile max)", not a raw value).

    inject_peer_scores() only *adds* `_peer_score_{id}` alongside the
    original raw value; nothing was substituting it back in before this
    — meaning every numeric answer reached the engine unnormalised and
    saturated its theme toward 5.0 regardless of whether the real value
    was good or bad. Booleans and `_`-prefixed keys pass through
    unchanged.
    """
    finalized = dict(responses)
    for q_id, pct in peer_pcts.items():
        if q_id in finalized and not isinstance(finalized[q_id], bool):
            finalized[q_id] = pct
    return finalized
