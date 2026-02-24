-- 025: Add document expiry tracking columns
-- Adds valid_from / valid_until to citizen_document
-- Adds expiry_flagged to application_document

ALTER TABLE citizen_document ADD COLUMN IF NOT EXISTS valid_from DATE;
ALTER TABLE citizen_document ADD COLUMN IF NOT EXISTS valid_until DATE;

ALTER TABLE application_document ADD COLUMN IF NOT EXISTS expiry_flagged BOOLEAN DEFAULT FALSE;
