-- 016_officer_mfa_stepup.sql
-- Phase-3 security: Officer MFA step-up challenges for sensitive actions.

CREATE TABLE IF NOT EXISTS auth_mfa_challenge (
  challenge_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(user_id),
  purpose TEXT NOT NULL,
  task_id TEXT REFERENCES task(task_id),
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  delivery_channels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  metadata_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_mfa_challenge_user
  ON auth_mfa_challenge(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_mfa_challenge_task
  ON auth_mfa_challenge(task_id, created_at DESC)
  WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_mfa_challenge_active
  ON auth_mfa_challenge(user_id, purpose, expires_at)
  WHERE consumed_at IS NULL;
