-- ============================================================
-- NEST ÉLANCE — Initial Schema Migration
-- Version: 001
-- Tables: companies, users, consultant_clients,
--         questionnaire_responses, score_snapshots,
--         shap_results, simulator_plans, reports, api_keys
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── 1. companies ────────────────────────────────────────────
CREATE TABLE companies (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                  TEXT NOT NULL,
  country               TEXT NOT NULL DEFAULT 'France',
  industry_id           TEXT,
  sector_group          TEXT NOT NULL CHECK (sector_group IN (
                          'manufacturing','services','retail',
                          'construction','agriculture','tech')),
  revenue_band          TEXT NOT NULL CHECK (revenue_band IN (
                          '<500k','500k-1m','1m-10m','10m-50m','>50m')),
  employee_count        INTEGER,
  eu_supply_chain_pct   NUMERIC(5,2) CHECK (eu_supply_chain_pct BETWEEN 0 AND 100),
  scope12_emissions_t   NUMERIC(12,2),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 2. users ────────────────────────────────────────────────
CREATE TABLE users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id    UUID REFERENCES companies(id) ON DELETE SET NULL,
  email         TEXT NOT NULL UNIQUE,
  full_name     TEXT,
  role          TEXT NOT NULL DEFAULT 'sme_owner' CHECK (role IN (
                  'sme_owner','consultant','admin')),
  plan          TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN (
                  'starter','growth','professional','consultant')),
  persona       TEXT CHECK (persona IN ('dirigeant','cfo','rse')),
  locale        TEXT NOT NULL DEFAULT 'fr' CHECK (locale IN ('fr','en')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 3. consultant_clients ───────────────────────────────────
CREATE TABLE consultant_clients (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consultant_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
                    'active','inactive','archived')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (consultant_id, company_id)
);

-- ─── 4. questionnaire_responses ──────────────────────────────
CREATE TABLE questionnaire_responses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id     TEXT NOT NULL,
  theme_id        TEXT NOT NULL,
  answer_value    JSONB NOT NULL,  -- boolean | number | string
  source_label    TEXT,            -- optional data source note (≤120 chars)
  submitted_by    TEXT,            -- name or system identifier
  answered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, question_id)
);

-- ─── 5. score_snapshots ──────────────────────────────────────
CREATE TABLE score_snapshots (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  overall_score     NUMERIC(4,2) NOT NULL CHECK (overall_score BETWEEN 0 AND 5),
  pillar_e          NUMERIC(4,2) NOT NULL CHECK (pillar_e BETWEEN 0 AND 5),
  pillar_s          NUMERIC(4,2) NOT NULL CHECK (pillar_s BETWEEN 0 AND 5),
  pillar_g          NUMERIC(4,2) NOT NULL CHECK (pillar_g BETWEEN 0 AND 5),
  theme_scores      JSONB NOT NULL,   -- { theme_id: score }
  sector_group      TEXT NOT NULL,
  question_count    INTEGER NOT NULL,
  engine_version    TEXT NOT NULL DEFAULT '1.0.0',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 6. shap_results ─────────────────────────────────────────
CREATE TABLE shap_results (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  snapshot_id     UUID NOT NULL REFERENCES score_snapshots(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  shap_values     JSONB NOT NULL,   -- { question_id: shap_value }
  base_value      NUMERIC(4,2) NOT NULL,
  top_drivers     JSONB NOT NULL,   -- [{ question_id, impact, direction }]
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 7. simulator_plans ──────────────────────────────────────
CREATE TABLE simulator_plans (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_id     UUID REFERENCES score_snapshots(id) ON DELETE SET NULL,
  name            TEXT NOT NULL DEFAULT 'Plan sans titre',
  actions         JSONB NOT NULL,   -- [{ question_id, target_value, month }]
  projected_score NUMERIC(4,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 8. reports ──────────────────────────────────────────────
CREATE TABLE reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_id     UUID NOT NULL REFERENCES score_snapshots(id) ON DELETE CASCADE,
  framework       TEXT NOT NULL CHECK (framework IN ('CSRD','GRI','BRSR','combined')),
  format          TEXT NOT NULL CHECK (format IN ('pdf','docx')),
  locale          TEXT NOT NULL DEFAULT 'fr' CHECK (locale IN ('fr','en')),
  file_url        TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                    'pending','generating','ready','failed')),
  generated_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 9. api_keys ─────────────────────────────────────────────
CREATE TABLE api_keys (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash        TEXT NOT NULL UNIQUE,  -- bcrypt hash
  label           TEXT NOT NULL DEFAULT 'Default',
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────
CREATE INDEX idx_users_company_id          ON users(company_id);
CREATE INDEX idx_users_role                ON users(role);
CREATE INDEX idx_responses_company_id      ON questionnaire_responses(company_id);
CREATE INDEX idx_responses_question_id     ON questionnaire_responses(question_id);
CREATE INDEX idx_snapshots_company_id      ON score_snapshots(company_id);
CREATE INDEX idx_snapshots_created_at      ON score_snapshots(created_at DESC);
CREATE INDEX idx_shap_snapshot_id         ON shap_results(snapshot_id);
CREATE INDEX idx_simulator_company_id     ON simulator_plans(company_id);
CREATE INDEX idx_reports_company_id       ON reports(company_id);
CREATE INDEX idx_reports_status           ON reports(status);
CREATE INDEX idx_consultant_clients_cid   ON consultant_clients(consultant_id);
CREATE INDEX idx_api_keys_user_id         ON api_keys(user_id);

-- ─── updated_at trigger ───────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_responses_updated_at
  BEFORE UPDATE ON questionnaire_responses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_simulator_updated_at
  BEFORE UPDATE ON simulator_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
