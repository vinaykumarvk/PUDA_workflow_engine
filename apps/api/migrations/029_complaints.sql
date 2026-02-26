CREATE TABLE IF NOT EXISTS complaint (
  complaint_id      TEXT PRIMARY KEY,
  complaint_number  TEXT UNIQUE NOT NULL,
  user_id           TEXT NOT NULL REFERENCES "user"(user_id),
  violation_type    TEXT NOT NULL CHECK (violation_type IN (
    'UNAUTHORIZED_CONSTRUCTION','PLAN_DEVIATION','ENCROACHMENT',
    'HEIGHT_VIOLATION','SETBACK_VIOLATION','CHANGE_OF_USE',
    'UNAUTHORIZED_COLONY','OTHER'
  )),
  location_address  TEXT NOT NULL,
  location_locality TEXT,
  location_city     TEXT NOT NULL DEFAULT 'Mohali',
  location_district TEXT NOT NULL DEFAULT 'SAS Nagar',
  location_pincode  TEXT,
  subject           TEXT NOT NULL,
  description       TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN (
    'SUBMITTED','UNDER_REVIEW','INSPECTION_ORDERED',
    'ACTION_TAKEN','RESOLVED','CLOSED','REJECTED'
  )),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ,
  officer_remarks   TEXT
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'complaint_number_seq') THEN
    CREATE SEQUENCE complaint_number_seq START 1;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_complaint_user ON complaint(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complaint_status ON complaint(status)
  WHERE status NOT IN ('RESOLVED','CLOSED','REJECTED');

CREATE TABLE IF NOT EXISTS complaint_evidence (
  evidence_id       TEXT PRIMARY KEY,
  complaint_id      TEXT NOT NULL REFERENCES complaint(complaint_id),
  storage_key       TEXT NOT NULL,
  original_filename TEXT,
  mime_type         TEXT,
  size_bytes        INTEGER,
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by       TEXT NOT NULL REFERENCES "user"(user_id)
);

CREATE INDEX IF NOT EXISTS idx_complaint_evidence ON complaint_evidence(complaint_id);
