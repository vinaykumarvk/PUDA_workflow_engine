-- 024_document_locker.sql
-- Citizen-level document ownership ("Document Locker") with cross-application reuse.

-- Table: citizen_document (the locker)
CREATE TABLE IF NOT EXISTS citizen_document (
  citizen_doc_id   TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES "user"(user_id),
  doc_type_id      TEXT NOT NULL,
  citizen_version  INTEGER NOT NULL DEFAULT 1,
  storage_key      TEXT NOT NULL,
  original_filename TEXT,
  mime_type        TEXT,
  size_bytes       INTEGER,
  checksum         TEXT,
  uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_current       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_citizen_doc_user_type
  ON citizen_document(user_id, doc_type_id, citizen_version DESC);
CREATE INDEX IF NOT EXISTS idx_citizen_doc_user_current
  ON citizen_document(user_id) WHERE is_current = TRUE;

-- Table: application_document (junction: locker doc -> application)
CREATE TABLE IF NOT EXISTS application_document (
  app_doc_id            TEXT PRIMARY KEY,
  arn                   TEXT NOT NULL REFERENCES application(arn),
  citizen_doc_id        TEXT NOT NULL REFERENCES citizen_document(citizen_doc_id),
  doc_type_id           TEXT NOT NULL,
  attached_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attached_by_user_id   TEXT REFERENCES "user"(user_id),
  verification_status   TEXT DEFAULT 'PENDING',
  verified_by_user_id   TEXT REFERENCES "user"(user_id),
  verified_at           TIMESTAMPTZ,
  verification_remarks  TEXT,
  is_current            BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (arn, citizen_doc_id)
);

CREATE INDEX IF NOT EXISTS idx_app_doc_arn
  ON application_document(arn, doc_type_id) WHERE is_current = TRUE;
CREATE INDEX IF NOT EXISTS idx_app_doc_citizen
  ON application_document(citizen_doc_id);

-- Data migration: copy existing document rows into citizen_document + application_document
DO $$
DECLARE
  rec RECORD;
  new_citizen_doc_id TEXT;
  citizen_ver INTEGER;
BEGIN
  -- Only run if citizen_document is empty (idempotent)
  IF EXISTS (SELECT 1 FROM citizen_document LIMIT 1) THEN
    RAISE NOTICE 'citizen_document already has data, skipping migration';
    RETURN;
  END IF;

  FOR rec IN
    SELECT d.doc_id, d.arn, d.doc_type_id, d.version, d.storage_key,
           d.original_filename, d.mime_type, d.size_bytes, d.checksum,
           d.uploaded_by_user_id, d.uploaded_at, d.is_current,
           d.verification_status, d.verified_by_user_id, d.verified_at,
           d.verification_remarks,
           a.applicant_user_id
    FROM document d
    JOIN application a ON a.arn = d.arn
    WHERE d.storage_key IS NOT NULL
      AND a.applicant_user_id IS NOT NULL
    ORDER BY d.uploaded_at ASC
  LOOP
    -- Compute citizen version for this user+doc_type_id
    SELECT COALESCE(MAX(citizen_version), 0) + 1
      INTO citizen_ver
      FROM citizen_document
     WHERE user_id = rec.applicant_user_id
       AND doc_type_id = rec.doc_type_id;

    new_citizen_doc_id := gen_random_uuid()::TEXT;

    -- Mark previous versions as not current for this user+doc_type
    UPDATE citizen_document
       SET is_current = FALSE
     WHERE user_id = rec.applicant_user_id
       AND doc_type_id = rec.doc_type_id
       AND is_current = TRUE;

    INSERT INTO citizen_document (
      citizen_doc_id, user_id, doc_type_id, citizen_version,
      storage_key, original_filename, mime_type, size_bytes,
      checksum, uploaded_at, is_current
    ) VALUES (
      new_citizen_doc_id, rec.applicant_user_id, rec.doc_type_id, citizen_ver,
      rec.storage_key, rec.original_filename, rec.mime_type, rec.size_bytes,
      rec.checksum, rec.uploaded_at, rec.is_current
    );

    INSERT INTO application_document (
      app_doc_id, arn, citizen_doc_id, doc_type_id,
      attached_at, attached_by_user_id,
      verification_status, verified_by_user_id, verified_at,
      verification_remarks, is_current
    ) VALUES (
      gen_random_uuid()::TEXT, rec.arn, new_citizen_doc_id, rec.doc_type_id,
      rec.uploaded_at, rec.applicant_user_id,
      rec.verification_status, rec.verified_by_user_id, rec.verified_at,
      rec.verification_remarks, rec.is_current
    );
  END LOOP;

  RAISE NOTICE 'Document locker migration complete';
END
$$;
