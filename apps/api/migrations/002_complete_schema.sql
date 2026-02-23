-- Complete Database Schema for PUDA Workflow Engine

-- Authorities
CREATE TABLE IF NOT EXISTS authority (
  authority_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  locale TEXT DEFAULT 'en-IN',
  timezone TEXT DEFAULT 'Asia/Kolkata',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- System Roles (platform-wide, stable)
CREATE TABLE IF NOT EXISTS system_role (
  system_role_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT
);

-- Designations (authority-specific)
CREATE TABLE IF NOT EXISTS designation (
  designation_id TEXT PRIMARY KEY,
  authority_id TEXT NOT NULL REFERENCES authority(authority_id),
  designation_name TEXT NOT NULL,
  UNIQUE(authority_id, designation_name)
);

-- Designation to System Role Mapping
CREATE TABLE IF NOT EXISTS designation_role_map (
  authority_id TEXT NOT NULL REFERENCES authority(authority_id),
  designation_id TEXT NOT NULL REFERENCES designation(designation_id),
  system_role_id TEXT NOT NULL REFERENCES system_role(system_role_id),
  PRIMARY KEY (authority_id, designation_id, system_role_id)
);

-- Users
CREATE TABLE IF NOT EXISTS "user" (
  user_id TEXT PRIMARY KEY,
  login TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  user_type TEXT NOT NULL, -- CITIZEN, OFFICER, ADMIN
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User Postings (officers can have multiple postings over time)
CREATE TABLE IF NOT EXISTS user_posting (
  posting_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(user_id),
  authority_id TEXT NOT NULL REFERENCES authority(authority_id),
  designation_id TEXT NOT NULL REFERENCES designation(designation_id),
  active_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_posting_active ON user_posting(user_id, active_to) WHERE active_to IS NULL;

-- Align tables that may have been created by 001_init.sql (idempotent)
DO $$
BEGIN
  -- authority: add columns from full schema
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'authority') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'authority' AND column_name = 'locale') THEN
      ALTER TABLE authority ADD COLUMN locale TEXT DEFAULT 'en-IN';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'authority' AND column_name = 'timezone') THEN
      ALTER TABLE authority ADD COLUMN timezone TEXT DEFAULT 'Asia/Kolkata';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'authority' AND column_name = 'created_at') THEN
      ALTER TABLE authority ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;
  END IF;
  -- service: add description
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'service') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'service' AND column_name = 'description') THEN
      ALTER TABLE service ADD COLUMN description TEXT;
    END IF;
  END IF;
  -- application: add columns from full schema (table may exist from 001)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'application') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'application' AND column_name = 'service_version') THEN
      ALTER TABLE application ADD COLUMN service_version TEXT NOT NULL DEFAULT '1.0';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'application' AND column_name = 'applicant_user_id') THEN
      ALTER TABLE application ADD COLUMN applicant_user_id TEXT REFERENCES "user"(user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'application' AND column_name = 'submission_snapshot_jsonb') THEN
      ALTER TABLE application ADD COLUMN submission_snapshot_jsonb JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'application' AND column_name = 'query_count') THEN
      ALTER TABLE application ADD COLUMN query_count INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'application' AND column_name = 'sla_due_at') THEN
      ALTER TABLE application ADD COLUMN sla_due_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'application' AND column_name = 'sla_paused_at') THEN
      ALTER TABLE application ADD COLUMN sla_paused_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'application' AND column_name = 'submission_channel') THEN
      ALTER TABLE application ADD COLUMN submission_channel TEXT DEFAULT 'SELF'; -- SELF, ASSISTED_SEWA_KENDRA, ASSISTED_OTHER
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'application' AND column_name = 'assisted_by_user_id') THEN
      ALTER TABLE application ADD COLUMN assisted_by_user_id TEXT REFERENCES "user"(user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'application' AND column_name = 'row_version') THEN
      ALTER TABLE application ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'application' AND column_name = 'updated_at') THEN
      ALTER TABLE application ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;
  END IF;
  -- task: add columns from full schema
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'task') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'task' AND column_name = 'started_at') THEN
      ALTER TABLE task ADD COLUMN started_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'task' AND column_name = 'remarks_internal') THEN
      ALTER TABLE task ADD COLUMN remarks_internal TEXT;
    END IF;
  END IF;
  -- document: add columns from full schema
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'document') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'document' AND column_name = 'uploaded_by_user_id') THEN
      ALTER TABLE document ADD COLUMN uploaded_by_user_id TEXT REFERENCES "user"(user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'document' AND column_name = 'verification_status') THEN
      ALTER TABLE document ADD COLUMN verification_status TEXT DEFAULT 'PENDING';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'document' AND column_name = 'verified_by_user_id') THEN
      ALTER TABLE document ADD COLUMN verified_by_user_id TEXT REFERENCES "user"(user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'document' AND column_name = 'verified_at') THEN
      ALTER TABLE document ADD COLUMN verified_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'document' AND column_name = 'verification_remarks') THEN
      ALTER TABLE document ADD COLUMN verification_remarks TEXT;
    END IF;
  END IF;
  -- query: add columns from full schema
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'query') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'query' AND column_name = 'raised_by_task_id') THEN
      ALTER TABLE query ADD COLUMN raised_by_task_id TEXT REFERENCES task(task_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'query' AND column_name = 'unlocked_field_keys') THEN
      ALTER TABLE query ADD COLUMN unlocked_field_keys TEXT[];
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'query' AND column_name = 'unlocked_doc_type_ids') THEN
      ALTER TABLE query ADD COLUMN unlocked_doc_type_ids TEXT[];
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'query' AND column_name = 'response_due_at') THEN
      ALTER TABLE query ADD COLUMN response_due_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'query' AND column_name = 'response_remarks') THEN
      ALTER TABLE query ADD COLUMN response_remarks TEXT;
    END IF;
  END IF;
  -- output: add columns from full schema
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'output') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'output' AND column_name = 'signed_by_user_id') THEN
      ALTER TABLE output ADD COLUMN signed_by_user_id TEXT REFERENCES "user"(user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'output' AND column_name = 'signature_type') THEN
      ALTER TABLE output ADD COLUMN signature_type TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'output' AND column_name = 'signature_certificate') THEN
      ALTER TABLE output ADD COLUMN signature_certificate TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'output' AND column_name = 'qr_verification_code') THEN
      ALTER TABLE output ADD COLUMN qr_verification_code TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'output' AND column_name = 'signed_at') THEN
      ALTER TABLE output ADD COLUMN signed_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'output' AND column_name = 'download_count') THEN
      ALTER TABLE output ADD COLUMN download_count INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'output' AND column_name = 'last_downloaded_at') THEN
      ALTER TABLE output ADD COLUMN last_downloaded_at TIMESTAMPTZ;
    END IF;
  END IF;
  -- audit_event: add columns from full schema
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_event') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit_event' AND column_name = 'ip_address') THEN
      ALTER TABLE audit_event ADD COLUMN ip_address TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit_event' AND column_name = 'user_agent') THEN
      ALTER TABLE audit_event ADD COLUMN user_agent TEXT;
    END IF;
  END IF;
