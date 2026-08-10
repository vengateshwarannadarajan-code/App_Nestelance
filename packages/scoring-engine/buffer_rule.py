"""
NEST ÉLANCE — Buffer Rule
apply_buffer_rule() prevents score yo-yoing near absolute thresholds.
If a company previously met a threshold and is now within 10 percentile
points of it, the previous answer is retained.
"""

from typing import Any


def apply_buffer_rule(
    current_responses: dict[str, Any],
    previous_responses: dict[str, Any],
    peer_percentiles: dict[str, float],
    buffer_threshold: float = 0.10,
) -> dict[str, Any]:
    """
    Parameters:
        current_responses:  {question_id: value} for current assessment
        previous_responses: {question_id: value} for most recent previous assessment
        peer_percentiles:   {question_id: percentile_0_to_1} of current answer vs peers
        buffer_threshold:   fraction of range considered the buffer zone (default 10%)

    Returns:
        Adjusted responses dict with _buffer_applied_{q_id} flags where buffer was applied.
    """
    adjusted = dict(current_responses)

    for q_id, current_val in current_responses.items():
        prev_val = previous_responses.get(q_id)

        # Only applies to numeric questions — boolean thresholds are binary
        if not isinstance(current_val, (int, float)):
            continue
        if not isinstance(prev_val, (int, float)):
            continue

        peer_pct = peer_percentiles.get(q_id)
        if peer_pct is None:
            continue

        # Company previously met the threshold if it was in the top percentile zone
        # Proxy: previous answer >= current answer (i.e. was doing better or the same)
        prev_pct = peer_percentiles.get(f"_prev_{q_id}", peer_pct)
        previously_met = prev_pct >= (1.0 - buffer_threshold)

        if not previously_met:
            # Company never met threshold → no buffer
            continue

        # Current position is within buffer zone (degraded slightly)
        currently_in_buffer = (1.0 - buffer_threshold) <= peer_pct < 1.0

        if currently_in_buffer:
            # Apply buffer: retain previous (better) answer
            adjusted[q_id] = prev_val
            adjusted[f"_buffer_applied_{q_id}"] = True

    return adjusted
