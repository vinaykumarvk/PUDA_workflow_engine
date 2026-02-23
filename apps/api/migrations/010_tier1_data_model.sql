-- 010_tier1_data_model.sql
-- Tier-1 data model review changes:
--   1. Schema versioning + tenancy stamped into data_jsonb at app creation (code change, no DDL).
--   2. Status history recorded in data_jsonb.application.statusHistory (code change, no DDL).
--   3. Optimistic concurrency: row_version already exists; add COMMENT for clarity.
--   4. Document versioning: DB document table already has version column;
--      Zod schema now includes documentId, version, attachments[], reviewedBy, etc.
--
-- This migration ensures any environments that missed row_version get it,
-- and backfills schemaVersion into existing data_jsonb blobs.

-- Ensure row_version column exists (idempotent — may already exist from 002)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'application' AND column_name = 'row_version'
  ) THEN
    ALTER TABLE application ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

COMMENT ON COLUMN application.row_version IS
  'Optimistic concurrency token. Callers must supply their known row_version on update; '
  'the server rejects the write (HTTP 409 CONFLICT) if it has been incremented by another writer.';

-- Backfill schemaVersion into existing data_jsonb that lack it.
-- This is safe because jsonb_set is a pure function on existing data.
UPDATE application
SET data_jsonb = jsonb_set(data_jsonb, '{schemaVersion}', '"1.0"'::jsonb)
WHERE data_jsonb->>'schemaVersion' IS NULL;

-- Backfill tenantId from the authority_id column into data_jsonb
UPDATE application
SET data_jsonb = jsonb_set(data_jsonb, '{tenantId}', to_jsonb(authority_id))
WHERE data_jsonb->>'tenantId' IS NULL;

-- Backfill serviceVersion from the service_version column into data_jsonb
UPDATE application
SET data_jsonb = jsonb_set(data_jsonb, '{serviceVersion}', to_jsonb(service_version))
WHERE data_jsonb->>'serviceVersion' IS NULL;

-- Initialise empty statusHistory array on any application that lacks it
UPDATE application
SET data_jsonb = jsonb_set(
  COALESCE(data_jsonb, '{}'::jsonb),
  '{application,statusHistory}',
  '[]'::jsonb
)
WHERE data_jsonb->'application' IS NOT NULL
  AND data_jsonb->'application'->'statusHistory' IS NULL;