END $$;

-- Services
CREATE TABLE IF NOT EXISTS service (
  service_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT
);

-- Service Versions (configurations)
CREATE TABLE IF NOT EXISTS service_version (
  service_key TEXT NOT NULL REFERENCES service(service_key),
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, published, retired
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  config_jsonb JSONB NOT NULL,
  checksum TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (service_key, version)
);

-- Applications
CREATE TABLE IF NOT EXISTS application (
  arn TEXT PRIMARY KEY,
  service_key TEXT NOT NULL REFERENCES service(service_key),
  service_version TEXT NOT NULL,
  authority_id TEXT NOT NULL REFERENCES authority(authority_id),
  applicant_user_id TEXT REFERENCES "user"(user_id),
  state_id TEXT NOT NULL,
  data_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  submission_snapshot_jsonb JSONB,
  query_count INTEGER NOT NULL DEFAULT 0,
  sla_due_at TIMESTAMPTZ,
  sla_paused_at TIMESTAMPTZ,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  disposed_at TIMESTAMPTZ,
  disposal_type TEXT -- APPROVED, REJECTED
);

DROP INDEX IF EXISTS idx_application_authority_state;
CREATE INDEX IF NOT EXISTS idx_application_authority_state ON application(authority_id, state_id) WHERE disposed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_application_applicant ON application(applicant_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_sla_due ON application(sla_due_at) WHERE disposed_at IS NULL AND sla_paused_at IS NULL;

-- Tasks
CREATE TABLE IF NOT EXISTS task (
  task_id TEXT PRIMARY KEY,
  arn TEXT NOT NULL REFERENCES application(arn),
  state_id TEXT NOT NULL,
  system_role_id TEXT NOT NULL REFERENCES system_role(system_role_id),
  assignee_user_id TEXT REFERENCES "user"(user_id),
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, IN_PROGRESS, COMPLETED, CANCELLED
  sla_due_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  decision TEXT, -- FORWARD, QUERY, APPROVE, REJECT
  remarks TEXT,
  remarks_internal TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_assignee_status ON task(assignee_user_id, status) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_task_role_authority ON task(system_role_id, status) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_task_sla_due ON task(sla_due_at) WHERE status = 'PENDING';

-- Queries
CREATE TABLE IF NOT EXISTS query (
  query_id TEXT PRIMARY KEY,
  arn TEXT NOT NULL REFERENCES application(arn),
  raised_by_task_id TEXT REFERENCES task(task_id),
  query_number INTEGER NOT NULL,
  message TEXT NOT NULL,
  unlocked_field_keys TEXT[],
  unlocked_doc_type_ids TEXT[],
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, RESPONDED, EXPIRED
  raised_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  response_due_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  response_remarks TEXT
);

CREATE INDEX IF NOT EXISTS idx_query_arn ON query(arn, query_number DESC);

-- Documents
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
  uploaded_by_user_id TEXT REFERENCES "user"(user_id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  verification_status TEXT DEFAULT 'PENDING', -- PENDING, VERIFIED, REJECTED
  verified_by_user_id TEXT REFERENCES "user"(user_id),
  verified_at TIMESTAMPTZ,
  verification_remarks TEXT
);

CREATE INDEX IF NOT EXISTS idx_document_arn_type ON document(arn, doc_type_id, version DESC);

-- Payments
CREATE TABLE IF NOT EXISTS payment (
  payment_id TEXT PRIMARY KEY,
  arn TEXT NOT NULL REFERENCES application(arn),
  payment_type TEXT NOT NULL, -- GATEWAY, DD, BG, CHALLAN
  status TEXT NOT NULL DEFAULT 'INITIATED', -- INITIATED, SUCCESS, FAILED, VERIFIED
  amount NUMERIC(12, 2),
  currency TEXT DEFAULT 'INR',
  fee_breakdown_jsonb JSONB,
  gateway_order_id TEXT,
  gateway_payment_id TEXT,
  gateway_signature TEXT,
  instrument_number TEXT,
  instrument_bank TEXT,
  instrument_date DATE,
  instrument_validity DATE,
  verified_by_user_id TEXT REFERENCES "user"(user_id),
  verified_at TIMESTAMPTZ,
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Outputs
CREATE TABLE IF NOT EXISTS output (
  output_id TEXT PRIMARY KEY,
  arn TEXT NOT NULL REFERENCES application(arn),
  output_type TEXT NOT NULL, -- CERTIFICATE, LETTER, ORDER
  template_id TEXT NOT NULL,
  output_number TEXT NOT NULL UNIQUE,
  storage_key TEXT,
  checksum TEXT,
  signed_by_user_id TEXT REFERENCES "user"(user_id),
  signature_type TEXT, -- DIGITAL, ESIGN
  signature_certificate TEXT,
  qr_verification_code TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signed_at TIMESTAMPTZ,
  download_count INTEGER NOT NULL DEFAULT 0,
  last_downloaded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_output_arn ON output(arn);

-- Audit Events
CREATE TABLE IF NOT EXISTS audit_event (
  event_id TEXT PRIMARY KEY,
  arn TEXT REFERENCES application(arn),
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL, -- CITIZEN, OFFICER, SYSTEM
  actor_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  payload_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_audit_arn_created;
CREATE INDEX IF NOT EXISTS idx_audit_arn_created ON audit_event(arn, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor_created ON audit_event(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_type_created ON audit_event(event_type, created_at DESC);

-- Notifications
CREATE TABLE IF NOT EXISTS notification (
  notification_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(user_id),
  arn TEXT REFERENCES application(arn),
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_user_created ON notification(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_user_read ON notification(user_id, read, created_at DESC);

-- Insert initial data
INSERT INTO authority (authority_id, name) VALUES
  ('PUDA', 'Punjab Urban Development Authority'),
  ('GMADA', 'Greater Mohali Area Development Authority'),
  ('GLADA', 'Greater Ludhiana Area Development Authority'),
  ('BDA', 'Bathinda Development Authority')
ON CONFLICT (authority_id) DO NOTHING;

INSERT INTO system_role (system_role_id, display_name, description) VALUES
  ('CLERK', 'Clerk', 'Initial scrutiny and data entry'),
  ('DEALING_ASSISTANT', 'Dealing Assistant', 'Assistant level processing'),
  ('SENIOR_ASSISTANT', 'Senior Assistant', 'Senior level review'),
  ('JUNIOR_ENGINEER', 'Junior Engineer', 'Technical review'),
  ('DRAFTSMAN', 'Draftsman', 'Drawing and plan review'),
  ('SDO', 'Sub-Divisional Officer', 'SDO level approval'),
  ('ESTATE_OFFICER', 'Estate Officer', 'Estate officer approval'),
  ('ACCOUNT_OFFICER', 'Account Officer', 'Accounts and dues verification'),
  ('SUPERINTENDENT', 'Superintendent', 'Superintendent level approval'),
  ('TOWN_PLANNER', 'Town Planner', 'Planning department review'),
  ('INSPECTOR', 'Field Inspector', 'Physical verification')
ON CONFLICT (system_role_id) DO NOTHING;

INSERT INTO service (service_key, name, category) VALUES
  ('no_due_certificate', 'Issue of No Due Certificate', 'PROPERTY_SERVICES'),
  ('registration_of_architect', 'Registration of Architect', 'REGISTRATION_SERVICES'),
  ('sanction_of_water_supply', 'Sanction of Water Supply', 'UTILITY_SERVICES'),
  ('sanction_of_sewerage_connection', 'Sanction of Sewerage Connection', 'UTILITY_SERVICES')
ON CONFLICT (service_key) DO NOTHING;
