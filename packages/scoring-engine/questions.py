"""
NEST ÉLANCE — QUESTIONS_BY_THEME
47 questions across 10 themes.
Each question: id, input_type, type, optional absolute_threshold_key.
"""

QUESTIONS_BY_THEME: dict[str, list[dict]] = {

    "climate_transition": [
        {"id": "climate_transition_q1", "input_type": "boolean",  "type": "aspirational"},   # CAPPING
        {"id": "climate_transition_q2", "input_type": "numeric",  "type": "performance"},
        {"id": "climate_transition_q3", "input_type": "boolean",  "type": "aspirational"},
        {"id": "climate_transition_q4", "input_type": "numeric",  "type": "performance"},
        {"id": "climate_transition_q5", "input_type": "boolean",  "type": "aspirational"},
        {"id": "climate_transition_q6", "input_type": "numeric",  "type": "performance"},
        {"id": "climate_transition_q7", "input_type": "boolean",  "type": "aspirational"},
        {"id": "climate_transition_q8", "input_type": "boolean",  "type": "performance",
         "absolute_threshold_key": "environmental_fines_2y"},
    ],

    "biodiversity": [
        {"id": "biodiversity_q1", "input_type": "boolean", "type": "aspirational"},          # CAPPING
        {"id": "biodiversity_q2", "input_type": "boolean", "type": "aspirational"},
        {"id": "biodiversity_q3", "input_type": "numeric", "type": "performance"},
        {"id": "biodiversity_q4", "input_type": "boolean", "type": "aspirational"},
    ],

    "circular_economy": [
        {"id": "circular_economy_q1", "input_type": "boolean", "type": "aspirational"},      # CAPPING
        {"id": "circular_economy_q2", "input_type": "numeric", "type": "performance"},
        {"id": "circular_economy_q3", "input_type": "boolean", "type": "aspirational"},
        {"id": "circular_economy_q4", "input_type": "boolean", "type": "aspirational"},
        {"id": "circular_economy_q5", "input_type": "boolean", "type": "performance",
         "absolute_threshold_key": "ems_certification"},
    ],

    "employee_wellbeing": [
        {"id": "employee_wellbeing_q1", "input_type": "boolean", "type": "aspirational"},    # CAPPING
        {"id": "employee_wellbeing_q2", "input_type": "boolean", "type": "aspirational"},
        {"id": "employee_wellbeing_q3", "input_type": "numeric", "type": "performance"},
        {"id": "employee_wellbeing_q4", "input_type": "boolean", "type": "aspirational"},
        {"id": "employee_wellbeing_q5", "input_type": "numeric", "type": "performance",
         "absolute_threshold_key": "gender_pay_gap_pct"},
    ],

    "human_rights_community": [
        {"id": "human_rights_community_q1", "input_type": "boolean", "type": "aspirational"}, # CAPPING
        {"id": "human_rights_community_q2", "input_type": "boolean", "type": "aspirational"},
        {"id": "human_rights_community_q3", "input_type": "boolean", "type": "aspirational"},
        {"id": "human_rights_community_q4", "input_type": "boolean", "type": "performance"},
    ],

    "supply_chain_responsibility": [
        {"id": "supply_chain_responsibility_q1", "input_type": "boolean", "type": "aspirational"}, # CAPPING
        {"id": "supply_chain_responsibility_q2", "input_type": "boolean", "type": "aspirational"},
        {"id": "supply_chain_responsibility_q3", "input_type": "numeric", "type": "performance"},
        {"id": "supply_chain_responsibility_q4", "input_type": "boolean", "type": "aspirational"},
    ],

    "board_governance": [
        {"id": "board_governance_q1", "input_type": "boolean", "type": "aspirational"},      # CAPPING
        {"id": "board_governance_q2", "input_type": "boolean", "type": "aspirational"},
        {"id": "board_governance_q3", "input_type": "numeric", "type": "performance",
         "absolute_threshold_key": "board_independence_pct"},
        {"id": "board_governance_q4", "input_type": "numeric", "type": "performance",
         "absolute_threshold_key": "board_gender_diversity_pct"},
        {"id": "board_governance_q5", "input_type": "numeric", "type": "performance",
         "absolute_threshold_key": "compensation_committee_independence"},
        {"id": "board_governance_q6", "input_type": "numeric", "type": "performance",
         "absolute_threshold_key": "audit_committee_independence"},
    ],

    "ethics_anticorruption": [
        {"id": "ethics_anticorruption_q1", "input_type": "boolean", "type": "aspirational"}, # CAPPING
        {"id": "ethics_anticorruption_q2", "input_type": "boolean", "type": "aspirational"},
        {"id": "ethics_anticorruption_q3", "input_type": "boolean", "type": "aspirational"},
        {"id": "ethics_anticorruption_q4", "input_type": "boolean", "type": "performance",
         "absolute_threshold_key": "corruption_fines_2y"},
    ],

    "data_privacy": [
        {"id": "data_privacy_q1", "input_type": "boolean", "type": "aspirational"},          # CAPPING
        {"id": "data_privacy_q2", "input_type": "boolean", "type": "aspirational"},
        {"id": "data_privacy_q3", "input_type": "boolean", "type": "performance"},
        {"id": "data_privacy_q4", "input_type": "boolean", "type": "aspirational"},
    ],

    "shareholder_rights": [
        {"id": "shareholder_rights_q1", "input_type": "boolean", "type": "aspirational"},    # CAPPING
        {"id": "shareholder_rights_q2", "input_type": "boolean", "type": "aspirational"},
        {"id": "shareholder_rights_q3", "input_type": "numeric", "type": "performance",
         "absolute_threshold_key": "agm_notice_days"},
    ],
}

# Flat list for SHAP and other uses
ALL_QUESTIONS: list[dict] = [
    q for qs in QUESTIONS_BY_THEME.values() for q in qs
]

# Total = 47 (board_governance and climate_transition each carry extra
# absolute-threshold questions beyond the other themes' baseline count).
assert len(ALL_QUESTIONS) == 47, f"Expected 47 questions, got {len(ALL_QUESTIONS)}"
