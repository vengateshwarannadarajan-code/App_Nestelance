from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from routers import scoring, shap, simulate, reports, admin, companies, questionnaire, consultant, billing
from auth import get_current_user


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("Nest Élance API starting up...")
    yield
    # Shutdown
    print("Nest Élance API shutting down...")


app = FastAPI(
    title="Nest Élance API",
    description="ESG Compliance SaaS — scoring, SHAP explainability, simulation, reports",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://nestelance.com",
        "https://www.nestelance.com",
        "http://localhost:3000",   # apps/web (Next.js) dev
        "http://localhost:5173",   # nestelance (Vite) default dev port
        "http://localhost:5174",   # nestelance (Vite) alt dev port
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(scoring.router,      prefix="/api/scoring",      tags=["Scoring"])
app.include_router(shap.router,         prefix="/api/shap",         tags=["SHAP"])
app.include_router(simulate.router,     prefix="/api/simulate",     tags=["Simulator"])
app.include_router(reports.router,      prefix="/api/reports",      tags=["Reports"])
app.include_router(admin.router,        prefix="/api/admin",        tags=["Admin"])
app.include_router(companies.router,    prefix="/api/companies",    tags=["Companies"])
app.include_router(questionnaire.router,prefix="/api/questionnaire",tags=["Questionnaire"])
app.include_router(consultant.router,   prefix="/api/consultant",   tags=["Consultant"])
app.include_router(billing.router,      prefix="/api/billing",      tags=["Billing"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "nest-elance-api"}
