-- ============================================================
-- NEST ÉLANCE — Users Group, User Profile, ACL Migration
-- Version: 007
--
-- Completes the User Management spec's remaining 3 sheets:
--   - acl_permissions: the low-level permission catalog (T-ACL)
--   - user_groups (+ join table): bundles ACL permissions per role,
--     assignable to users (T-USR_GRP)
--   - user_profiles: reusable password/account security policy
--     templates, assignable to users, one default per org (T-USR_PRF)
--
-- Scope note: these are real, working data models + CRUD APIs. What's
-- deliberately NOT done here: rewiring the existing org_role-based
-- authorization (require_org_role / can_view_org) to consult ACL
-- permissions dynamically, and actually enforcing password-policy
-- fields against Supabase Auth at signup/login time. Both are real
-- follow-on integration work, not done in this pass — the existing,
-- already-verified auth path is left untouched rather than risking it.
-- ============================================================

-- ─── acl_permissions ─────────────────────────────────────────
CREATE TABLE acl_permissions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module      TEXT NOT NULL,
  submodule   TEXT,
  action      TEXT NOT NULL,
  name        TEXT NOT NULL,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (module, submodule, action)
);

CREATE TRIGGER trg_acl_permissions_updated_at
  BEFORE UPDATE ON acl_permissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── user_groups ─────────────────────────────────────────────
CREATE TABLE user_groups (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_groups_org ON user_groups(org_id);

CREATE TRIGGER trg_user_groups_updated_at
  BEFORE UPDATE ON user_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE user_group_permissions (
  group_id      UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES acl_permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, permission_id)
);

-- ─── user_profiles (security policy templates) ────────────────
CREATE TABLE user_profiles (
  id                            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                          TEXT NOT NULL CHECK (char_length(name) BETWEEN 5 AND 16),
  user_id_length_min            INTEGER NOT NULL DEFAULT 5  CHECK (user_id_length_min BETWEEN 5 AND 16),
  user_id_length_max            INTEGER NOT NULL DEFAULT 16 CHECK (user_id_length_max BETWEEN 5 AND 16),
  account_inactivity_days       INTEGER NOT NULL DEFAULT 30 CHECK (account_inactivity_days BETWEEN 1 AND 30),
  min_password_length           INTEGER NOT NULL DEFAULT 8  CHECK (min_password_length >= 8),
  max_wrong_password_attempts   INTEGER NOT NULL DEFAULT 3  CHECK (max_wrong_password_attempts <= 3),
  previous_password_reuse_limit INTEGER NOT NULL DEFAULT 3  CHECK (previous_password_reuse_limit BETWEEN 3 AND 7),
  password_validity_days        INTEGER NOT NULL DEFAULT 60 CHECK (password_validity_days BETWEEN 1 AND 60),
  password_expiry_warning_days  INTEGER NOT NULL DEFAULT 10 CHECK (password_expiry_warning_days >= 10),
  min_digits                    INTEGER NOT NULL DEFAULT 1  CHECK (min_digits BETWEEN 1 AND 9),
  min_uppercase                 INTEGER NOT NULL DEFAULT 1  CHECK (min_uppercase BETWEEN 1 AND 9),
  min_lowercase                 INTEGER NOT NULL DEFAULT 1  CHECK (min_lowercase BETWEEN 1 AND 9),
  min_special_chars             INTEGER NOT NULL DEFAULT 1  CHECK (min_special_chars BETWEEN 1 AND 9),
  is_default                    BOOLEAN NOT NULL DEFAULT false,
  created_by                    UUID REFERENCES users(id),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_profiles_org ON user_profiles(org_id);

-- Only one default profile per org — "Set as Default" (T-USR_PRF-05)
-- overwrites whichever profile previously held it, enforced in the API
-- (see routers/user_profiles.py), this index just guards the invariant.
CREATE UNIQUE INDEX idx_user_profiles_one_default_per_org
  ON user_profiles(org_id) WHERE is_default = true;

CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── users: group + profile assignment ─────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES user_groups(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_group_id ON users(group_id);
CREATE INDEX IF NOT EXISTS idx_users_profile_id ON users(profile_id);
