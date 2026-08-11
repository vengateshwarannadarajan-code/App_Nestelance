-- ============================================================
-- NEST ÉLANCE — Missing Columns Migration
-- Version: 003
--
-- Fixes two columns the application code already queries/writes
-- but that were never added to the 001 schema:
--
--  1. companies.logo_url — apps/api/routers/reports.py selects this
--     for white-label PDF reports (T-REPORT-005). Without it, every
--     report-generation request for a professional/consultant user
--     fails with a PostgREST "column does not exist" error.
--
--  2. reports.job_id — apps/api/routers/consultant.py's bulk report
--     status endpoint needs a way to correlate a batch of reports
--     back to the job that created them (T-CONS-005).
-- ============================================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS job_id UUID;
CREATE INDEX IF NOT EXISTS idx_reports_job_id ON reports(job_id) WHERE job_id IS NOT NULL;
