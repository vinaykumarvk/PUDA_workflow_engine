-- Add 'declaration' to citizen_document origin constraint
ALTER TABLE citizen_document DROP CONSTRAINT IF EXISTS chk_citizen_doc_origin;
ALTER TABLE citizen_document ADD CONSTRAINT chk_citizen_doc_origin
  CHECK (origin IN ('uploaded', 'issued', 'declaration'));
