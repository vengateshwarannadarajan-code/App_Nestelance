-- ============================================================
-- NEST ÉLANCE — Score Approve/Verify Workflow
-- Version: 008
--
-- The org hierarchy (004_org_hierarchy.sql) already has verifier/
-- approver as org_role values, but nothing in the scoring flow reads
-- them yet — every score_snapshots row is equally "final" the moment
-- POST /api/scoring/score creates it. This adds a review status so a
-- score only becomes official once a Verifier, then an Approver
-- (within the company's org or an ancestor org), have signed off.
--
-- Append-only by design: rejecting a snapshot doesn't mutate it back
-- to draft — it's a terminal state. A resubmission is just a fresh
-- POST /api/scoring/score, which already creates a brand new row.
-- That keeps every past review decision in the audit trail instead of
-- overwriting it.
-- ============================================================

ALTER TABLE score_snapshots
  ADD COLUMN status            TEXT NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft', 'verified', 'approved', 'rejected')),
  ADD COLUMN verified_by       UUID REFERENCES users(id),
  ADD COLUMN verified_at       TIMESTAMPTZ,
  ADD COLUMN approved_by       UUID REFERENCES users(id),
  ADD COLUMN approved_at       TIMESTAMPTZ,
  ADD COLUMN rejected_by       UUID REFERENCES users(id),
  ADD COLUMN rejected_at       TIMESTAMPTZ,
  ADD COLUMN rejection_reason  TEXT;

CREATE INDEX idx_score_snapshots_status ON score_snapshots(company_id, status);
