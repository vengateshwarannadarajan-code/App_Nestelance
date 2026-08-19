-- ============================================================
-- NEST ÉLANCE — Dummy data for Groups / User Profiles / ACL
--
-- Purpose: populate the 3 new admin tabs (Groupes, Profils
-- utilisateur, ACL) with sample rows so you can see them rendered
-- on nestelance.com/admin without having to click through the
-- create forms by hand.
--
-- Prerequisites:
--   1. Run 007_groups_profiles_acl.sql first (creates the tables).
--   2. At least one row must already exist in `organizations`.
--      If you have none yet, onboard one from the admin UI first.
--
-- Safe to re-run: every insert is guarded so running this twice
-- won't create duplicate rows.
--
-- IMPORTANT: clear the SQL Editor completely (Ctrl+A, Delete) before
-- pasting this in — leftover text from a previous query in the same
-- tab is what broke the last run.
-- ============================================================

-- ─── Bootstrap org (only if `organizations` is completely empty) ─
-- Groups/Profiles below attach to "whichever org was created first" —
-- if you haven't onboarded a real one yet via the admin UI, this
-- creates a placeholder Enterprise org so the seed has somewhere to
-- attach to. Safe to leave in place, or delete it later once you've
-- onboarded a real organization.
INSERT INTO organizations (org_type, name)
SELECT 'enterprise', 'Demo SME'
WHERE NOT EXISTS (SELECT 1 FROM organizations);

-- ─── ACL permissions (platform-wide catalog) ───────────────────
INSERT INTO acl_permissions (module, submodule, action, name) VALUES
  ('users',         NULL,             'create', 'Creer un utilisateur'),
  ('users',         NULL,             'read',   'Voir les utilisateurs'),
  ('users',         NULL,             'update', 'Modifier un utilisateur'),
  ('users',         NULL,             'delete', 'Supprimer un utilisateur'),
  ('organizations', NULL,             'create', 'Creer une organisation'),
  ('organizations', NULL,             'read',   'Voir les organisations'),
  ('organizations', NULL,             'update', 'Modifier une organisation'),
  ('reports',       NULL,             'create', 'Generer un rapport'),
  ('reports',       NULL,             'read',   'Voir les rapports'),
  ('companies',     NULL,             'read',   'Voir les entreprises'),
  ('companies',     NULL,             'update', 'Modifier une entreprise'),
  ('audit',         'login-history',  'read',   'Voir historique de connexion'),
  ('audit',         'activity-log',   'read',   'Voir le journal activite'),
  ('billing',       NULL,             'read',   'Voir la facturation'),
  ('billing',       NULL,             'update', 'Gerer la facturation')
ON CONFLICT (module, submodule, action) DO NOTHING;

-- ─── Group: "Administrateurs" — full access ────────────────────
WITH org AS (
  SELECT id AS org_id FROM organizations ORDER BY created_at ASC LIMIT 1
), ins AS (
  INSERT INTO user_groups (org_id, name, description)
  SELECT org_id, 'Administrateurs', 'Acces complet - gestion des utilisateurs et organisations'
  FROM org
  WHERE NOT EXISTS (
    SELECT 1 FROM user_groups ug, org WHERE ug.org_id = org.org_id AND ug.name = 'Administrateurs'
  )
  RETURNING id
)
INSERT INTO user_group_permissions (group_id, permission_id)
SELECT ins.id, p.id
FROM ins, acl_permissions p
WHERE p.module IN ('users', 'organizations', 'billing');

-- ─── Group: "Lecteurs" — read-only ──────────────────────────────
WITH org AS (
  SELECT id AS org_id FROM organizations ORDER BY created_at ASC LIMIT 1
), ins AS (
  INSERT INTO user_groups (org_id, name, description)
  SELECT org_id, 'Lecteurs', 'Consultation seule - rapports et entreprises'
  FROM org
  WHERE NOT EXISTS (
    SELECT 1 FROM user_groups ug, org WHERE ug.org_id = org.org_id AND ug.name = 'Lecteurs'
  )
  RETURNING id
)
INSERT INTO user_group_permissions (group_id, permission_id)
SELECT ins.id, p.id
FROM ins, acl_permissions p
WHERE p.action = 'read' AND p.module IN ('reports', 'companies', 'audit');

-- ─── Profile: "Standard" — spec defaults, marked as org default ─
WITH org AS (
  SELECT id AS org_id FROM organizations ORDER BY created_at ASC LIMIT 1
)
INSERT INTO user_profiles (org_id, name, is_default)
SELECT org_id, 'Standard', true
FROM org
WHERE NOT EXISTS (
  SELECT 1 FROM user_profiles up, org WHERE up.org_id = org.org_id AND up.name = 'Standard'
);

-- ─── Profile: "Renforce" — stricter password policy, not default ─
WITH org AS (
  SELECT id AS org_id FROM organizations ORDER BY created_at ASC LIMIT 1
)
INSERT INTO user_profiles (
  org_id, name, min_password_length, max_wrong_password_attempts,
  previous_password_reuse_limit, password_validity_days,
  password_expiry_warning_days, min_digits, min_uppercase,
  min_lowercase, min_special_chars, is_default
)
SELECT org_id, 'Renforce', 12, 3, 5, 30, 14, 2, 2, 2, 2, false
FROM org
WHERE NOT EXISTS (
  SELECT 1 FROM user_profiles up, org WHERE up.org_id = org.org_id AND up.name = 'Renforce'
);
