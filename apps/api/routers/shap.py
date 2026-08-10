"""T-XAI-003: SHAP router"""
from fastapi import APIRouter, Depends, HTTPException
from auth import get_current_user, require_plan, UserProfile
from db import get_shap_result

router = APIRouter()

@router.get("/results/{snapshot_id}")
async def get_shap_results(
    snapshot_id: str,
    user: UserProfile = Depends(require_plan("professional")),
):
    """
    Returns SHAP results for a snapshot.
    Requires professional plan.
    Returns {"status": "pending"} if result not yet ready.
    """
    result = get_shap_result(snapshot_id)
    if not result:
        return {"status": "pending", "snapshot_id": snapshot_id}

    return {
        "status": "ready",
        "snapshot_id": snapshot_id,
        "baseline_score": result.get("base_value", 0.0),
        "shap_values": result.get("shap_values", {}),
        "top_drivers": result.get("top_drivers", []),
    }
