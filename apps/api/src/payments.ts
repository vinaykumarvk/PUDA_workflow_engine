/**
 * Payments DAL — record and manage payments against fee demands.
 *
 * Supports multiple payment modes: GATEWAY, CHALLAN, NEFT, COUNTER.
 * Links to fee_demand for proper accounting.
 *
 * Gateway integration (Razorpay/PayU) is still UAT-2 scope;
 * this module provides the relational infrastructure for all modes.
 */
import { query, getClient } from "./db";
import { v4 as uuidv4 } from "uuid";
import { updateDemandPayment } from "./fees";
import type { PoolClient } from "pg";
import { logInfo } from "./logger";
import { resolvePaymentGatewayAdapter } from "./providers/payment-gateway";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PaymentMode = "GATEWAY" | "UPI" | "CARD" | "NETBANKING" | "CHALLAN" | "NEFT" | "COUNTER";
export type PaymentStatus = "INITIATED" | "SUCCESS" | "FAILED" | "VERIFIED" | "REFUNDED";
export type ReconciliationStatus = "PENDING" | "RECONCILED" | "MISMATCH" | "MANUAL_REVIEW";

export interface PaymentRecord {
  payment_id: string;
  arn: string;
  demand_id: string | null;
  payment_type: string;
  mode: PaymentMode | null;
  status: PaymentStatus;
  amount: number;
  currency: string;
  fee_breakdown_jsonb: Record<string, unknown> | null;
  receipt_number: string | null;
  receipt_date: Date | null;
  gateway_order_id: string | null;
  gateway_payment_id: string | null;
  instrument_number: string | null;
  instrument_bank: string | null;
  instrument_date: Date | null;
  verified_by_user_id: string | null;
  verified_at: Date | null;
  initiated_at: Date;
  completed_at: Date | null;
  // Tier-2 additions
  provider_transaction_id: string | null;
  provider_name: string | null;
  failure_reason: string | null;
  reconciled_at: Date | null;
  reconciliation_status: ReconciliationStatus | null;
}

export interface RecordPaymentInput {
  arn: string;
  demandId?: string;
  mode: PaymentMode;
  amount: number;
  currency?: string;
  receiptNumber?: string;
  receiptDate?: Date | string;
  // For gateway / online payments
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  gatewaySignature?: string;
  /** Transaction ID returned by the payment provider (Razorpay, PayU, etc.). */
  providerTransactionId?: string;
  /** Payment provider / gateway name. */
  providerName?: string;
  // For instrument payments (DD, BG, Challan)
  instrumentNumber?: string;
  instrumentBank?: string;
  instrumentDate?: Date | string;
}

export interface GatewayCallbackInput {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  gatewaySignature: string;
  status: "SUCCESS" | "FAILED";
  failureReason?: string;
  providerName?: string;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** Online payment modes that require async verification / callback. */
const ASYNC_MODES: Set<PaymentMode> = new Set(["GATEWAY", "UPI", "CARD", "NETBANKING"]);
const MONEY_EPSILON = 0.000001;

function assertValidPaymentAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("PAYMENT_AMOUNT_INVALID");
  }
}

/**
 * Record a new payment. For COUNTER/CHALLAN/NEFT payments, immediately
 * marks as SUCCESS. For online modes (GATEWAY/UPI/CARD/NETBANKING), marks
 * as INITIATED until verified via callback.
 */
