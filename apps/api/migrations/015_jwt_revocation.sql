-- 015_jwt_revocation.sql
-- Phase-3 security: JWT revocation and forced logout controls.
--
-- Design:
-- 1) auth_token_denylist: immediate revocation of an individual JWT by jti.
-- 2) user_token_security: user-wide revoke-before timestamp (logout-all / admin forced logout).

CREATE TABLE IF NOT EXISTS auth_token_denylist (
  jti TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(user_id),
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  revoked_by_user_id TEXT REFERENCES "user"(user_id),
  metadata_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_auth_token_denylist_user ON auth_token_denylist(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_token_denylist_expires_at ON auth_token_denylist(expires_at);

CREATE TABLE IF NOT EXISTS user_token_security (
  user_id TEXT PRIMARY KEY REFERENCES "user"(user_id),
  revoked_before TIMESTAMPTZ NOT NULL DEFAULT to_timestamp(0),
  reason TEXT,
  updated_by_user_id TEXT REFERENCES "user"(user_id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_token_security_revoked_before
  ON user_token_security(revoked_before);
