"""T-FIN-001: Financial Impact Calculator router"""
from fastapi import APIRouter, Depends, HTTPException
from supabase import create_client
import os
from auth import get_current_user, require_plan, UserProfile

router = APIRouter()

# Probability of non-compliance fine by score band
FINE_PROBABILITY = {0: 0.80, 1: 0.80, 2: 0.50, 3: 0.25, 4: 0.10, 5: 0.02}

# Revenue band midpoints (€)
REVENUE_MIDPOINTS = {
    "<500k":   250_000,
    "500k-1m": 750_000,
    "1m-10m":  5_000_000,
    "10m-50m": 30_000_000,
    ">50m":    75_000_000,
}

CARBON_PRICE_EUR_PER_TONNE = 65.0  # EU ETS approximate 2025

def _supa():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

def _score_band(score: float) -> int:
    return min(5, max(0, round(score)))

@router.get("/risk/{company_id}")
async def financial_risk(
    company_id: str,
    user: UserProfile = Depends(require_plan("growth")),
):
    if user.company_id != company_id:
        raise HTTPException(403, "Access denied")

    supabase = _supa()

    # Fetch latest snapshot
    snap_res = (supabase.table("score_snapshots")
        .select("overall_score, pillar_e, pillar_s, pillar_g")
        .eq("company_id", company_id)
        .order("created_at", desc=True).limit(1).execute())
    snap = snap_res.data[0] if snap_res.data else None
    overall_score = snap["overall_score"] if snap else 2.5

    # Fetch company profile
    co_res = (supabase.table("companies")
        .select("revenue_band, eu_supply_chain_pct, scope12_emissions_t")
        .eq("id", company_id).single().execute())
    company = co_res.data or {}

    revenue = REVENUE_MIDPOINTS.get(company.get("revenue_band", "1m-10m"), 5_000_000)
    eu_pct = float(company.get("eu_supply_chain_pct") or 0) / 100
    emissions = float(company.get("scope12_emissions_t") or 0)

    band = _score_band(overall_score)
    prob = FINE_PROBABILITY.get(band, 0.25)

    # (1) Regulatory fines — 0.5% of revenue × probability × 18-month factor
    regulatory_fines = round(revenue * 0.005 * prob * 1.5)

    # (2) Lost contracts — EU revenue × probability
    lost_contracts = round(revenue * eu_pct * prob)

    # (3) Carbon costs — scope12 emissions × €65/tonne
    carbon_costs = round(emissions * CARBON_PRICE_EUR_PER_TONNE)

    total = regulatory_fines + lost_contracts + carbon_costs

    # Compare: what would risk be at score 3.5?
    target_prob = FINE_PROBABILITY.get(3, 0.25)
    target_fines = round(revenue * 0.005 * target_prob * 1.5)
    target_contracts = round(revenue * eu_pct * target_prob)
    target_total = target_fines + target_contracts + carbon_costs
    savings = max(0, total - target_total)

    return {
        "company_id": company_id,
        "current_score": overall_score,
        "score_band": band,
        "probability": prob,
        "horizon_months": 18,
        "breakdown": {
            "regulatory_fines": {"amount": regulatory_fines, "probability": prob},
            "lost_contracts": {"amount": lost_contracts, "probability": prob, "eu_pct": eu_pct},
            "carbon_costs": {"amount": carbon_costs, "tonnes": emissions, "price_per_tonne": CARBON_PRICE_EUR_PER_TONNE},
        },
        "total_risk": total,
        "target_score": 3.5,
        "target_total": target_total,
        "potential_savings": savings,
        "currency": "EUR",
    }
