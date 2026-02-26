-- Add content_hash column to schema_migrations for drift detection.
-- Existing rows get NULL; new migrations will populate the hash on apply.
ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS content_hash TEXT;
