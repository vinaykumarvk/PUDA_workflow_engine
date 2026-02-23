-- 018_audit_chain_position_fix.sql
-- Stabilize audit hash-chain ordering with monotonic insert sequence.

CREATE SEQUENCE IF NOT EXISTS audit_chain_position_seq;

ALTER TABLE audit_event
  ADD COLUMN IF NOT EXISTS chain_position BIGINT;

DO $$
DECLARE
  rec RECORD;
BEGIN
  -- Assign chain positions to legacy rows in deterministic historical order.
  FOR rec IN
    SELECT event_id
    FROM audit_event
    WHERE chain_position IS NULL
    ORDER BY created_at ASC, event_id ASC
  LOOP
    UPDATE audit_event
       SET chain_position = nextval('audit_chain_position_seq')
     WHERE event_id = rec.event_id;
  END LOOP;
END $$;

SELECT setval(
  'audit_chain_position_seq',
  COALESCE((SELECT MAX(chain_position) FROM audit_event), 1),
  true
);

ALTER TABLE audit_event
  ALTER COLUMN chain_position SET DEFAULT nextval('audit_chain_position_seq');

CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_chain_position_unique
  ON audit_event(chain_position);

CREATE OR REPLACE FUNCTION set_audit_event_hash_chain_v1()
RETURNS trigger AS $$
DECLARE
  previous_hash TEXT;
  canonical_payload TEXT;
BEGIN
  -- Serialize chain updates so concurrent inserts cannot fork the chain.
  PERFORM pg_advisory_xact_lock(982451653);

  IF NEW.chain_position IS NULL THEN
    NEW.chain_position := nextval('audit_chain_position_seq');
  END IF;

  SELECT event_hash
    INTO previous_hash
    FROM audit_event
   WHERE event_hash IS NOT NULL
     AND chain_position < NEW.chain_position
   ORDER BY chain_position DESC
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

DO $$
DECLARE
  rec RECORD;
  running_prev_hash TEXT := 'GENESIS';
  canonical_payload TEXT;
  computed_hash TEXT;
BEGIN
  -- Re-chain all rows by monotonic chain_position to remove ordering ambiguity.
  PERFORM pg_advisory_lock(982451653);

  FOR rec IN
    SELECT event_id, arn, event_type, actor_type, actor_id, payload_jsonb, created_at, chain_position
    FROM audit_event
    ORDER BY chain_position ASC
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
