CREATE TABLE IF NOT EXISTS authority (
  authority_id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service (
  service_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS application (
  arn TEXT PRIMARY KEY,
  service_key TEXT NOT NULL REFERENCES service(service_key),
  authority_id TEXT NOT NULL REFERENCES authority(authority_id),
  state_id TEXT NOT NULL,
  data_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  disposed_at TIMESTAMPTZ,
  disposal_type TEXT
);

CREATE TABLE IF NOT EXISTS task (
  task_id TEXT PRIMARY KEY,
  arn TEXT NOT NULL REFERENCES application(arn),
  state_id TEXT NOT NULL,
  system_role_id TEXT NOT NULL,
  assignee_user_id TEXT,
  status TEXT NOT NULL,
  sla_due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  decision TEXT,
  remarks TEXT
);

CREATE TABLE IF NOT EXISTS document (
  doc_id TEXT PRIMARY KEY,
  arn TEXT NOT NULL REFERENCES application(arn),
  doc_type_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  storage_key TEXT,
  original_filename TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  checksum TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  verification_status TEXT
);

CREATE TABLE IF NOT EXISTS query (
  query_id TEXT PRIMARY KEY,
  arn TEXT NOT NULL REFERENCES application(arn),
  query_number INTEGER NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL,
  raised_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS output (
  output_id TEXT PRIMARY KEY,
  arn TEXT NOT NULL REFERENCES application(arn),
  output_type TEXT NOT NULL,
  template_id TEXT NOT NULL,
  output_number TEXT NOT NULL,
  storage_key TEXT,
  checksum TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_event (
  event_id TEXT PRIMARY KEY,
  arn TEXT,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  payload_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_application_authority_state ON application(authority_id, state_id);
CREATE INDEX IF NOT EXISTS idx_task_state ON task(state_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_arn_created ON audit_event(arn, created_at DESC);
