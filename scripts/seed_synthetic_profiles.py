"""
NEST ÉLANCE — Synthetic Profile Generator
Used as SHAP background dataset (KernelExplainer requires background population).

generate_profile(sector) → one synthetic SME response dict
load_background(sector, n=100) → list of n profiles
"""

import random
from typing import Any

# Boolean response rates per sector — probability of True answer
SECTOR_BOOLEAN_RATES: dict[str, dict[str, float]] = {
    "manufacturing": {
        "climate_transition_q1": 0.55, "climate_transition_q3": 0.40,
        "climate_transition_q5": 0.30, "climate_transition_q7": 0.35,
        "climate_transition_q8": 0.08,
        "biodiversity_q1": 0.35, "biodiversity_q2": 0.30, "biodiversity_q4": 0.25,
        "circular_economy_q1": 0.70, "circular_economy_q3": 0.45,
        "circular_economy_q4": 0.40, "circular_economy_q5": 0.35,
        "employee_wellbeing_q1": 0.90, "employee_wellbeing_q2": 0.60,
        "employee_wellbeing_q4": 0.50,
        "human_rights_community_q1": 0.45, "human_rights_community_q2": 0.35,
        "human_rights_community_q3": 0.30, "human_rights_community_q4": 0.55,
        "supply_chain_responsibility_q1": 0.50, "supply_chain_responsibility_q2": 0.40,
        "supply_chain_responsibility_q4": 0.35,
        "board_governance_q1": 0.60, "board_governance_q2": 0.25,
        "ethics_anticorruption_q1": 0.65, "ethics_anticorruption_q2": 0.45,
        "ethics_anticorruption_q3": 0.50, "ethics_anticorruption_q4": 0.05,
        "data_privacy_q1": 0.70, "data_privacy_q2": 0.45,
        "data_privacy_q3": 0.10, "data_privacy_q4": 0.60,
        "shareholder_rights_q1": 0.80, "shareholder_rights_q2": 0.65,
    },
    "services": {
        "climate_transition_q1": 0.40, "climate_transition_q3": 0.30,
        "climate_transition_q5": 0.20, "climate_transition_q7": 0.25,
        "climate_transition_q8": 0.05,
        "biodiversity_q1": 0.20, "biodiversity_q2": 0.18, "biodiversity_q4": 0.15,
        "circular_economy_q1": 0.55, "circular_economy_q3": 0.35,
        "circular_economy_q4": 0.30, "circular_economy_q5": 0.15,
        "employee_wellbeing_q1": 0.92, "employee_wellbeing_q2": 0.65,
        "employee_wellbeing_q4": 0.55,
        "human_rights_community_q1": 0.40, "human_rights_community_q2": 0.30,
        "human_rights_community_q3": 0.25, "human_rights_community_q4": 0.50,
        "supply_chain_responsibility_q1": 0.35, "supply_chain_responsibility_q2": 0.28,
        "supply_chain_responsibility_q4": 0.25,
        "board_governance_q1": 0.55, "board_governance_q2": 0.22,
        "ethics_anticorruption_q1": 0.60, "ethics_anticorruption_q2": 0.40,
        "ethics_anticorruption_q3": 0.45, "ethics_anticorruption_q4": 0.04,
        "data_privacy_q1": 0.78, "data_privacy_q2": 0.50,
        "data_privacy_q3": 0.08, "data_privacy_q4": 0.65,
        "shareholder_rights_q1": 0.75, "shareholder_rights_q2": 0.60,
    },
}

# Default rates for sectors not explicitly defined
_DEFAULT_RATES: dict[str, float] = {
    "climate_transition_q1": 0.45, "climate_transition_q3": 0.32,
    "climate_transition_q5": 0.22, "climate_transition_q7": 0.28,
    "climate_transition_q8": 0.06,
    "biodiversity_q1": 0.25, "biodiversity_q2": 0.22, "biodiversity_q4": 0.18,
    "circular_economy_q1": 0.60, "circular_economy_q3": 0.38,
    "circular_economy_q4": 0.32, "circular_economy_q5": 0.22,
    "employee_wellbeing_q1": 0.91, "employee_wellbeing_q2": 0.62,
    "employee_wellbeing_q4": 0.52,
    "human_rights_community_q1": 0.42, "human_rights_community_q2": 0.32,
    "human_rights_community_q3": 0.28, "human_rights_community_q4": 0.52,
    "supply_chain_responsibility_q1": 0.42, "supply_chain_responsibility_q2": 0.34,
    "supply_chain_responsibility_q4": 0.30,
    "board_governance_q1": 0.58, "board_governance_q2": 0.24,
    "ethics_anticorruption_q1": 0.62, "ethics_anticorruption_q2": 0.42,
    "ethics_anticorruption_q3": 0.48, "ethics_anticorruption_q4": 0.05,
    "data_privacy_q1": 0.74, "data_privacy_q2": 0.48,
    "data_privacy_q3": 0.09, "data_privacy_q4": 0.62,
    "shareholder_rights_q1": 0.78, "shareholder_rights_q2": 0.63,
}

# Numeric ranges per question [min, max]
NUMERIC_RANGES: dict[str, tuple[float, float]] = {
    "climate_transition_q2": (50.0, 5000.0),
    "climate_transition_q4": (0.0, 100.0),
    "climate_transition_q6": (100.0, 20000.0),
    "biodiversity_q3": (0.0, 50.0),
    "circular_economy_q2": (0.0, 100.0),
    "employee_wellbeing_q3": (0.0, 20.0),
    "employee_wellbeing_q5": (0.0, 30.0),
    "supply_chain_responsibility_q3": (0.0, 100.0),
    "board_governance_q3": (0.0, 100.0),
    "board_governance_q4": (0.0, 100.0),
    "board_governance_q5": (0.0, 100.0),
    "board_governance_q6": (0.0, 100.0),
    "shareholder_rights_q3": (7.0, 60.0),
}


def generate_profile(sector: str, seed: int | None = None) -> dict[str, Any]:
    """
    Generates one synthetic SME response dict for the given sector.
    Boolean answers use sector-specific rates.
    Numeric answers are uniform random within NUMERIC_RANGES.
    """
    if seed is not None:
        random.seed(seed)

    rates = SECTOR_BOOLEAN_RATES.get(sector, _DEFAULT_RATES)
    profile: dict[str, Any] = {}

    # Boolean questions
    for q_id, rate in {**_DEFAULT_RATES, **rates}.items():
        profile[q_id] = random.random() < rate

    # Numeric questions — uniform within range
    for q_id, (lo, hi) in NUMERIC_RANGES.items():
        profile[q_id] = round(random.uniform(lo, hi), 2)

    return profile


def load_background(sector: str, n: int = 100) -> list[dict[str, Any]]:
    """
    Returns n synthetic SME response dicts for SHAP background dataset.
    """
    return [generate_profile(sector, seed=i) for i in range(n)]
