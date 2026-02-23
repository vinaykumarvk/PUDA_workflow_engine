-- 017_audit_hash_chain.sql
-- Phase-3 security: tamper-evident hash chain for audit_event rows.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE audit_event
  ADD COLUMN IF NOT EXISTS prev_event_hash TEXT,
  ADD COLUMN IF NOT EXISTS event_hash TEXT,
  ADD COLUMN IF NOT EXISTS hash_version TEXT NOT NULL DEFAULT 'v1';

CREATE INDEX IF NOT EXISTS idx_audit_chain_order
  ON audit_event(created_at, event_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_event_hash_unique
  ON audit_event(event_hash)
  WHERE event_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION set_audit_event_hash_chain_v1()
RETURNS trigger AS $$
DECLARE
  previous_hash TEXT;
  canonical_payload TEXT;
BEGIN
  -- Serialize chain updates so concurrent inserts cannot fork the chain.
  PERFORM pg_advisory_xact_lock(982451653);

  SELECT event_hash
    INTO previous_hash
    FROM audit_event
   WHERE event_hash IS NOT NULL
   ORDER BY created_at DESC, event_id DESC
   LIMIT 1;

  IF previous_hash IS NULL THEN
    previous_hash := 'GENESIS';
  END IF;

  NEW.hash_version := 'v1';
  NEW.prev_event_hash := previous_hash;

  canonical_payload := concat_ws(
    '|',
    NEW.event_id,
    COALESCE(NEW.arn, ''),
    COALESCE(NEW.event_type, ''),
    COALESCE(NEW.actor_type, ''),
    COALESCE(NEW.actor_id, ''),
    COALESCE(NEW.payload_jsonb::text, '{}'::text),
    to_char(COALESCE(NEW.created_at, NOW()) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    NEW.prev_event_hash
  );

  NEW.event_hash := encode(digest(canonical_payload, 'sha256'), 'hex');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_event_hash_chain_v1 ON audit_event;
CREATE TRIGGER trg_audit_event_hash_chain_v1
BEFORE INSERT ON audit_event
FOR EACH ROW
EXECUTE FUNCTION set_audit_event_hash_chain_v1();

DO $$
DECLARE
  rec RECORD;
  running_prev_hash TEXT := 'GENESIS';
  canonical_payload TEXT;
  computed_hash TEXT;
BEGIN
  -- Serialize backfill with live inserts.
  PERFORM pg_advisory_lock(982451653);

  FOR rec IN
    SELECT event_id, arn, event_type, actor_type, actor_id, payload_jsonb, created_at
    FROM audit_event
    ORDER BY created_at ASC, event_id ASC
  LOOP
    canonical_payload := concat_ws(
      '|',
      rec.event_id,
      COALESCE(rec.arn, ''),
      COALESCE(rec.event_type, ''),
      COALESCE(rec.actor_type, ''),
      COALESCE(rec.actor_id, ''),
      COALESCE(rec.payload_jsonb::text, '{}'::text),
      to_char(rec.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      running_prev_hash
    );
    computed_hash := encode(digest(canonical_payload, 'sha256'), 'hex');

    UPDATE audit_event
       SET prev_event_hash = running_prev_hash,
           event_hash = computed_hash,
           hash_version = 'v1'
     WHERE event_id = rec.event_id;

    running_prev_hash := computed_hash;
  END LOOP;

  PERFORM pg_advisory_unlock(982451653);
END $$;
