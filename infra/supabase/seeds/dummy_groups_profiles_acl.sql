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
--   2. At least one row must already exist in `organizations` —
--      this script attaches the dummy Groups/Profiles to whichever
--      organization was created first. If you have none yet, onboard
--      one from the admin UI (or via POST /api/organizations) before
--      running this.
--
-- Safe to re-run: every insert is guarded so running this twice
-- won't create duplicate rows.
-- ============================================================

-- ─── ACL permissions (platform-wide catalog) ───────────────────
INSERT INTO acl_permissions (module, submodule, action, name) VALUES
  ('users',         NULL,             'create', 'Créer un utilisateur'),
  ('users',         NULL,             'read',   'Voir les utilisateurs'),
  ('users',         NULL,             'update', 'Modifier un utilisateur'),
  ('users',         NULL,             'delete', 'Supprimer un utilisateur'),
  ('organizations', NULL,             'create', 'Créer une organisation'),
  ('organizations', NULL,             'read',   'Voir les organisations'),
  ('organizations', NULL,             'update', 'Modifier une organisation'),
  ('reports',       NULL,             'create', 'Générer un rapport'),
  ('reports',       NULL,             'read',   'Voir les rapports'),
  ('companies',     NULL,             'read',   'Voir les entreprises'),
  ('companies',     NULL,             'update', 'Modifier une entreprise'),
  ('audit',         'login-history',  'read',   'Voir l''historique de connexion'),
  ('audit',         'activity-log',   'read',   'Voir le journal d''activité'),
  ('billing',       NULL,             'read',   'Voir la facturation'),
  ('billing',       NULL,             'update', 'Gérer la facturation')
ON CONFLICT (module, submodule, action) DO NOTHING;

-- ─── Groups + Profiles, attached to the first organization ────
DO $$
DECLARE
  v_org_id   UUID;
  v_group_admin UUID;
  v_group_viewer UUID;
BEGIN
  SELECT id INTO v_org_id FROM organizations ORDER BY created_at ASC LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE NOTICE 'No organizations found — skipping Groups/Profiles seed. Onboard an org first, then re-run this script.';
    RETURN;
  END IF;

  -- Group: "Administrateurs" — full access
  IF NOT EXISTS (SELECT 1 FROM user_groups WHERE org_id = v_org_id AND name = 'Administrateurs') THEN
    INSERT INTO user_groups (org_id, name, description)
    VALUES (v_org_id, 'Administrateurs', 'Accès complet — gestion des utilisateurs et organisations')
    RETURNING id INTO v_group_admin;

    INSERT INTO user_group_permissions (group_id, permission_id)
    SELECT v_group_admin, id FROM acl_permissions
    WHERE module IN ('users', 'organizations', 'billing');
  END IF;

  -- Group: "Lecteurs" — read-only
  IF NOT EXISTS (SELECT 1 FROM user_groups WHERE org_id = v_org_id AND name = 'Lecteurs') THEN
    INSERT INTO user_groups (org_id, name, description)
    VALUES (v_org_id, 'Lecteurs', 'Consultation seule — rapports et entreprises')
    RETURNING id INTO v_group_viewer;

    INSERT INTO user_group_permissions (group_id, permission_id)
    SELECT v_group_viewer, id FROM acl_permissions
    WHERE action = 'read' AND module IN ('reports', 'companies', 'audit');
  END IF;

  -- Profile: "Standard" — spec defaults, marked as default for the org
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE org_id = v_org_id AND name = 'Standard') THEN
    INSERT INTO user_profiles (org_id, name, is_default)
    VALUES (v_org_id, 'Standard', true);
  END IF;

  -- Profile: "Renforcé" — stricter password policy, not default
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE org_id = v_org_id AND name = 'Renforce') THEN
    INSERT INTO user_profiles (
      org_id, name, min_password_length, max_wrong_password_attempts,
      previous_password_reuse_limit, password_validity_days,
      password_expiry_warning_days, min_digits, min_uppercase,
      min_lowercase, min_special_chars, is_default
    ) VALUES (
      v_org_id, 'Renforce', 12, 3, 5, 30, 14, 2, 2, 2, 2, false
    );
  END IF;
END $$;
