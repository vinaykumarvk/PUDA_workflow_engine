-- 023_data_integrity_constraints.sql
-- Additional data integrity constraints, missing indexes, and FK enforcement.

-- =====================================================================
-- 1. MISSING INDEXES on hot query paths
-- =====================================================================

-- SLA calculation: holiday lookup per authority
CREATE INDEX IF NOT EXISTS idx_authority_holiday_lookup
  ON authority_holiday(authority_id, holiday_date);

-- Fee line item lookup by application
CREATE INDEX IF NOT EXISTS idx_fee_line_item_arn
  ON fee_line_item(arn);

-- Fee demand lookup by application + status (for pending demands query)
CREATE INDEX IF NOT EXISTS idx_fee_demand_arn_status
  ON fee_demand(arn, status);

-- Feature flag lookup by key
CREATE INDEX IF NOT EXISTS idx_feature_flag_key
  ON feature_flag(flag_key);

-- Refund request lookup by application
CREATE INDEX IF NOT EXISTS idx_refund_request_arn
  ON refund_request(arn);

-- Notification lookup by user (for dashboard)
CREATE INDEX IF NOT EXISTS idx_notification_user_created
  ON notification(user_id, created_at DESC);

-- Query lookup for pending actions (citizen dashboard)
CREATE INDEX IF NOT EXISTS idx_query_status_pending
  ON query(status)
  WHERE status = 'PENDING';

-- =====================================================================
-- 2. FOREIGN KEY: payment.demand_id -> fee_demand
-- =====================================================================

-- Use NOT VALID to avoid locking existing rows during ALTER; validate later.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_payment_demand'
      AND table_name = 'payment'
  ) THEN
    ALTER TABLE payment
      ADD CONSTRAINT fk_payment_demand
      FOREIGN KEY (demand_id)
      REFERENCES fee_demand(demand_id)
      NOT VALID;
  END IF;
END
$$;

-- Validate the FK constraint in a separate step (allows concurrent reads).
ALTER TABLE payment VALIDATE CONSTRAINT fk_payment_demand;

-- =====================================================================
-- 3. CHECK CONSTRAINTS on status/enum columns
-- =====================================================================

-- Application state_id: restrict to known workflow states
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_application_state'
      AND table_name = 'application'
  ) THEN
    ALTER TABLE application
      ADD CONSTRAINT chk_application_state
      CHECK (state_id IN (
        'DRAFT', 'SUBMITTED',
        'PENDING_AT_CLERK', 'PENDING_AT_SR_ASSISTANT', 'PENDING_AT_SR_ASSISTANT_ACCOUNTS',
        'PENDING_AT_ACCOUNT_OFFICER', 'PENDING_AT_JUNIOR_ENGINEER',
        'PENDING_AT_SDO', 'PENDING_AT_DRAFTSMAN',
        'QUERY_PENDING', 'RESUBMITTED',
        'APPROVED', 'REJECTED', 'CLOSED'
      )) NOT VALID;
  END IF;
END
$$;

-- Task status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_task_status'
      AND table_name = 'task'
  ) THEN
    ALTER TABLE task
      ADD CONSTRAINT chk_task_status
      CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'))
      NOT VALID;
  END IF;
END
$$;

-- Fee demand status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_fee_demand_status'
      AND table_name = 'fee_demand'
  ) THEN
    ALTER TABLE fee_demand
      ADD CONSTRAINT chk_fee_demand_status
      CHECK (status IN ('PENDING', 'PARTIALLY_PAID', 'PAID', 'WAIVED', 'CANCELLED'))
      NOT VALID;
  END IF;
END
$$;

-- Payment status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_payment_status'
      AND table_name = 'payment'
  ) THEN
    ALTER TABLE payment
      ADD CONSTRAINT chk_payment_status
      CHECK (status IN ('INITIATED', 'SUCCESS', 'FAILED', 'VERIFIED', 'REFUNDED'))
      NOT VALID;
  END IF;
END
$$;

-- Fee demand total_amount must be non-negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_fee_demand_total_nonneg'
      AND table_name = 'fee_demand'
  ) THEN
    ALTER TABLE fee_demand
      ADD CONSTRAINT chk_fee_demand_total_nonneg
      CHECK (total_amount >= 0)
      NOT VALID;
  END IF;
END
$$;

-- Fee demand paid_amount must be non-negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_fee_demand_paid_nonneg'
      AND table_name = 'fee_demand'
  ) THEN
    ALTER TABLE fee_demand
      ADD CONSTRAINT chk_fee_demand_paid_nonneg
      CHECK (paid_amount >= 0)
      NOT VALID;
  END IF;
END
$$;

-- User type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_user_type'
      AND table_name = 'user'
  ) THEN
    ALTER TABLE "user"
      ADD CONSTRAINT chk_user_type
      CHECK (user_type IN ('CITIZEN', 'OFFICER', 'ADMIN'))
      NOT VALID;
  END IF;
END
$$;

-- =====================================================================
-- 4. UNIQUE constraint to prevent duplicate SLA breach audit events
-- =====================================================================

-- Partial unique index: only one SLA_BREACHED event per task per application
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_sla_breach_unique
  ON audit_event(arn, (payload_jsonb->>'taskId'))
  WHERE event_type = 'SLA_BREACHED';

-- =====================================================================
-- 5. Validate all NOT VALID constraints (safe to run, acquires SHARE UPDATE EXCLUSIVE)
-- =====================================================================

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname, conrelid::regclass AS tablename
    FROM pg_constraint
    WHERE convalidated = false
      AND contype = 'c'
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', c.tablename, c.conname);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not validate constraint % on %: %', c.conname, c.tablename, SQLERRM;
    END;
  END LOOP;
END
$$;
