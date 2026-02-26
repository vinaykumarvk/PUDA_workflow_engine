-- 030_document_locker_backfill.sql
-- Backfill orphan document rows that have no matching application_document rows.
-- This covers failed dual-writes or data from before migration 024.
-- Reuses the same storage_key (no file copy).

DO $$
DECLARE
  rec RECORD;
  new_citizen_doc_id TEXT;
  citizen_ver INTEGER;
  new_app_doc_id TEXT;
BEGIN
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
      -- Only rows with no corresponding application_document
      AND NOT EXISTS (
        SELECT 1 FROM application_document ad
        WHERE ad.arn = d.arn AND ad.doc_type_id = d.doc_type_id
      )
    ORDER BY d.uploaded_at ASC
  LOOP
    -- Compute citizen version for this user+doc_type_id
    SELECT COALESCE(MAX(citizen_version), 0) + 1
      INTO citizen_ver
      FROM citizen_document
     WHERE user_id = rec.applicant_user_id
       AND doc_type_id = rec.doc_type_id;

    new_citizen_doc_id := gen_random_uuid()::TEXT;

    -- Mark previous locker versions as not current for this user+doc_type
    UPDATE citizen_document
       SET is_current = FALSE
     WHERE user_id = rec.applicant_user_id
       AND doc_type_id = rec.doc_type_id
       AND is_current = TRUE;

    INSERT INTO citizen_document (
      citizen_doc_id, user_id, doc_type_id, citizen_version,
      storage_key, original_filename, mime_type, size_bytes,
      checksum, uploaded_at, is_current, status, origin
    ) VALUES (
      new_citizen_doc_id, rec.applicant_user_id, rec.doc_type_id, citizen_ver,
      rec.storage_key, rec.original_filename, rec.mime_type, rec.size_bytes,
      rec.checksum, rec.uploaded_at, rec.is_current, 'VALID', 'uploaded'
    );

    new_app_doc_id := gen_random_uuid()::TEXT;

    INSERT INTO application_document (
      app_doc_id, arn, citizen_doc_id, doc_type_id,
      attached_at, attached_by_user_id,
      verification_status, verified_by_user_id, verified_at,
      verification_remarks, is_current
    ) VALUES (
      new_app_doc_id, rec.arn, new_citizen_doc_id, rec.doc_type_id,
      rec.uploaded_at, rec.applicant_user_id,
      rec.verification_status, rec.verified_by_user_id, rec.verified_at,
      rec.verification_remarks, rec.is_current
    );
  END LOOP;

  RAISE NOTICE 'Document locker backfill complete';
END
$$;
