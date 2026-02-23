/**
 * Fees DAL — fee line items, demands, and refund requests.
 *
 * Lifecycle:
 *   1. assess() — create fee_line_items for an application
 *   2. createDemand() — group line items into a payable demand note
 *   3. recordPayment() — record payment against a demand (see payments.ts)
 *   4. requestRefund() — initiate a refund request
 */
import { query, getClient } from "./db";
import { v4 as uuidv4 } from "uuid";
import type { PoolClient } from "pg";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FeeLineItem {
  line_item_id: string;
  arn: string;
  fee_head_code: string;
  description: string | null;
  base_amount: number | null;
  calculation_inputs: Record<string, unknown>;
  amount: number;
  currency: string;
  waiver_adjustment: number;
  created_by: string | null;
  created_at: Date;
}

export interface FeeDemand {
  demand_id: string;
  arn: string;
  demand_number: string | null;
  total_amount: number;
  paid_amount: number;
  status: "PENDING" | "PARTIALLY_PAID" | "PAID" | "WAIVED" | "CANCELLED";
  due_date: Date | null;
  created_by: string | null;
  created_at: Date;
  paid_at: Date | null;
}

export interface FeeDemandWithLines extends FeeDemand {
  lineItems: FeeLineItem[];
}

export interface RefundRequest {
  refund_id: string;
  payment_id: string;
  arn: string;
  reason: string;
  amount: number;
  status: "REQUESTED" | "APPROVED" | "REJECTED" | "PROCESSED";
  bank_details_jsonb: Record<string, unknown>;
  requested_by: string | null;
  requested_at: Date;
  processed_by: string | null;
  processed_at: Date | null;
}

export interface AssessFeeInput {
  feeHeadCode: string;
  description?: string;
  baseAmount?: number;
  calculationInputs?: Record<string, unknown>;
  amount: number;
  currency?: string;
  waiverAdjustment?: number;
}

// ---------------------------------------------------------------------------
// Fee Line Items
// ---------------------------------------------------------------------------

/**
 * Assess (create) fee line items for an application.
 * Returns all created line items.
 */
export async function assessFees(
  arn: string,
  items: AssessFeeInput[],
  createdBy?: string,
  client?: PoolClient
): Promise<FeeLineItem[]> {
  if (items.length === 0) return [];

  const run = client
    ? (text: string, params?: unknown[]) => client.query(text, params)
    : query;

  // Batch insert all fee line items in a single query with RETURNING
  const valuePlaceholders: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  for (const item of items) {
    const id = uuidv4();
    valuePlaceholders.push(
      `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`
    );
    params.push(
      id,
      arn,
      item.feeHeadCode,
      item.description || null,
      item.baseAmount ?? null,
      JSON.stringify(item.calculationInputs || {}),
      item.amount,
      item.currency || "INR",
      item.waiverAdjustment || 0,
      createdBy || null,
    );
  }

  const result = await run(
    `INSERT INTO fee_line_item
       (line_item_id, arn, fee_head_code, description, base_amount,
        calculation_inputs, amount, currency, waiver_adjustment, created_by)
     VALUES ${valuePlaceholders.join(", ")}
     RETURNING *`,
    params
  );

  return result.rows.map(rowToLineItem);
}

/** Get all fee line items for an application. */
export async function getFeeLineItems(arn: string): Promise<FeeLineItem[]> {
  const result = await query(
    "SELECT * FROM fee_line_item WHERE arn = $1 ORDER BY created_at",
    [arn]
  );
  return result.rows.map(rowToLineItem);
}

