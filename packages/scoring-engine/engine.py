"""
NEST ÉLANCE — Scoring Engine v1.0
Implements score_company() and all helper functions.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any
import yaml, os

from questions import QUESTIONS_BY_THEME, ALL_QUESTIONS

# ── Config loading ────────────────────────────────────────────
_CONFIG = os.environ.get("CONFIG_DIR", os.path.join(os.path.dirname(__file__), "../../packages/config"))
if not os.path.exists(_CONFIG):
    _CONFIG = "/app/packages/config"

def _load_yaml(name: str) -> dict:
    with open(os.path.join(_CONFIG, name)) as f:
        return yaml.safe_load(f)

MATERIALITY: dict  = _load_yaml("materiality_weights.yaml")["themes"]
CAPPING: dict      = _load_yaml("capping_indicators.yaml")["capping_indicators"]
THRESHOLDS: dict   = _load_yaml("absolute_thresholds.yaml")["absolute_thresholds"]

# ── Pillar → themes mapping ───────────────────────────────────
PILLAR_THEMES: dict[str, list[str]] = {
    "E": ["climate_transition", "biodiversity", "circular_economy"],
    "S": ["employee_wellbeing", "human_rights_community", "supply_chain_responsibility"],
    "G": ["board_governance", "ethics_anticorruption", "data_privacy", "shareholder_rights"],
}

# Aspirational / performance split % per theme (ASP_PCT = aspirational weight)
THEME_SPLITS: dict[str, float] = {
    "climate_transition":          0.40,
    "biodiversity":                0.55,
    "circular_economy":            0.45,
    "employee_wellbeing":          0.50,
    "human_rights_community":      0.60,
    "supply_chain_responsibility": 0.55,
    "board_governance":            0.40,
    "ethics_anticorruption":       0.55,
    "data_privacy":                0.50,
    "shareholder_rights":          0.45,
}

# ── Dataclass ─────────────────────────────────────────────────
@dataclass
class ThemeResult:
    theme_id: str
    score: float                      # 0.0 – 5.0
    capping_met: bool
    aspirational_pct: float           # 0–100
    performance_pct: float            # 0–100
    materiality_weight: float         # per sector
    top_action: str | None = None
    absolute_flags: list[str] = field(default_factory=list)

@dataclass
class ScoreResult:
    overall_score: float
    pillar_e: float
    pillar_s: float
    pillar_g: float
    themes: dict[str, ThemeResult]
    sector_group: str
    question_count: int
    engine_version: str = "1.0.0"


# ── Public API ────────────────────────────────────────────────
def score_company(
    responses: dict[str, Any],
    sector_group: str,
) -> ScoreResult:
    """
    Main entry point.
    responses: {question_id: value}  (bool | float | int)
    sector_group: one of manufacturing/services/retail/construction/agriculture/tech
    """
    theme_results: dict[str, ThemeResult] = {}

    for theme_id, questions in QUESTIONS_BY_THEME.items():
        theme_results[theme_id] = _score_theme(
            theme_id, questions, responses, sector_group
        )

    pillar_scores = _compute_pillar_scores(theme_results, sector_group)
    overall = _compute_overall(pillar_scores)

    return ScoreResult(
        overall_score=round(overall, 2),
        pillar_e=round(pillar_scores["E"], 2),
        pillar_s=round(pillar_scores["S"], 2),
        pillar_g=round(pillar_scores["G"], 2),
        themes=theme_results,
        sector_group=sector_group,
        question_count=len([r for r in responses.values() if r is not None]),
    )


# ── Internal helpers ──────────────────────────────────────────
def _score_theme(
    theme_id: str,
    questions: list[dict],
    responses: dict[str, Any],
    sector_group: str,
) -> ThemeResult:
    cap_cfg = CAPPING.get(theme_id, {})
    cap_q_id = cap_cfg.get("question_id")
    capping_met = bool(_default_answer(responses.get(cap_q_id), "boolean")) if cap_q_id else True

    asp_split = THEME_SPLITS.get(theme_id, 0.5)
    asp_qs = [q for q in questions if q["type"] == "aspirational"]
    perf_qs = [q for q in questions if q["type"] == "performance"]

    asp_score  = _score_group(asp_qs,  responses, theme_id) * 5
    perf_score = _score_group(perf_qs, responses, theme_id) * 5

    raw_score = asp_split * asp_score + (1 - asp_split) * perf_score

    # Capping rule: if capping indicator is False → max 3.0
    if not capping_met:
        raw_score = min(raw_score, 3.0)

    # Absolute threshold flags
    abs_flags: list[str] = []
    for q in questions:
        key = q.get("absolute_threshold_key")
        if key and not _check_absolute(key, responses.get(q["id"])):
            abs_flags.append(key)

    mat_weight = MATERIALITY.get(theme_id, {}).get("weights", {}).get(sector_group, 0.25)

    return ThemeResult(
        theme_id=theme_id,
        score=round(max(0.0, min(5.0, raw_score)), 2),
        capping_met=capping_met,
        aspirational_pct=round(asp_split * 100),
        performance_pct=round((1 - asp_split) * 100),
        materiality_weight=mat_weight,
        absolute_flags=abs_flags,
    )


def _score_group(questions: list[dict], responses: dict[str, Any], theme_id: str) -> float:
    if not questions:
        return 0.5
    scores = [_evaluate_question(q, responses.get(q["id"])) for q in questions]
    return sum(scores) / len(scores)


def _evaluate_question(q: dict, raw_value: Any) -> float:
    """Returns 0.0–1.0 for a single question."""
    value = _default_answer(raw_value, q["input_type"])
    if q["input_type"] == "boolean":
        return 1.0 if value else 0.0
    # numeric: normalise against peer score injected as _peer_score_{id}
    # v1: treated as 0.5 (midpoint) if not peer-injected
    if value is None:
        return 0.0
    # Peer score is injected as a percentile 0–1
    return float(value)  # caller normalises via inject_peer_scores


def _check_absolute(threshold_key: str, value: Any) -> bool:
    """Returns True if threshold is met (no flag needed)."""
    cfg = THRESHOLDS.get(threshold_key, {})
    if not cfg:
        return True
    operator = cfg.get("operator")
    threshold = cfg.get("value")
    if value is None:
        return False
    try:
        v = float(value)
        t = float(threshold) if not isinstance(threshold, bool) else threshold
        if operator == ">":  return v > t
        if operator == ">=": return v >= t
        if operator == "<":  return v < t
        if operator == "<=": return v <= t
        if operator == "=":
            if isinstance(threshold, bool): return bool(value) == threshold
            return v == float(t)
    except (TypeError, ValueError):
        if operator == "=": return value == threshold
    return True


def _default_answer(value: Any, input_type: str) -> Any:
    """Return value if present, else safe default."""
    if value is None:
        return False if input_type == "boolean" else None
    return value


def _compute_pillar_scores(
    themes: dict[str, ThemeResult],
    sector_group: str,
) -> dict[str, float]:
    pillar_scores: dict[str, float] = {}
    for pillar, theme_ids in PILLAR_THEMES.items():
        weighted_sum = 0.0
        weight_total = 0.0
        for tid in theme_ids:
            tr = themes.get(tid)
            if not tr:
                continue
            w = tr.materiality_weight
            weighted_sum += tr.score * w
            weight_total += w
        pillar_scores[pillar] = (weighted_sum / weight_total) if weight_total > 0 else 0.0
    return pillar_scores


def _compute_overall(pillar_scores: dict[str, float]) -> float:
    # Equal pillar weighting for v1
    scores = list(pillar_scores.values())
    return sum(scores) / len(scores) if scores else 0.0
