-- 008_fees_decisions.sql
-- Step 4: Promote fees/payments and decisions/outputs from JSONB to
-- first-class relational tables.
--
-- A. FEES & PAYMENTS
--    - fee_line_item    : individual fee head assessments
--    - fee_demand       : groups line items into a payable demand note
--    - ALTER payment    : add demand_id, receipt_number, receipt_date, mode
--    - refund_request   : tracks refund lifecycle
--
-- B. DECISIONS & OUTPUTS
--    - decision         : full decision record (type, reasons, conditions)
--    - ALTER output     : add artifact_type, valid_from, valid_to, decision_id

-- =========================================================================
-- A1. Fee Line Items — individual fee assessments for an application
-- =========================================================================
CREATE TABLE IF NOT EXISTS fee_line_item (
  line_item_id        TEXT PRIMARY KEY,                             -- UUID
  arn                 TEXT NOT NULL REFERENCES application(arn) ON DELETE CASCADE,
  fee_head_code       TEXT NOT NULL,                                -- e.g., APPLICATION_FEE, PROCESSING_FEE, CONNECTION_CHARGE
  description         TEXT,
  base_amount         NUMERIC(14,2),                                -- pre-calculation base
  calculation_inputs  JSONB NOT NULL DEFAULT '{}'::jsonb,           -- inputs used for calculation
  amount              NUMERIC(14,2) NOT NULL,                       -- final assessed amount
  currency            TEXT NOT NULL DEFAULT 'INR',
  waiver_adjustment   NUMERIC(14,2) NOT NULL DEFAULT 0,            -- discount / waiver
  created_by          TEXT,                                         -- officer who assessed
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_line_item_arn ON fee_line_item(arn);

-- =========================================================================
-- A2. Fee Demand — groups fee line items into a single payable demand
-- =========================================================================
CREATE TABLE IF NOT EXISTS fee_demand (
  demand_id           TEXT PRIMARY KEY,                             -- UUID
  arn                 TEXT NOT NULL REFERENCES application(arn) ON DELETE CASCADE,
  demand_number       TEXT,                                        -- formatted demand note number
  total_amount        NUMERIC(14,2) NOT NULL,
  paid_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'PENDING',             -- PENDING, PARTIALLY_PAID, PAID, WAIVED, CANCELLED
  due_date            DATE,
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fee_demand_arn ON fee_demand(arn);
CREATE INDEX IF NOT EXISTS idx_fee_demand_status ON fee_demand(status) WHERE status IN ('PENDING', 'PARTIALLY_PAID');

-- Link table: demand → line items
CREATE TABLE IF NOT EXISTS fee_demand_line (
  demand_id           TEXT NOT NULL REFERENCES fee_demand(demand_id) ON DELETE CASCADE,
  line_item_id        TEXT NOT NULL REFERENCES fee_line_item(line_item_id) ON DELETE CASCADE,
  PRIMARY KEY (demand_id, line_item_id)
);

-- =========================================================================
-- A3. Enhance existing payment table
-- =========================================================================
-- Add FK to demand, payment mode, receipt details
ALTER TABLE payment ADD COLUMN IF NOT EXISTS demand_id TEXT REFERENCES fee_demand(demand_id);
ALTER TABLE payment ADD COLUMN IF NOT EXISTS mode TEXT;           -- GATEWAY, CHALLAN, NEFT, COUNTER
ALTER TABLE payment ADD COLUMN IF NOT EXISTS receipt_number TEXT;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS receipt_date DATE;

CREATE INDEX IF NOT EXISTS idx_payment_demand ON payment(demand_id) WHERE demand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_arn_status ON payment(arn, status);

-- =========================================================================
-- A4. Refund Request
-- =========================================================================
CREATE TABLE IF NOT EXISTS refund_request (
  refund_id           TEXT PRIMARY KEY,                             -- UUID
  payment_id          TEXT NOT NULL REFERENCES payment(payment_id),
  arn                 TEXT NOT NULL REFERENCES application(arn) ON DELETE CASCADE,
  reason              TEXT NOT NULL,
  amount              NUMERIC(14,2) NOT NULL,
  status              TEXT NOT NULL DEFAULT 'REQUESTED',           -- REQUESTED, APPROVED, REJECTED, PROCESSED
  bank_details_jsonb  JSONB NOT NULL DEFAULT '{}'::jsonb,          -- accountName, accountNumber, ifsc, bankName
  requested_by        TEXT,
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_by        TEXT,
  processed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_refund_request_arn ON refund_request(arn);
CREATE INDEX IF NOT EXISTS idx_refund_request_payment ON refund_request(payment_id);
CREATE INDEX IF NOT EXISTS idx_refund_request_status ON refund_request(status) WHERE status IN ('REQUESTED', 'APPROVED');

-- =========================================================================
-- B1. Decision table — full decision record
-- =========================================================================
CREATE TABLE IF NOT EXISTS decision (
  decision_id         TEXT PRIMARY KEY,                             -- UUID
  arn                 TEXT NOT NULL REFERENCES application(arn) ON DELETE CASCADE,
  decision_type       TEXT NOT NULL,                                -- APPROVE, REJECT, RETURN, PARTIAL_APPROVE
  decided_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_by_user_id  TEXT REFERENCES "user"(user_id),
  decided_by_role     TEXT,                                        -- system role at time of decision
  reason_codes        TEXT[] NOT NULL DEFAULT '{}',                 -- structured reason codes
  remarks             TEXT,
  conditions          TEXT[] NOT NULL DEFAULT '{}',                 -- approval conditions
  task_id             TEXT REFERENCES task(task_id),                -- the task where decision was made
  metadata_jsonb      JSONB NOT NULL DEFAULT '{}'::jsonb,          -- any extra context
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_arn ON decision(arn);
CREATE UNIQUE INDEX IF NOT EXISTS idx_decision_arn_type ON decision(arn, decision_type);

-- =========================================================================
-- B2. Enhance existing output table
-- =========================================================================
ALTER TABLE output ADD COLUMN IF NOT EXISTS artifact_type TEXT;    -- CERTIFICATE, NOC, LETTER, ORDER, PERMISSION, LICENSE, OTHER
ALTER TABLE output ADD COLUMN IF NOT EXISTS decision_id TEXT REFERENCES decision(decision_id);
ALTER TABLE output ADD COLUMN IF NOT EXISTS valid_from DATE;
ALTER TABLE output ADD COLUMN IF NOT EXISTS valid_to DATE;

-- Backfill artifact_type from existing output_type
UPDATE output SET artifact_type = output_type WHERE artifact_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_output_decision ON output(decision_id) WHERE decision_id IS NOT NULL;
