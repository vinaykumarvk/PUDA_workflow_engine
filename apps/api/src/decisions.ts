/**
 * Decisions DAL — first-class decision records.
 *
 * A decision is the formal outcome of an application workflow:
 * APPROVE, REJECT, RETURN, or PARTIAL_APPROVE.
 *
 * Previously, decision data was split across:
 *   - application.disposed_at / disposal_type (denormalised)
 *   - task.decision (per-task action)
 * This module promotes it to a full record with reason codes,
 * conditions, and audit linkage.
 */
import { query } from "./db";
import { v4 as uuidv4 } from "uuid";
import type { PoolClient } from "pg";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DecisionType = "APPROVE" | "REJECT" | "RETURN" | "PARTIAL_APPROVE";

export interface DecisionRecord {
  decision_id: string;
  arn: string;
  decision_type: DecisionType;
  decided_at: Date;
  decided_by_user_id: string | null;
  decided_by_role: string | null;
  reason_codes: string[];
  remarks: string | null;
  conditions: string[];
  task_id: string | null;
  metadata_jsonb: Record<string, unknown>;
  created_at: Date;
}

export interface CreateDecisionInput {
  arn: string;
  decisionType: DecisionType;
  decidedByUserId?: string;
  decidedByRole?: string;
  reasonCodes?: string[];
  remarks?: string;
  conditions?: string[];
  taskId?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Record a formal decision for an application.
 * Called by the RECORD_DECISION workflow action.
 */
export async function createDecision(
  input: CreateDecisionInput,
  client?: PoolClient
): Promise<DecisionRecord> {
  const run = client
    ? (text: string, params?: unknown[]) => client.query(text, params)
    : query;

  const id = uuidv4();

  await run(
    `INSERT INTO decision
       (decision_id, arn, decision_type, decided_at,
        decided_by_user_id, decided_by_role,
        reason_codes, remarks, conditions,
        task_id, metadata_jsonb)
     VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      input.arn,
      input.decisionType,
      input.decidedByUserId || null,
      input.decidedByRole || null,
      input.reasonCodes || [],
      input.remarks || null,
      input.conditions || [],
      input.taskId || null,
      JSON.stringify(input.metadata || {}),
    ]
  );

  return (await getDecisionById(id, client))!;
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export async function getDecisionById(
  decisionId: string,
  client?: PoolClient
): Promise<DecisionRecord | null> {
  const run = client
    ? (text: string, params?: unknown[]) => client.query(text, params)
    : query;
  const result = await run(
    "SELECT * FROM decision WHERE decision_id = $1",
    [decisionId]
  );
  return result.rows.length > 0 ? rowToDecision(result.rows[0]) : null;
}

/** Get all decisions for an application (usually 1, but could be multiple for RETURN → resubmit flows). */
export async function getDecisionsForApplication(arn: string): Promise<DecisionRecord[]> {
  const result = await query(
    "SELECT * FROM decision WHERE arn = $1 ORDER BY decided_at DESC",
    [arn]
  );
  return result.rows.map(rowToDecision);
}

/** Get the latest/final decision for an application. */
export async function getLatestDecision(arn: string): Promise<DecisionRecord | null> {
  const result = await query(
    "SELECT * FROM decision WHERE arn = $1 ORDER BY decided_at DESC LIMIT 1",
    [arn]
  );
  return result.rows.length > 0 ? rowToDecision(result.rows[0]) : null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToDecision(row: any): DecisionRecord {
  return {
    decision_id: row.decision_id,
    arn: row.arn,
    decision_type: row.decision_type as DecisionType,
    decided_at: row.decided_at,
    decided_by_user_id: row.decided_by_user_id,
    decided_by_role: row.decided_by_role,
    reason_codes: row.reason_codes || [],
    remarks: row.remarks,
    conditions: row.conditions || [],
    task_id: row.task_id,
    metadata_jsonb: row.metadata_jsonb || {},
    created_at: row.created_at,
  };
}
