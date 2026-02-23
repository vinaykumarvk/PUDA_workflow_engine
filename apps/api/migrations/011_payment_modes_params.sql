-- 011_payment_modes_params.sql
-- Tier-2 low-risk data model changes:
--   1. Expand payment table with provider tracking and reconciliation columns.
--   2. No DDL needed for parametersMap (lives in data_jsonb, schema-only change).
--
-- All columns are optional (NULL-able) — fully backward compatible.

-- Provider-level tracking
ALTER TABLE payment ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS provider_name            TEXT;

-- Failure tracking
ALTER TABLE payment ADD COLUMN IF NOT EXISTS failure_reason           TEXT;

-- Reconciliation
ALTER TABLE payment ADD COLUMN IF NOT EXISTS reconciled_at            TIMESTAMPTZ;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS reconciliation_status    TEXT;  -- PENDING, RECONCILED, MISMATCH, MANUAL_REVIEW

-- Index for reconciliation dashboard queries
CREATE INDEX IF NOT EXISTS idx_payment_reconciliation
  ON payment(reconciliation_status, initiated_at DESC)
  WHERE reconciliation_status IS NOT NULL;

COMMENT ON COLUMN payment.provider_transaction_id IS 'Transaction ID returned by payment provider (Razorpay, PayU, bank UTR, etc.)';
COMMENT ON COLUMN payment.provider_name            IS 'Payment provider / gateway name for multi-gateway setups';
COMMENT ON COLUMN payment.failure_reason           IS 'Human-readable reason if payment failed or was declined';
COMMENT ON COLUMN payment.reconciled_at            IS 'Timestamp when matched with bank/gateway settlement';
COMMENT ON COLUMN payment.reconciliation_status    IS 'PENDING | RECONCILED | MISMATCH | MANUAL_REVIEW';
