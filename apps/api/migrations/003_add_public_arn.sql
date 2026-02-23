-- Add public_arn for submitted ARN display
ALTER TABLE application ADD COLUMN IF NOT EXISTS public_arn TEXT;

-- Backfill for existing records
UPDATE application SET public_arn = arn WHERE public_arn IS NULL;

-- Ensure uniqueness for public ARN
CREATE UNIQUE INDEX IF NOT EXISTS idx_application_public_arn ON application(public_arn);
