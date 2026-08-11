"""
NEST ÉLANCE — Report Generator Service
generate_pdf_report() → PDF bytes using Jinja2 + WeasyPrint
"""
from __future__ import annotations
import os
import math
from datetime import datetime
from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML as WeasyHTML, CSS
from weasyprint.text.fonts import FontConfiguration

TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "../templates")

# CSRD article mapping per theme
CSRD_MAPPING: dict[str, dict[str, str]] = {
    "climate_transition":          {"esrs": "E1", "articles": "E1-1, E1-4, E1-5, E1-6"},
    "biodiversity":                {"esrs": "E4", "articles": "E4-1, E4-2, E4-3, E4-4"},
    "circular_economy":            {"esrs": "E5", "articles": "E5-1, E5-2, E5-3, E5-4"},
    "employee_wellbeing":          {"esrs": "S1", "articles": "S1-1, S1-7, S1-14, S1-16, S1-17"},
    "human_rights_community":      {"esrs": "S2,S3", "articles": "S2-1, S2-2, S2-3, S3-1"},
    "supply_chain_responsibility": {"esrs": "S2",   "articles": "S2-1, S2-4"},
    "board_governance":            {"esrs": "G1",   "articles": "G1-1, G1-2, G1-3"},
    "ethics_anticorruption":       {"esrs": "G1",   "articles": "G1-4"},
    "data_privacy":                {"esrs": "G1",   "articles": "G1-1"},
    "shareholder_rights":          {"esrs": "G1",   "articles": "G1-1"},
}

THEME_LABELS: dict[str, dict[str, str]] = {
    "climate_transition":          {"fr": "Transition climatique",                    "en": "Climate Transition"},
    "biodiversity":                {"fr": "Biodiversité",                              "en": "Biodiversity"},
    "circular_economy":            {"fr": "Économie circulaire",                       "en": "Circular Economy"},
    "employee_wellbeing":          {"fr": "Bien-être des employés",                    "en": "Employee Wellbeing"},
    "human_rights_community":      {"fr": "Droits humains & communauté",               "en": "Human Rights & Community"},
    "supply_chain_responsibility": {"fr": "Responsabilité chaîne d'approvisionnement", "en": "Supply Chain Responsibility"},
    "board_governance":            {"fr": "Gouvernance du conseil",                    "en": "Board Governance"},
    "ethics_anticorruption":       {"fr": "Éthique & anti-corruption",                 "en": "Ethics & Anti-Corruption"},
    "data_privacy":                {"fr": "Confidentialité des données",               "en": "Data Privacy"},
    "shareholder_rights":          {"fr": "Droits des actionnaires",                   "en": "Shareholder Rights"},
}

SCORE_BAND_LABELS: dict[int, dict[str, str]] = {
    0: {"fr": "Critique",         "en": "Critical"},
    1: {"fr": "Insuffisant",      "en": "Insufficient"},
    2: {"fr": "En développement", "en": "Developing"},
    3: {"fr": "Progressant",      "en": "Progressing"},
    4: {"fr": "Avancé",           "en": "Advanced"},
    5: {"fr": "Leader",           "en": "Leader"},
}

SCORE_COLORS = {0: "#B71C1C", 1: "#E53935", 2: "#FB8C00", 3: "#F9A825", 4: "#7CB342", 5: "#2E7D32"}


def _score_band(score: float) -> int:
    return min(5, max(0, round(score)))


def _ring_svg(score: float, size: int = 80) -> str:
    """Returns an inline SVG score ring."""
    r = size // 2 - 6
    cx = cy = size // 2
    circ = 2 * math.pi * r
    offset = circ * (1 - score / 5)
    band = _score_band(score)
    color = SCORE_COLORS[band]
    return (
        f'<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}" '
        f'style="transform:rotate(-90deg)">'
        f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#E0E0E0" stroke-width="6"/>'
        f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{color}" '
        f'stroke-width="6" stroke-linecap="round" '
        f'stroke-dasharray="{circ:.2f}" stroke-dashoffset="{offset:.2f}"/>'
        f'</svg>'
    )


def generate_pdf_report(
    company_name: str,
    snapshot: dict,
    theme_scores: dict[str, float],
    recommendations: list[dict],
    language: str = "fr",
    framework: str = "CSRD",
    logo_url: str | None = None,
    plan: str = "starter",
) -> bytes:
    """
    Generates a PDF report using Jinja2 + WeasyPrint.
    Returns raw PDF bytes.
    """
    lang = language if language in ("fr", "en") else "fr"
    template_file = f"report_{lang}.html"

    env = Environment(
        loader=FileSystemLoader(TEMPLATES_DIR),
        autoescape=select_autoescape(["html"]),
    )

    overall = snapshot.get("overall_score", 0)
    band = _score_band(overall)

    # Build theme rows
    theme_rows = []
    for theme_id, score in theme_scores.items():
        tb = _score_band(score)
        csrd = CSRD_MAPPING.get(theme_id, {})
        theme_rows.append({
            "name":         THEME_LABELS.get(theme_id, {}).get(lang, theme_id),
            "score":        round(score, 2),
            "band_label":   SCORE_BAND_LABELS[tb][lang],
            "color":        SCORE_COLORS[tb],
            "esrs":         csrd.get("esrs", ""),
            "articles":     csrd.get("articles", ""),
            "capping_met":  score >= 3.0,
        })

    # Pillar aggregates
    e_themes = ["climate_transition", "biodiversity", "circular_economy"]
    s_themes = ["employee_wellbeing", "human_rights_community", "supply_chain_responsibility"]
    g_themes = ["board_governance", "ethics_anticorruption", "data_privacy", "shareholder_rights"]

    def avg(ids: list[str]) -> float:
        vals = [theme_scores.get(i, 0) for i in ids]
        return round(sum(vals) / len(vals), 2) if vals else 0.0

    context = {
        "company_name":    company_name,
        "generation_date": datetime.now().strftime("%d/%m/%Y" if lang == "fr" else "%Y-%m-%d"),
        "framework":       framework,
        "language":        lang,
        "overall_score":   round(overall, 2),
        "overall_band":    SCORE_BAND_LABELS[band][lang],
        "overall_color":   SCORE_COLORS[band],
        "overall_ring_svg": _ring_svg(overall, 100),
        "pillar_e":        avg(e_themes),
        "pillar_s":        avg(s_themes),
        "pillar_g":        avg(g_themes),
        "pillar_e_color":  SCORE_COLORS[_score_band(avg(e_themes))],
        "pillar_s_color":  SCORE_COLORS[_score_band(avg(s_themes))],
        "pillar_g_color":  SCORE_COLORS[_score_band(avg(g_themes))],
        "pillar_e_ring":   _ring_svg(avg(e_themes), 60),
        "pillar_s_ring":   _ring_svg(avg(s_themes), 60),
        "pillar_g_ring":   _ring_svg(avg(g_themes), 60),
        "theme_rows":      theme_rows,
        "recommendations": recommendations[:3],
        "logo_url":        logo_url if plan in ("professional", "consultant") else None,
        "show_branding":   plan not in ("professional", "consultant"),  # T-REPORT-005
        "engine_version":  snapshot.get("engine_version", "1.0.0"),
    }

    template = env.get_template(template_file)
    html_content = template.render(**context)

    font_config = FontConfiguration()
    pdf_bytes = WeasyHTML(string=html_content, base_url=TEMPLATES_DIR).write_pdf(
        font_config=font_config,
    )

    return pdf_bytes
