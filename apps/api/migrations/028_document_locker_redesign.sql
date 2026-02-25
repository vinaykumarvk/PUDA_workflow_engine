-- 028: Document Locker Redesign — status model & two-section layout
-- Adds status (VALID/MISMATCH/CANCELLED), origin (uploaded/issued), and source_arn to citizen_document

ALTER TABLE citizen_document ADD COLUMN status TEXT NOT NULL DEFAULT 'VALID';
ALTER TABLE citizen_document ADD COLUMN origin TEXT NOT NULL DEFAULT 'uploaded';
ALTER TABLE citizen_document ADD COLUMN source_arn TEXT;

ALTER TABLE citizen_document ADD CONSTRAINT chk_citizen_doc_status CHECK (status IN ('VALID', 'MISMATCH', 'CANCELLED'));
ALTER TABLE citizen_document ADD CONSTRAINT chk_citizen_doc_origin CHECK (origin IN ('uploaded', 'issued'));

CREATE INDEX idx_citizen_doc_origin ON citizen_document(user_id, origin) WHERE is_current = TRUE;
