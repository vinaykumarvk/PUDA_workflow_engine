-- Migration 014: Add index for payment gateway duplicate detection
-- This index speeds up the duplicate-check query in recordPayment()

CREATE INDEX IF NOT EXISTS idx_payment_gateway_payment_id
  ON payment(gateway_payment_id)
  WHERE gateway_payment_id IS NOT NULL;

COMMENT ON INDEX idx_payment_gateway_payment_id IS 'Supports duplicate detection during gateway callback processing';
