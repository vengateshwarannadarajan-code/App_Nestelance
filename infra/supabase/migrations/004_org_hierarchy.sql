-- ============================================================
-- NEST ÉLANCE — Organization Hierarchy Migration
-- Version: 004
--
-- Introduces a multi-tenant channel hierarchy:
--   Super Admin (platform owner, is_super_admin=true — not a per-org role)
--     -> Distributor  -> can onboard Aggregator, Enterprise, Consultant
--          -> Aggregator -> can onboard Enterprise, Consultant
--               -> Enterprise (= existing `companies` row, ESG-scored)
--               -> Consultant -> can onboard Enterprise
--
-- Whoever onboards an org becomes its parent (variable-depth tree —
-- any of Distributor/Aggregator/Consultant/Super-Admin can onboard an
-- Enterprise directly, not just via a fixed chain). A parent org sees
-- all descendant orgs' data, recursively — enforced via a materialized
-- ancestor `path` column rather than a recursive query per request.
--
-- Existing `role`/`plan`/`company_id` columns on `users` and the
-- `consultant_clients` ad-hoc service-link table are left untouched —
-- org_role is an additional authorization axis on top of subscription
-- `plan`, not a replacement for it.
-- ============================================================

-- ─── organizations ──────────────────────────────────────────
CREATE TABLE organizations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_type        TEXT NOT NULL CHECK (org_type IN (
                    'distributor','aggregator','enterprise','consultant')),
  name            TEXT NOT NULL,
  parent_org_id   UUID REFERENCES organizations(id) ON DELETE RESTRICT,
  path            TEXT NOT NULL,          -- materialized ancestor path, e.g. '/id1/id2/'
  domain          TEXT,                   -- optional: restrict signup to this email domain
  max_users       INTEGER,                -- optional: cap on users this org can create
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_parent ON organizations(parent_org_id);
-- text_pattern_ops makes `path LIKE 'prefix%'` use this index (locale-independent prefix match)
CREATE INDEX idx_organizations_path ON organizations (path text_pattern_ops);

-- Auto-compute `path` from the parent's path at insert time, so
-- "org A can see org B" reduces to `B.path LIKE A.path || '%'` —
-- no recursive CTE needed on every request.
CREATE OR REPLACE FUNCTION set_organization_path() RETURNS TRIGGER AS $$
DECLARE
  parent_path TEXT;
BEGIN
  IF NEW.parent_org_id IS NULL THEN
    NEW.path := '/' || NEW.id::text || '/';
  ELSE
    SELECT path INTO parent_path FROM organizations WHERE id = NEW.parent_org_id;
    IF parent_path IS NULL THEN
      RAISE EXCEPTION 'Parent organization % not found', NEW.parent_org_id;
    END IF;
    NEW.path := parent_path || NEW.id::text || '/';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_set_path
  BEFORE INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_organization_path();

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── users: org membership ──────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS org_role TEXT CHECK (org_role IN (
                    'admin','viewer','verifier','approver'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);

-- ─── companies: link each Enterprise to its org tree entry ──
ALTER TABLE companies ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_org_id ON companies(org_id) WHERE org_id IS NOT NULL;

-- ============================================================
-- RLS
--
-- The FastAPI backend uses the service-role key for all of its own
-- queries, which bypasses RLS entirely — these policies are the real
-- enforcement boundary for the handful of places the frontend talks to
-- Supabase directly with the user's own session (apps/web + nestelance
-- both do this for `users` inserts/reads during auth). Backend routes
-- still need their own Python-level org checks (see routers/organizations.py)
-- since RLS doesn't apply to service-key calls.
-- ============================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_super_admin(uid UUID) RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT u.is_super_admin FROM users u WHERE u.id = uid), false);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION my_org_path(uid UUID) RETURNS TEXT AS $$
  SELECT o.path FROM users u JOIN organizations o ON o.id = u.org_id WHERE u.id = uid;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Self-or-descendant visibility, or Super Admin sees everything.
CREATE POLICY organizations_visibility ON organizations
  FOR SELECT USING (
    is_super_admin(auth.uid())
    OR path LIKE (my_org_path(auth.uid()) || '%')
  );

-- Org rows are created through POST /api/organizations (service key,
-- validated in Python against the onboarder-type matrix) — this INSERT
-- policy is a defense-in-depth backstop, not the primary gate.
CREATE POLICY organizations_insert ON organizations
  FOR INSERT WITH CHECK (
    is_super_admin(auth.uid())
    OR parent_org_id = (SELECT u.org_id FROM users u WHERE u.id = auth.uid())
  );

-- Replace the old "own row only" users policy with self-or-descendant
-- visibility, matching organizations_visibility above.
DROP POLICY IF EXISTS users_own_row ON users;

CREATE POLICY users_self_or_descendant ON users
  FOR SELECT USING (
    id = auth.uid()
    OR is_super_admin(auth.uid())
    OR (org_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM organizations o
          WHERE o.id = users.org_id
            AND o.path LIKE (my_org_path(auth.uid()) || '%')
        ))
  );

-- Users may still only ever write their own row directly (org admins
-- creating *other* users goes through the backend's admin-privileged
-- Supabase Auth call, not a client-side insert).
CREATE POLICY users_self_write ON users
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY users_self_update ON users
  FOR UPDATE USING (id = auth.uid());
