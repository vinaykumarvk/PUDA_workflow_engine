-- 009_communications.sql
-- Step 5: Promote communications from JSONB to first-class relational tables.
--
-- A. notification_log  — multi-channel delivery tracking (SMS, EMAIL, IN_APP)
-- B. notice_letter     — formal notices / letters (QUERY, DEFICIENCY, APPROVAL, etc.)
-- C. Enhance query     — add raised_by_user_id, raised_by_role for attribution
--
-- The existing `notification` table remains as the in-app inbox.
-- The new `notification_log` table captures every delivery attempt across all channels.

-- =========================================================================
-- A. Notification Log — multi-channel delivery audit trail
-- =========================================================================
CREATE TABLE IF NOT EXISTS notification_log (
  log_id              TEXT PRIMARY KEY,                              -- UUID
  arn                 TEXT REFERENCES application(arn) ON DELETE SET NULL,
  user_id             TEXT REFERENCES "user"(user_id),               -- recipient
  notification_id     TEXT REFERENCES notification(notification_id), -- link to in-app notification (if IN_APP)

  -- Channel & template
  channel             TEXT NOT NULL,                                 -- SMS, EMAIL, IN_APP
  template_code       TEXT,                                          -- e.g., QUERY_RAISED, APPLICATION_APPROVED
  recipient_address   TEXT,                                          -- phone number or email address

  -- Content
  subject             TEXT,
  body                TEXT,

  -- Delivery status
  status              TEXT NOT NULL DEFAULT 'SENT',                  -- SENT, FAILED, DELIVERED, UNKNOWN
  provider_ref        TEXT,                                          -- external SMS/email provider reference ID
  failure_reason      TEXT,

  -- Timestamps
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_arn ON notification_log(arn) WHERE arn IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notification_log_user ON notification_log(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_channel ON notification_log(channel, status);

-- =========================================================================
-- B. Notice Letter — formal notices / letters dispatched to applicants
-- =========================================================================
CREATE TABLE IF NOT EXISTS notice_letter (
  notice_id           TEXT PRIMARY KEY,                              -- UUID
  arn                 TEXT NOT NULL REFERENCES application(arn) ON DELETE CASCADE,

  -- Type & classification
  notice_type         TEXT NOT NULL,                                 -- QUERY, DEFICIENCY, APPROVAL, REJECTION, DEMAND_LETTER, OTHER
  template_code       TEXT,                                          -- template identifier

  -- Content
  subject             TEXT,
  body_text           TEXT,                                          -- plain text / summary

  -- Generation & dispatch
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dispatch_mode       TEXT,                                          -- ELECTRONIC, PHYSICAL
  dispatch_address_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,         -- { line1, line2, city, district, state, pin }
  dispatched_at       TIMESTAMPTZ,

  -- Signed document (if generated as PDF/artifact)
  signed_artifact_key TEXT,                                          -- storage key for the generated letter
  qr_token            TEXT,                                          -- verification token

  -- Linkage
  query_id            TEXT REFERENCES query(query_id),               -- link to query (for QUERY type notices)
  decision_id         TEXT REFERENCES decision(decision_id),         -- link to decision (for APPROVAL/REJECTION)

  -- Who issued it
  issued_by_user_id   TEXT REFERENCES "user"(user_id),
  issued_by_role      TEXT,

  -- Metadata
  metadata_jsonb      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notice_letter_arn ON notice_letter(arn);
CREATE INDEX IF NOT EXISTS idx_notice_letter_type ON notice_letter(notice_type);
CREATE INDEX IF NOT EXISTS idx_notice_letter_query ON notice_letter(query_id) WHERE query_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notice_letter_decision ON notice_letter(decision_id) WHERE decision_id IS NOT NULL;

-- =========================================================================
-- C. Enhance query table — add attribution columns
-- =========================================================================
ALTER TABLE query ADD COLUMN IF NOT EXISTS raised_by_user_id TEXT REFERENCES "user"(user_id);
ALTER TABLE query ADD COLUMN IF NOT EXISTS raised_by_role TEXT;
