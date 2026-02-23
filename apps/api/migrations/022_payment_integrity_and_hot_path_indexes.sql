-- 022_payment_integrity_and_hot_path_indexes.sql
-- Payment integrity guardrails + missing hot-path indexes.

-- Reject zero/negative payment amounts for new rows.
ALTER TABLE payment
  ADD CONSTRAINT chk_payment_amount_positive
  CHECK (amount > 0) NOT VALID;

-- Gateway callback lookup by gateway_order_id.
CREATE INDEX IF NOT EXISTS idx_payment_gateway_order_id
  ON payment(gateway_order_id)
  WHERE gateway_order_id IS NOT NULL;

-- SLA breach scan and queue metrics rely on status + sla_due_at filters.
CREATE INDEX IF NOT EXISTS idx_task_status_sla_due_open
  ON task(status, sla_due_at)
  WHERE status IN ('PENDING', 'IN_PROGRESS')
    AND sla_due_at IS NOT NULL;

-- Speeds NOT EXISTS checks filtering by arn + event type.
CREATE INDEX IF NOT EXISTS idx_audit_arn_event_type
  ON audit_event(arn, event_type);
