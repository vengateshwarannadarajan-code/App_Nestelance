-- ============================================================
-- NEST ÉLANCE — Login History & Activity Log Migration
-- Version: 006
--
-- Supabase's built-in auth.audit_log_entries exists on this project
-- but has zero rows despite real login activity — it isn't actually
-- being populated (confirmed by direct query before writing this).
-- These are custom tables the backend writes to explicitly instead,
-- capturing the server-seen IP (more trustworthy than anything the
-- browser could self-report) at the moment of login/logout.
-- ============================================================

CREATE TABLE login_history (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  email        TEXT NOT NULL,        -- captured even on failed logins where user_id is unknown
  event_type   TEXT NOT NULL DEFAULT 'login' CHECK (event_type IN ('login','logout')),
  success      BOOLEAN NOT NULL DEFAULT true,
  description  TEXT,                 -- e.g. "Success", "Invalid password", "Account inactive"
  ip_address   TEXT,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_history_user ON login_history(user_id);
CREATE INDEX idx_login_history_created ON login_history(created_at DESC);
CREATE INDEX idx_login_history_email ON login_history(email);

CREATE TABLE activity_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  org_id       UUID REFERENCES organizations(id) ON DELETE SET NULL,
  module       TEXT NOT NULL,        -- e.g. 'users', 'organizations', 'scoring'
  action       TEXT NOT NULL,        -- e.g. 'create', 'update', 'delete', 'status_change'
  details      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_log_user ON activity_log(user_id);
CREATE INDEX idx_activity_log_org ON activity_log(org_id);
CREATE INDEX idx_activity_log_created ON activity_log(created_at DESC);

-- Both tables are only ever written to by the FastAPI backend (service
-- key, bypasses RLS) — these SELECT policies are defense-in-depth for
-- the (currently nonexistent) case of a direct client-side query, not
-- the primary access path.
ALTER TABLE login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY login_history_visibility ON login_history
  FOR SELECT USING (
    is_super_admin(auth.uid())
    OR user_id IN (
      SELECT u.id FROM users u
      JOIN organizations o ON o.id = u.org_id
      WHERE o.path LIKE (my_org_path(auth.uid()) || '%')
    )
  );

CREATE POLICY activity_log_visibility ON activity_log
  FOR SELECT USING (
    is_super_admin(auth.uid())
    OR (org_id IS NOT NULL AND org_id IN (
      SELECT o.id FROM organizations o WHERE o.path LIKE (my_org_path(auth.uid()) || '%')
    ))
  );
