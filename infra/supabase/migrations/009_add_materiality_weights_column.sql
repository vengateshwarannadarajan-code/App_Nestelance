-- ============================================================
-- NEST ÉLANCE — Add score_snapshots.materiality_weights
-- Version: 009
--
-- apps/api/db.py's save_snapshot() has always written a
-- "materiality_weights" field (currently always {} — "v1: empty,
-- populated in v2" per its own comment, a placeholder for a future
-- per-snapshot materiality breakdown) but no migration ever created
-- this column on score_snapshots. Every real POST /api/scoring/score
-- call has been failing at the final save step in production with:
--   postgrest.exceptions.APIError: {'code': 'PGRST204', ...
--   "Could not find the 'materiality_weights' column of
--    'score_snapshots' in the schema cache"}
-- This was never caught by the test suite because
-- tests/test_scoring_router.py mocks save_snapshot() entirely.
-- ============================================================

ALTER TABLE score_snapshots
  ADD COLUMN IF NOT EXISTS materiality_weights JSONB NOT NULL DEFAULT '{}'::jsonb;
