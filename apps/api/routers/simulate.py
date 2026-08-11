"""T-SIM-001: Compliance Simulator router"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../../packages/scoring-engine"))

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any
from auth import get_current_user, require_plan, UserProfile
from services.peer_benchmark import inject_peer_scores
from buffer_rule import apply_buffer_rule

router = APIRouter()

class SimulatorAction(BaseModel):
    question_id: str
    new_value: Any
    month: int          # which month this action takes effect (1–24)

class SimulateRequest(BaseModel):
    base_responses: dict[str, Any]
    previous_responses: dict[str, Any] = {}
    actions: list[SimulatorAction]
    sector: str
    horizon_months: int = 12   # 6, 12, or 24

@router.post("/")
async def simulate(
    body: SimulateRequest,
    user: UserProfile = Depends(require_plan("growth")),
):
    from engine import score_company

    monthly_projections: dict[int, dict] = {}

    # Baseline: score at month 0 with no actions
    base_enriched = inject_peer_scores(body.base_responses, body.sector)
    base_result = score_company(base_enriched, body.sector)

    monthly_projections[0] = {
        "month": 0,
        "overall_score": base_result.overall_score,
        "pillar_e": base_result.pillar_e,
        "pillar_s": base_result.pillar_s,
        "pillar_g": base_result.pillar_g,
    }

    # Build cumulative responses per month
    current_responses = dict(body.base_responses)

    for month in range(1, body.horizon_months + 1):
        # Apply all actions that take effect at or before this month
        for action in body.actions:
            if action.month <= month:
                current_responses[action.question_id] = action.new_value

        enriched = inject_peer_scores(current_responses, body.sector)
        peer_pcts = {
            k.replace("_peer_score_", ""): v
            for k, v in enriched.items()
            if k.startswith("_peer_score_")
        }
        adjusted = apply_buffer_rule(enriched, body.previous_responses, peer_pcts)
        result = score_company(adjusted, body.sector)

        monthly_projections[month] = {
            "month": month,
            "overall_score": result.overall_score,
            "pillar_e": result.pillar_e,
            "pillar_s": result.pillar_s,
            "pillar_g": result.pillar_g,
        }

    return {
        "sector": body.sector,
        "horizon_months": body.horizon_months,
        "baseline_score": base_result.overall_score,
        "monthly_projections": monthly_projections,
    }
