-- ============================================================
-- NEST ÉLANCE — Users Module Migration
-- Version: 005
--
-- Extends `users` with the fields the User Management "All Users"
-- test-case spec requires that weren't already there: username
-- (distinct from email), mobile, designation, department, telephone,
-- DOB, an active/inactive status, and a soft-delete timestamp.
--
-- 2FA/OTP are deliberately NOT custom columns here — Supabase Auth
-- already has native MFA (TOTP) and OTP support; those are wired via
-- the client SDK's auth.mfa / signInWithOtp APIs in a later pass, not
-- reimplemented from scratch.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS designation TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telephone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS dob DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Username unique among non-deleted users only (a deleted user's old
-- username shouldn't block a new user from taking it).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
  ON users(username) WHERE username IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status) WHERE deleted_at IS NULL;
