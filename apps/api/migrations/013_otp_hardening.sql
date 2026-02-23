-- OTP security hardening:
-- 1) Store OTP hash (not plaintext)
-- 2) Track failed attempts
-- 3) Lock identifier after repeated failures

ALTER TABLE otp_store
  ADD COLUMN IF NOT EXISTS otp_hash TEXT,
  ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

-- Keep legacy column for backward compatibility, but allow null to avoid plaintext persistence.
ALTER TABLE otp_store
  ALTER COLUMN otp DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_otp_store_locked_until ON otp_store(locked_until);