export async function recordPayment(input: RecordPaymentInput): Promise<PaymentRecord> {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    assertValidPaymentAmount(input.amount);

    if (input.demandId) {
      const demandResult = await client.query(
        `SELECT demand_id, arn, total_amount, paid_amount, status
         FROM fee_demand
         WHERE demand_id = $1
         FOR UPDATE`,
        [input.demandId]
      );
      if (demandResult.rows.length === 0) {
        throw new Error("DEMAND_NOT_FOUND");
      }
      const demand = demandResult.rows[0] as {
        arn: string;
        total_amount: string | number;
        paid_amount: string | number;
        status: string;
      };
      if (demand.arn !== input.arn) {
        throw new Error("DEMAND_ARN_MISMATCH");
      }
      if (demand.status !== "PENDING" && demand.status !== "PARTIALLY_PAID") {
        throw new Error("DEMAND_NOT_PAYABLE");
      }
      const remainingBalance = Number(demand.total_amount) - Number(demand.paid_amount);
      if (remainingBalance <= MONEY_EPSILON) {
        throw new Error("DEMAND_ALREADY_PAID");
      }
      if (input.amount > remainingBalance + MONEY_EPSILON) {
        throw new Error("PAYMENT_AMOUNT_EXCEEDS_REMAINING_BALANCE");
      }
    }

    const paymentId = uuidv4();
    const isImmediate = !ASYNC_MODES.has(input.mode);
    const status: PaymentStatus = isImmediate ? "SUCCESS" : "INITIATED";
    const gatewayAdapter = resolvePaymentGatewayAdapter();
    let gatewayOrderId = input.gatewayOrderId || null;
    let providerTransactionId = input.providerTransactionId || null;
    let providerName = input.providerName || null;

    if (!isImmediate) {
      if (!gatewayOrderId) {
        const createdOrder = await gatewayAdapter.createOrder({
          paymentId,
          arn: input.arn,
          demandId: input.demandId,
          amount: input.amount,
          currency: input.currency || "INR",
        });
        gatewayOrderId = createdOrder.gatewayOrderId;
        providerTransactionId = providerTransactionId || createdOrder.providerTransactionId || null;
        providerName = providerName || createdOrder.providerName || gatewayAdapter.name;
      } else if (!providerName) {
        providerName = gatewayAdapter.name;
      }
    }

    await client.query(
      `INSERT INTO payment
         (payment_id, arn, demand_id, payment_type, mode, status, amount, currency,
          receipt_number, receipt_date, gateway_order_id, gateway_payment_id, gateway_signature,
          instrument_number, instrument_bank, instrument_date,
          provider_transaction_id, provider_name,
          initiated_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(),
               CASE WHEN $6 = 'SUCCESS' THEN NOW() ELSE NULL END)`,
      [
        paymentId,
        input.arn,
        input.demandId || null,
        input.mode, // payment_type = mode for new payments
        input.mode,
        status,
        input.amount,
        input.currency || "INR",
        input.receiptNumber || null,
        input.receiptDate ? new Date(input.receiptDate) : null,
        gatewayOrderId,
        input.gatewayPaymentId || null,
        input.gatewaySignature || null,
        input.instrumentNumber || null,
        input.instrumentBank || null,
        input.instrumentDate ? new Date(input.instrumentDate) : null,
        providerTransactionId,
        providerName,
      ]
    );

    // If payment succeeded immediately and has a demand, update the demand
    if (isImmediate && input.demandId) {
      await updateDemandPayment(input.demandId, input.amount, client);
    }

    await client.query("COMMIT");
    return (await getPaymentById(paymentId))!;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Verify a gateway payment callback. Updates payment status and demand.
 */
export async function verifyGatewayPayment(
  paymentId: string,
  gatewayPaymentId: string,
  gatewaySignature: string,
  verifiedByUserId?: string
): Promise<PaymentRecord | null> {
  if (!gatewayPaymentId || !gatewaySignature) {
    throw new Error("PAYMENT_CALLBACK_FIELDS_REQUIRED");
  }

  const client = await getClient();
  try {
    await client.query("BEGIN");

    const paymentResult = await client.query(
      "SELECT * FROM payment WHERE payment_id = $1 FOR UPDATE",
      [paymentId]
    );
    if (paymentResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const payment = paymentResult.rows[0];
    if (payment.status === "VERIFIED") {
      await client.query("ROLLBACK");
      // Idempotent verify call: if same gateway payment ref, return already-verified payment.
      if (payment.gateway_payment_id && payment.gateway_payment_id === gatewayPaymentId) {
        return rowToPayment(payment);
      }
      throw new Error("PAYMENT_ALREADY_VERIFIED");
    }
    if (payment.status !== "INITIATED") {
      await client.query("ROLLBACK");
      return null;
    }

    const duplicateGatewayRef = await client.query(
      `SELECT payment_id
       FROM payment
       WHERE gateway_payment_id = $1
         AND payment_id <> $2
         AND status IN ('VERIFIED', 'SUCCESS')
       LIMIT 1`,
      [gatewayPaymentId, paymentId]
    );
    if (duplicateGatewayRef.rows.length > 0) {
      throw new Error("PAYMENT_REPLAY_DETECTED");
    }

    if (!payment.gateway_order_id) {
      throw new Error("PAYMENT_ORDER_ID_MISSING");
    }

    const gatewayAdapter = resolvePaymentGatewayAdapter();
    const verification = await gatewayAdapter.verifyCallbackSignature({
      gatewayOrderId: String(payment.gateway_order_id),
      gatewayPaymentId,
      gatewaySignature,
    });
    if (!verification.verified) {
      throw new Error(verification.errorCode || "INVALID_GATEWAY_SIGNATURE");
    }

    const normalizedSignature = verification.normalizedSignature || gatewaySignature;
    await client.query(
      `UPDATE payment SET
         status = 'VERIFIED',
         gateway_payment_id = COALESCE($2, gateway_payment_id),
         gateway_signature = COALESCE($3, gateway_signature),
         verified_by_user_id = $4,
         verified_at = NOW(),
         completed_at = NOW()
       WHERE payment_id = $1`,
      [paymentId, gatewayPaymentId, normalizedSignature, verifiedByUserId || null]
    );

    // Update demand if linked
    if (payment.demand_id) {
      await updateDemandPayment(payment.demand_id, Number(payment.amount), client);
    }

    await client.query("COMMIT");
    return getPaymentById(paymentId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Mark an online payment as failed, optionally recording the reason. */
export async function failPayment(paymentId: string, failureReason?: string): Promise<PaymentRecord | null> {
  await query(
    "UPDATE payment SET status = 'FAILED', failure_reason = COALESCE($2, failure_reason), completed_at = NOW() WHERE payment_id = $1 AND status = 'INITIATED'",
    [paymentId, failureReason || null]
  );
  return getPaymentById(paymentId);
}

/**
 * Process a gateway callback by gateway order id. This is used by public webhook/callback routes
 * where payment_id is not known upfront.
 */
export async function processGatewayCallback(input: GatewayCallbackInput): Promise<PaymentRecord | null> {
  if (!input.gatewayOrderId || !input.gatewayPaymentId || !input.gatewaySignature) {
    throw new Error("PAYMENT_CALLBACK_FIELDS_REQUIRED");
  }
  const status = String(input.status || "").toUpperCase();
  if (status !== "SUCCESS" && status !== "FAILED") {
    throw new Error("INVALID_PAYMENT_STATUS");
  }

  const payment = await getPaymentByGatewayOrderId(input.gatewayOrderId);
  if (!payment) {
    return null;
  }

  const gatewayAdapter = resolvePaymentGatewayAdapter();
  const verification = await gatewayAdapter.verifyCallbackSignature({
    gatewayOrderId: input.gatewayOrderId,
    gatewayPaymentId: input.gatewayPaymentId,
    gatewaySignature: input.gatewaySignature,
  });
  if (!verification.verified) {
    throw new Error(verification.errorCode || "INVALID_GATEWAY_SIGNATURE");
  }

  const normalizedSignature = verification.normalizedSignature || input.gatewaySignature;
  if (status === "SUCCESS") {
    const verified = await verifyGatewayPayment(
      payment.payment_id,
      input.gatewayPaymentId,
      normalizedSignature
    );
    if (!verified) return null;
    if (input.providerName) {
      await query(
        "UPDATE payment SET provider_name = COALESCE($2, provider_name) WHERE payment_id = $1",
        [verified.payment_id, input.providerName]
      );
    }
    return getPaymentById(verified.payment_id);
  }

  await query(
    `UPDATE payment
     SET status = CASE WHEN status = 'INITIATED' THEN 'FAILED' ELSE status END,
         gateway_payment_id = COALESCE($2, gateway_payment_id),
         gateway_signature = COALESCE($3, gateway_signature),
         failure_reason = COALESCE($4, failure_reason),
         provider_name = COALESCE($5, provider_name),
         completed_at = CASE WHEN status = 'INITIATED' THEN NOW() ELSE completed_at END
     WHERE payment_id = $1`,
    [
      payment.payment_id,
      input.gatewayPaymentId,
      normalizedSignature,
      input.failureReason || "GATEWAY_CALLBACK_FAILED",
      input.providerName || null,
    ]
  );
  return getPaymentById(payment.payment_id);
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export async function getPaymentById(paymentId: string): Promise<PaymentRecord | null> {
  const result = await query("SELECT * FROM payment WHERE payment_id = $1", [paymentId]);
  return result.rows.length > 0 ? rowToPayment(result.rows[0]) : null;
}

export async function getPaymentByGatewayOrderId(
  gatewayOrderId: string
): Promise<PaymentRecord | null> {
  const result = await query(
    "SELECT * FROM payment WHERE gateway_order_id = $1 ORDER BY initiated_at DESC LIMIT 1",
    [gatewayOrderId]
  );
  return result.rows.length > 0 ? rowToPayment(result.rows[0]) : null;
}

export async function getPaymentsForApplication(arn: string): Promise<PaymentRecord[]> {
  const result = await query(
    "SELECT * FROM payment WHERE arn = $1 ORDER BY initiated_at DESC",
    [arn]
  );
  return result.rows.map(rowToPayment);
}

export async function getPaymentsForDemand(demandId: string): Promise<PaymentRecord[]> {
  const result = await query(
    "SELECT * FROM payment WHERE demand_id = $1 ORDER BY initiated_at DESC",
    [demandId]
  );
  return result.rows.map(rowToPayment);
}

// ---------------------------------------------------------------------------
// Fee calculation stub (UAT-2)
// ---------------------------------------------------------------------------

export interface FeeSchedule {
  service_key: string;
  authority_id: string;
  fee_type: string;
  amount: number;
  description: string;
}

/**
 * Calculate fees for a given service + authority from published service config.
 * Fails closed when fee schedules are missing or invalid.
 */
export async function calculateFees(serviceKey: string, authorityId: string): Promise<FeeSchedule[]> {
  const configResult = await query(
    `SELECT config_jsonb
     FROM service_version
     WHERE service_key = $1 AND status = 'published'
     ORDER BY effective_from DESC
     LIMIT 1`,
    [serviceKey]
  );
  if (configResult.rows.length === 0) {
    throw new Error("SERVICE_VERSION_NOT_FOUND");
  }

  const rawSchedule = configResult.rows[0].config_jsonb?.feeSchedule;
  if (!rawSchedule) {
    throw new Error("FEE_SCHEDULE_NOT_CONFIGURED");
  }

  type RawFeeLine = { feeType?: unknown; amount?: unknown; description?: unknown };
  type RawFeeSchedule = RawFeeLine[] | { default?: RawFeeLine[]; byAuthority?: Record<string, RawFeeLine[]> };

  const scheduleConfig = rawSchedule as RawFeeSchedule;
  let candidateLines: RawFeeLine[] | undefined;
  if (Array.isArray(scheduleConfig)) {
    candidateLines = scheduleConfig;
  } else if (scheduleConfig && typeof scheduleConfig === "object") {
    candidateLines = scheduleConfig.byAuthority?.[authorityId] ?? scheduleConfig.default;
  }

  if (!Array.isArray(candidateLines) || candidateLines.length === 0) {
    throw new Error("FEE_SCHEDULE_NOT_CONFIGURED");
  }

  const normalized: FeeSchedule[] = [];
  for (const [index, line] of candidateLines.entries()) {
    const feeType = typeof line.feeType === "string" ? line.feeType.trim() : "";
    const amount = typeof line.amount === "number" ? line.amount : Number.NaN;
    const description =
      typeof line.description === "string" && line.description.trim().length > 0
        ? line.description.trim()
        : feeType;
    if (!feeType || !Number.isFinite(amount) || amount < 0) {
      throw new Error(`FEE_SCHEDULE_INVALID_LINE_${index}`);
    }
    normalized.push({
      service_key: serviceKey,
      authority_id: authorityId,
      fee_type: feeType,
      amount,
      description,
    });
  }

  logInfo("Fee schedule resolved", {
    serviceKey,
    authorityId,
    lineItemCount: normalized.length,
  });

  return normalized;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToPayment(row: any): PaymentRecord {
  return {
    payment_id: row.payment_id,
    arn: row.arn,
    demand_id: row.demand_id,
    payment_type: row.payment_type,
    mode: row.mode as PaymentMode | null,
    status: row.status as PaymentStatus,
    amount: Number(row.amount),
    currency: row.currency,
    fee_breakdown_jsonb: row.fee_breakdown_jsonb,
    receipt_number: row.receipt_number,
    receipt_date: row.receipt_date,
    gateway_order_id: row.gateway_order_id,
    gateway_payment_id: row.gateway_payment_id,
    instrument_number: row.instrument_number,
    instrument_bank: row.instrument_bank,
    instrument_date: row.instrument_date,
    verified_by_user_id: row.verified_by_user_id,
    verified_at: row.verified_at,
    initiated_at: row.initiated_at,
    completed_at: row.completed_at,
    provider_transaction_id: row.provider_transaction_id ?? null,
    provider_name: row.provider_name ?? null,
    failure_reason: row.failure_reason ?? null,
    reconciled_at: row.reconciled_at ?? null,
    reconciliation_status: row.reconciliation_status as ReconciliationStatus | null ?? null,
  };
}
