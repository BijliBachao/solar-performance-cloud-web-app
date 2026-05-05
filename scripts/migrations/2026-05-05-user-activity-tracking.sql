-- Phase 1 product analytics: user activity tracking
-- Adds last_active_at (every request) + login_count (sign-in counter).
-- Backfills last_active_at from last_login_at since the previous codepath
-- updated last_login_at on every page mount, so its semantics already
-- match "last_active_at". Also seeds login_count = 1 for users who have
-- ever signed in, so the /admin dormancy view doesn't show "never used"
-- for everyone on day 1 of deploy.
--
-- DEPLOY ORDERING — RUN THIS BEFORE PUSHING THE NEW CODE.
-- The new build references columns that don't exist on the old schema,
-- so /api/auth/user, the Clerk webhook, and /admin/organizations will
-- 500 if the app restart happens first. Apply this migration, verify
-- with a SELECT, then deploy.
--
-- Apply on production with:
--   psql "$DATABASE_URL" -f scripts/migrations/2026-05-05-user-activity-tracking.sql

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS login_count    INTEGER NOT NULL DEFAULT 0;

UPDATE users
SET last_active_at = last_login_at
WHERE last_active_at IS NULL
  AND last_login_at  IS NOT NULL;

-- Seed login_count to 1 for users who have signed in at least once.
-- Without this, every existing user shows "never used" until the next
-- session.created webhook fires.
UPDATE users
SET login_count = 1
WHERE login_count = 0
  AND last_login_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_last_active_at_idx ON users (last_active_at);

COMMIT;
