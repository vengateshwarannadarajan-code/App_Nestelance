from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional
import yaml, os
from supabase import create_client

from auth import get_current_user, UserProfile

router = APIRouter()

_CONFIG_DIR = os.path.join(os.path.dirname(__file__), "../../../packages/config")

def _load_materiality():
    path = os.path.join(_CONFIG_DIR, "materiality_weights.yaml")
    with open(path) as f:
        return yaml.safe_load(f)["themes"]

MATERIALITY = _load_materiality()

MATERIALITY_LEVEL_LABELS = {1.0: "Critical", 0.75: "Material", 0.25: "Relevant", 0.0: "NotRelevant"}

# v1 hardcoded sector averages (T-QUEST-007)
NUMERIC_RANGES = {
    "climate_transition_q2": {"manufacturing": 850, "services": 120, "retail": 340, "construction": 620, "agriculture": 1400, "tech": 95},
    "climate_transition_q4": {"manufacturing": 18, "services": 35, "retail": 22, "construction": 12, "agriculture": 8, "tech": 42},
    "climate_transition_q6": {"manufacturing": 4200, "services": 680, "retail": 1100, "construction": 2800, "agriculture": 5600, "tech": 520},
    "circular_economy_q2":   {"manufacturing": 34, "services": 12, "retail": 28, "construction": 42, "agriculture": 18, "tech": 8},
    "employee_wellbeing_q3": {"manufacturing": 3.2, "services": 2.1, "retail": 4.8, "construction": 5.6, "agriculture": 6.2, "tech": 1.4},
    "employee_wellbeing_q5": {"manufacturing": 8, "services": 6, "retail": 9, "construction": 7, "agriculture": 11, "tech": 5},
    "board_governance_q3":   {"manufacturing": 42, "services": 38, "retail": 35, "construction": 30, "agriculture": 22, "tech": 48},
    "board_governance_q4":   {"manufacturing": 28, "services": 32, "retail": 30, "construction": 18, "agriculture": 15, "tech": 35},
    "shareholder_rights_q3": {"manufacturing": 21, "services": 21, "retail": 21, "construction": 14, "agriculture": 10, "tech": 28},
}

def _supa():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

class CompanyCreate(BaseModel):
    name: str
    country: str = "FR"
    revenue_band: str
    eu_supply_chain_pct: float = Field(default=0.0, ge=0, le=100)
    scope12_emissions_t: Optional[float] = None
    industry_id: Optional[str] = None
    sector_group: Optional[str] = None

class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    country: Optional[str] = None
    revenue_band: Optional[str] = None
    eu_supply_chain_pct: Optional[float] = Field(default=None, ge=0, le=100)
    scope12_emissions_t: Optional[float] = None
    industry_id: Optional[str] = None
    sector_group: Optional[str] = None

@router.post("", status_code=201)
async def create_company(body: CompanyCreate, user: UserProfile = Depends(get_current_user)):
    data = body.model_dump(exclude_none=True)
    data.setdefault("sector_group", "services")
    result = _supa().table("companies").insert(data).execute()
    if not result.data:
        raise HTTPException(500, "Failed to create company")
    company = result.data[0]
    _supa().table("users").update({"company_id": company["id"]}).eq("id", user.id).execute()
    return {"id": company["id"], "name": company["name"]}

@router.get("/{company_id}")
async def get_company(company_id: str, user: UserProfile = Depends(get_current_user)):
    result = _supa().table("companies").select("*").eq("id", company_id).single().execute()
    if not result.data:
        raise HTTPException(404, "Company not found")
    return result.data

@router.patch("/{company_id}")
async def update_company(company_id: str, body: CompanyUpdate, user: UserProfile = Depends(get_current_user)):
    if user.company_id != company_id:
        raise HTTPException(403, "Access denied")
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(400, "No fields to update")
    result = _supa().table("companies").update(data).eq("id", company_id).execute()
    if not result.data:
        raise HTTPException(404, "Company not found")
    return result.data[0]

@router.get("/{company_id}/materiality-preview")
async def materiality_preview(company_id: str, sector: str = Query(...), user: UserProfile = Depends(get_current_user)):
    results = []
    for theme_id, theme_data in MATERIALITY.items():
        weight = theme_data.get("weights", {}).get(sector, 0.0)
        if weight > 0:
            results.append({
                "theme_id": theme_id, "label": theme_data["label"], "pillar": theme_data["pillar"],
                "weight": weight, "level": MATERIALITY_LEVEL_LABELS.get(weight, "Relevant"),
                "esrs": theme_data.get("esrs", ""),
            })
    results.sort(key=lambda x: x["weight"], reverse=True)
    return {"sector": sector, "top_themes": results[:3], "all_themes": results}

@router.get("/{company_id}/sector-averages")
async def sector_averages(company_id: str, user: UserProfile = Depends(get_current_user)):
    company = _supa().table("companies").select("sector_group").eq("id", company_id).single().execute()
    if not company.data:
        raise HTTPException(404, "Company not found")
    sector = company.data.get("sector_group", "services")
    return {"company_id": company_id, "sector": sector,
            "averages": {q: v.get(sector, 0) for q, v in NUMERIC_RANGES.items()}}
