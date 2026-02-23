-- 019_feature_flags.sql
-- Phase-3 operability/security: DB-backed feature flags for safe rollout and fast rollback.

CREATE TABLE IF NOT EXISTS feature_flag (
  flag_key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  rollout_percentage INTEGER NOT NULL DEFAULT 100 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  description TEXT,
  rules_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by_user_id TEXT REFERENCES "user"(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feature_flag_updated_at ON feature_flag(updated_at DESC);
