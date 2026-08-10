-- ============================================================
-- NEST ÉLANCE — Row Level Security Policies
-- Version: 002
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE companies                ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultant_clients       ENABLE ROW LEVEL SECURITY;
ALTER TABLE questionnaire_responses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_snapshots          ENABLE ROW LEVEL SECURITY;
ALTER TABLE shap_results             ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulator_plans          ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys                 ENABLE ROW LEVEL SECURITY;

-- ─── Policy 1: company_isolation ─────────────────────────────
-- Users can only access their own company's data

CREATE POLICY company_isolation ON companies
  FOR ALL USING (
    id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

-- ─── Policy 2: snapshot_isolation ────────────────────────────
-- Users see only their company's snapshots

CREATE POLICY snapshot_isolation ON score_snapshots
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

-- ─── Policy 3: consultant_client_access ──────────────────────
-- Consultants can read snapshots and responses for their clients

CREATE POLICY consultant_client_access ON score_snapshots
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM consultant_clients
      WHERE consultant_id = auth.uid()
      AND status = 'active'
    )
  );

CREATE POLICY consultant_response_access ON questionnaire_responses
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM consultant_clients
      WHERE consultant_id = auth.uid()
      AND status = 'active'
    )
  );

-- ─── Policy 4: questionnaire_isolation ───────────────────────
-- Users can only read/write their own company's responses

CREATE POLICY questionnaire_isolation ON questionnaire_responses
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

-- ─── Policy 5: shap_isolation ────────────────────────────────
-- SHAP results accessible by company owner or consultant

CREATE POLICY shap_isolation ON shap_results
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM consultant_clients
      WHERE consultant_id = auth.uid()
      AND status = 'active'
    )
  );

-- ─── Policy 6: report_isolation ──────────────────────────────
-- Users can only access their own company's reports

CREATE POLICY report_isolation ON reports
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

-- ─── users: own row only ──────────────────────────────────────
CREATE POLICY users_own_row ON users
  FOR ALL USING (id = auth.uid());

-- ─── simulator_plans: own company ────────────────────────────
CREATE POLICY simulator_isolation ON simulator_plans
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

-- ─── api_keys: own user ───────────────────────────────────────
CREATE POLICY api_keys_own_user ON api_keys
  FOR ALL USING (user_id = auth.uid());

-- ─── consultant_clients: own consultant ──────────────────────
CREATE POLICY consultant_clients_own ON consultant_clients
  FOR ALL USING (consultant_id = auth.uid());

-- ─── Admin bypass (service role key bypasses RLS) ────────────
-- No explicit admin policy needed — service role key used in API
-- bypasses RLS automatically. Admin routes use service key only.
