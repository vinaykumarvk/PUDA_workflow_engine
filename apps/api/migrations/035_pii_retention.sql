-- ARC-032-033: PII retention framework
-- Adds anonymized_at column and partial index for retention job targeting

ALTER TABLE application ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;

-- Partial index: find disposed-but-not-yet-anonymized applications efficiently
CREATE INDEX IF NOT EXISTS idx_application_retention
  ON application(disposed_at) WHERE anonymized_at IS NULL AND disposed_at IS NOT NULL;
