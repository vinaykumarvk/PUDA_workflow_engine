-- Sprint B migrations
-- B1: verification_data column on task
ALTER TABLE task ADD COLUMN IF NOT EXISTS verification_data JSONB;

-- B6: authority_holiday table for working-day SLA
CREATE TABLE IF NOT EXISTS authority_holiday (
    authority_id TEXT NOT NULL REFERENCES authority(authority_id),
    holiday_date DATE NOT NULL,
    description TEXT,
    PRIMARY KEY (authority_id, holiday_date)
);

-- B7: OTP and password reset token tables (replace in-memory stores)
CREATE TABLE IF NOT EXISTS otp_store (
    identifier TEXT PRIMARY KEY,
    otp TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_token (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(user_id),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cleanup index for expired records
CREATE INDEX IF NOT EXISTS idx_otp_store_expires ON otp_store(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_token(expires_at);
