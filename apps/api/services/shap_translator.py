"""
NEST ÉLANCE — SHAP Translation Service
Maps question_id → plain French/English label for display in waterfall chart.
Labels match i18n JSON keys under shap.features.*
"""

SHAP_LABELS: dict[str, dict[str, str]] = {
    # Climate Transition
    "climate_transition_q1": {
        "fr": "Mesure des émissions GHG Scope 1+2",
        "en": "Scope 1+2 GHG emissions measurement",
    },
    "climate_transition_q2": {
        "fr": "Volume d'émissions Scope 1+2 (tCO₂e)",
        "en": "Scope 1+2 emissions volume (tCO₂e)",
    },
    "climate_transition_q3": {
        "fr": "Objectif de réduction des émissions fixé",
        "en": "GHG reduction target set",
    },
    "climate_transition_q4": {
        "fr": "Part d'énergie renouvelable (%)",
        "en": "Renewable energy share (%)",
    },
    "climate_transition_q5": {
        "fr": "Plan de transition climatique formalisé",
        "en": "Formalised climate transition plan",
    },
    "climate_transition_q6": {
        "fr": "Consommation totale d'énergie (MWh)",
        "en": "Total energy consumption (MWh)",
    },
    "climate_transition_q7": {
        "fr": "Fournisseurs engagés dans la réduction GHG",
        "en": "Suppliers engaged in GHG reduction",
    },
    "climate_transition_q8": {
        "fr": "Absence d'amendes environnementales",
        "en": "No environmental fines",
    },
    # Biodiversity
    "biodiversity_q1": {
        "fr": "Évaluation d'impact biodiversité réalisée",
        "en": "Biodiversity impact assessment conducted",
    },
    "biodiversity_q2": {
        "fr": "Politique de biodiversité documentée",
        "en": "Documented biodiversity policy",
    },
    "biodiversity_q3": {
        "fr": "Surface artificialisée (ha)",
        "en": "Artificialised land area (ha)",
    },
    "biodiversity_q4": {
        "fr": "Engagements de restauration écologique",
        "en": "Ecological restoration commitments",
    },
    # Circular Economy
    "circular_economy_q1": {
        "fr": "Politique de gestion des déchets",
        "en": "Waste management policy",
    },
    "circular_economy_q2": {
        "fr": "Taux de détournement des déchets (%)",
        "en": "Waste diversion rate (%)",
    },
    "circular_economy_q3": {
        "fr": "Démarche d'éco-conception",
        "en": "Eco-design approach",
    },
    "circular_economy_q4": {
        "fr": "Utilisation de matières recyclées",
        "en": "Recycled materials usage",
    },
    "circular_economy_q5": {
        "fr": "Certification ISO 14001 / EMAS",
        "en": "ISO 14001 / EMAS certification",
    },
    # Employee Wellbeing
    "employee_wellbeing_q1": {
        "fr": "Conformité droit du travail et H&S",
        "en": "Labour law and H&S compliance",
    },
    "employee_wellbeing_q2": {
        "fr": "Programme de formation continue",
        "en": "Continuous training programme",
    },
    "employee_wellbeing_q3": {
        "fr": "Taux d'accidents du travail",
        "en": "Workplace accident rate",
    },
    "employee_wellbeing_q4": {
        "fr": "Enquête satisfaction employés annuelle",
        "en": "Annual employee satisfaction survey",
    },
    "employee_wellbeing_q5": {
        "fr": "Écart de rémunération H/F (%)",
        "en": "Gender pay gap (%)",
    },
    # Human Rights
    "human_rights_community_q1": {
        "fr": "Engagement droits humains publié",
        "en": "Published human rights commitment",
    },
    "human_rights_community_q2": {
        "fr": "Due diligence droits humains fournisseurs",
        "en": "Supplier human rights due diligence",
    },
    "human_rights_community_q3": {
        "fr": "Risques droits humains identifiés",
        "en": "Human rights risks identified",
    },
    "human_rights_community_q4": {
        "fr": "Contribution développement communauté locale",
        "en": "Local community development contribution",
    },
    # Supply Chain
    "supply_chain_responsibility_q1": {
        "fr": "Évaluation fournisseurs avant référencement",
        "en": "Supplier screening before onboarding",
    },
    "supply_chain_responsibility_q2": {
        "fr": "Charte fournisseurs ESG",
        "en": "ESG supplier charter",
    },
    "supply_chain_responsibility_q3": {
        "fr": "Part fournisseurs audités RSE (%)",
        "en": "Share of suppliers with RSE audit (%)",
    },
    "supply_chain_responsibility_q4": {
        "fr": "Mécanisme de réclamation fournisseurs",
        "en": "Supplier grievance mechanism",
    },
    # Board Governance
    "board_governance_q1": {
        "fr": "Membre indépendant au conseil",
        "en": "Independent board member",
    },
    "board_governance_q2": {
        "fr": "ESG intégré dans rémunération dirigeants",
        "en": "ESG in executive compensation",
    },
    "board_governance_q3": {
        "fr": "Indépendance du conseil (%)",
        "en": "Board independence (%)",
    },
    "board_governance_q4": {
        "fr": "Parité femmes au conseil (%)",
        "en": "Women on board (%)",
    },
    "board_governance_q5": {
        "fr": "Indépendance comité de rémunération (%)",
        "en": "Compensation committee independence (%)",
    },
    "board_governance_q6": {
        "fr": "Indépendance comité d'audit (%)",
        "en": "Audit committee independence (%)",
    },
    # Ethics
    "ethics_anticorruption_q1": {
        "fr": "Politique anti-corruption formalisée",
        "en": "Formalised anti-corruption policy",
    },
    "ethics_anticorruption_q2": {
        "fr": "Formation anti-corruption employés exposés",
        "en": "Anti-corruption training for exposed staff",
    },
    "ethics_anticorruption_q3": {
        "fr": "Dispositif d'alerte éthique (whistleblowing)",
        "en": "Ethics whistleblowing mechanism",
    },
    "ethics_anticorruption_q4": {
        "fr": "Absence de sanctions pour corruption",
        "en": "No corruption sanctions",
    },
    # Data Privacy
    "data_privacy_q1": {
        "fr": "Politique RGPD + DPO désigné",
        "en": "GDPR policy + designated DPO",
    },
    "data_privacy_q2": {
        "fr": "Analyses d'impact RGPD (AIPD)",
        "en": "GDPR impact assessments (DPIA)",
    },
    "data_privacy_q3": {
        "fr": "Absence de violation de données",
        "en": "No data breaches",
    },
    "data_privacy_q4": {
        "fr": "Clauses RGPD dans contrats sous-traitants",
        "en": "GDPR clauses in sub-processor contracts",
    },
    # Shareholder Rights
    "shareholder_rights_q1": {
        "fr": "Assemblée générale annuelle tenue",
        "en": "Annual general meeting held",
    },
    "shareholder_rights_q2": {
        "fr": "Informations ESG partagées avant AGO",
        "en": "ESG information shared before AGM",
    },
    "shareholder_rights_q3": {
        "fr": "Délai de convocation AGO (jours)",
        "en": "AGM notice period (days)",
    },
}


def translate_shap_results(
    shap_values: dict[str, float],
    language: str = "fr",
) -> list[dict]:
    """
    Replaces question IDs with plain language labels.
    Returns list of {feature, question_id, contribution} dicts.
    Called before returning SHAP results to frontend.
    """
    lang = language if language in ("fr", "en") else "fr"
    result = []

    for q_id, contribution in shap_values.items():
        labels = SHAP_LABELS.get(q_id, {})
        feature = labels.get(lang) or labels.get("fr") or q_id
        result.append({
            "feature":     feature,
            "question_id": q_id,
            "contribution": round(float(contribution), 4),
        })

    return result