function rowToLineItem(row: any): FeeLineItem {
  return {
    line_item_id: row.line_item_id,
    arn: row.arn,
    fee_head_code: row.fee_head_code,
    description: row.description,
    base_amount: row.base_amount != null ? Number(row.base_amount) : null,
    calculation_inputs: row.calculation_inputs || {},
    amount: Number(row.amount),
    currency: row.currency,
    waiver_adjustment: Number(row.waiver_adjustment),
    created_by: row.created_by,
    created_at: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Fee Demands
// ---------------------------------------------------------------------------

/**
 * Create a fee demand by grouping existing line items.
 */
export async function createDemand(
  arn: string,
  lineItemIds: string[],
  options?: {
    dueDate?: Date | string;
    createdBy?: string;
  }
): Promise<FeeDemandWithLines> {
  const client = await getClient();
  try {
    await client.query("BEGIN");

    // Verify all line items belong to this ARN
    const lineResult = await client.query(
      "SELECT * FROM fee_line_item WHERE line_item_id = ANY($1) AND arn = $2",
      [lineItemIds, arn]
    );
    if (lineResult.rows.length !== lineItemIds.length) {
      throw new Error("Some fee line items not found or do not belong to this application");
    }

    const lineItems = lineResult.rows.map(rowToLineItem);
    const totalAmount = lineItems.reduce((sum, li) => sum + li.amount - li.waiver_adjustment, 0);

    const demandId = uuidv4();
    // Generate demand number
    const seqResult = await client.query("SELECT nextval('arn_seq') as seq");
    const seq = String(seqResult.rows[0].seq).padStart(6, "0");
    const year = new Date().getFullYear();
    const demandNumber = `PUDA/DEM/${year}/${seq}`;

    await client.query(
      `INSERT INTO fee_demand
         (demand_id, arn, demand_number, total_amount, status, due_date, created_by)
       VALUES ($1, $2, $3, $4, 'PENDING', $5, $6)`,
      [
        demandId,
        arn,
        demandNumber,
        totalAmount,
        options?.dueDate ? new Date(options.dueDate) : null,
        options?.createdBy || null,
      ]
    );

    // Link line items to demand
    for (const liId of lineItemIds) {
      await client.query(
        "INSERT INTO fee_demand_line (demand_id, line_item_id) VALUES ($1, $2)",
        [demandId, liId]
      );
    }

    await client.query("COMMIT");

    return {
      ...rowToDemand((await query("SELECT * FROM fee_demand WHERE demand_id = $1", [demandId])).rows[0]),
      lineItems,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Get a demand by ID with its line items. */
export async function getDemandById(demandId: string): Promise<FeeDemandWithLines | null> {
  const result = await query("SELECT * FROM fee_demand WHERE demand_id = $1", [demandId]);
  if (result.rows.length === 0) return null;
  const demand = rowToDemand(result.rows[0]);

  const lineResult = await query(
    `SELECT fli.* FROM fee_line_item fli
     JOIN fee_demand_line fdl ON fdl.line_item_id = fli.line_item_id
     WHERE fdl.demand_id = $1 ORDER BY fli.created_at`,
    [demandId]
  );

  return { ...demand, lineItems: lineResult.rows.map(rowToLineItem) };
}

/** Get all demands for an application. */
export async function getDemandsForApplication(arn: string): Promise<FeeDemand[]> {
  const result = await query(
    "SELECT * FROM fee_demand WHERE arn = $1 ORDER BY created_at",
    [arn]
  );
  return result.rows.map(rowToDemand);
}

/** Get pending/unpaid demands for an application. */
export async function getPendingDemands(arn: string): Promise<FeeDemand[]> {
  const result = await query(
    "SELECT * FROM fee_demand WHERE arn = $1 AND status IN ('PENDING', 'PARTIALLY_PAID') ORDER BY created_at",
    [arn]
  );
  return result.rows.map(rowToDemand);
}

/**
 * Update demand paid_amount and status after a payment.
 * Called internally by the payment module.
 */
export async function updateDemandPayment(
  demandId: string,
  paymentAmount: number,
  client?: PoolClient
): Promise<FeeDemand | null> {
  const MONEY_EPSILON = 0.000001;
  const run = client
    ? (text: string, params?: unknown[]) => client.query(text, params)
    : query;

  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    throw new Error("PAYMENT_AMOUNT_INVALID");
  }

  const demandResult = await run(
    `SELECT *
     FROM fee_demand
     WHERE demand_id = $1
     FOR UPDATE`,
    [demandId]
  );
  if (demandResult.rows.length === 0) {
    return null;
  }
  const demandBefore = rowToDemand(demandResult.rows[0]);
  if (demandBefore.status !== "PENDING" && demandBefore.status !== "PARTIALLY_PAID") {
    return demandBefore;
  }
  const remainingBalance = demandBefore.total_amount - demandBefore.paid_amount;
  if (paymentAmount > remainingBalance + MONEY_EPSILON) {
    throw new Error("PAYMENT_AMOUNT_EXCEEDS_REMAINING_BALANCE");
  }

  await run(
    `UPDATE fee_demand SET
       paid_amount = paid_amount + $2,
       status = CASE
         WHEN paid_amount + $2 >= total_amount THEN 'PAID'
         WHEN paid_amount + $2 > 0 THEN 'PARTIALLY_PAID'
         ELSE status
       END,
       paid_at = CASE
         WHEN paid_amount + $2 >= total_amount THEN NOW()
         ELSE paid_at
       END
     WHERE demand_id = $1 AND status IN ('PENDING', 'PARTIALLY_PAID')`,
    [demandId, paymentAmount]
  );

  const result = await run("SELECT * FROM fee_demand WHERE demand_id = $1", [demandId]);
  return result.rows.length > 0 ? rowToDemand(result.rows[0]) : null;
}

/** Waive a pending demand (set status to WAIVED). */
export async function waiveDemand(demandId: string): Promise<FeeDemand | null> {
  await query(
    "UPDATE fee_demand SET status = 'WAIVED' WHERE demand_id = $1 AND status = 'PENDING'",
    [demandId]
  );
  const result = await query("SELECT * FROM fee_demand WHERE demand_id = $1", [demandId]);
  return result.rows.length > 0 ? rowToDemand(result.rows[0]) : null;
}

/** Cancel a pending demand. */
export async function cancelDemand(demandId: string): Promise<FeeDemand | null> {
  await query(
    "UPDATE fee_demand SET status = 'CANCELLED' WHERE demand_id = $1 AND status = 'PENDING'",
    [demandId]
  );
  const result = await query("SELECT * FROM fee_demand WHERE demand_id = $1", [demandId]);
  return result.rows.length > 0 ? rowToDemand(result.rows[0]) : null;
}

function rowToDemand(row: any): FeeDemand {
  return {
    demand_id: row.demand_id,
    arn: row.arn,
    demand_number: row.demand_number,
    total_amount: Number(row.total_amount),
    paid_amount: Number(row.paid_amount),
    status: row.status,
    due_date: row.due_date,
    created_by: row.created_by,
    created_at: row.created_at,
    paid_at: row.paid_at,
  };
}

// ---------------------------------------------------------------------------
// Refund Requests
// ---------------------------------------------------------------------------

export interface CreateRefundInput {
  paymentId: string;
  reason: string;
  amount: number;
  bankDetails?: Record<string, unknown>;
  requestedBy?: string;
}

/** Create a refund request against a payment. */
export async function createRefundRequest(
  arn: string,
  input: CreateRefundInput
): Promise<RefundRequest> {
  const id = uuidv4();
  await query(
    `INSERT INTO refund_request
       (refund_id, payment_id, arn, reason, amount, bank_details_jsonb, requested_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      input.paymentId,
      arn,
      input.reason,
      input.amount,
      JSON.stringify(input.bankDetails || {}),
      input.requestedBy || null,
    ]
  );
  return (await getRefundRequestById(id))!;
}

/** Approve a refund request. */
export async function approveRefundRequest(
  refundId: string,
  processedBy?: string
): Promise<RefundRequest | null> {
  await query(
    `UPDATE refund_request SET status = 'APPROVED', processed_by = $2
     WHERE refund_id = $1 AND status = 'REQUESTED'`,
    [refundId, processedBy || null]
  );
  return getRefundRequestById(refundId);
}

/** Mark a refund as processed (funds transferred). */
export async function processRefundRequest(
  refundId: string,
  processedBy?: string
): Promise<RefundRequest | null> {
  await query(
    `UPDATE refund_request SET status = 'PROCESSED', processed_by = $2, processed_at = NOW()
     WHERE refund_id = $1 AND status = 'APPROVED'`,
    [refundId, processedBy || null]
  );
  return getRefundRequestById(refundId);
}

/** Reject a refund request. */
export async function rejectRefundRequest(
  refundId: string,
  processedBy?: string
): Promise<RefundRequest | null> {
  await query(
    `UPDATE refund_request SET status = 'REJECTED', processed_by = $2, processed_at = NOW()
     WHERE refund_id = $1 AND status = 'REQUESTED'`,
    [refundId, processedBy || null]
  );
  return getRefundRequestById(refundId);
}

export async function getRefundRequestById(refundId: string): Promise<RefundRequest | null> {
  const result = await query("SELECT * FROM refund_request WHERE refund_id = $1", [refundId]);
  return result.rows.length > 0 ? rowToRefund(result.rows[0]) : null;
}

export async function getRefundsForApplication(arn: string): Promise<RefundRequest[]> {
  const result = await query(
    "SELECT * FROM refund_request WHERE arn = $1 ORDER BY requested_at DESC",
    [arn]
  );
  return result.rows.map(rowToRefund);
}

function rowToRefund(row: any): RefundRequest {
  return {
    refund_id: row.refund_id,
    payment_id: row.payment_id,
    arn: row.arn,
    reason: row.reason,
    amount: Number(row.amount),
    status: row.status,
    bank_details_jsonb: row.bank_details_jsonb || {},
    requested_by: row.requested_by,
    requested_at: row.requested_at,
    processed_by: row.processed_by,
    processed_at: row.processed_at,
  };
}
