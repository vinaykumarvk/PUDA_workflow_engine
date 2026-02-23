/**
 * Inspection DAL — first-class inspection/site-verification management.
 *
 * An inspection is a scheduled site visit tied to an application (and
 * optionally to the task that triggered it). It records scheduling,
 * assignment, checklist findings, photos, and outcome.
 */
import { query } from "./db";
import { v4 as uuidv4 } from "uuid";
import type { PoolClient } from "pg";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InspectionStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type InspectionOutcome = "PASS" | "FAIL" | "REINSPECTION_REQUIRED" | "NA";

export interface InspectionRow {
  inspection_id: string;
  arn: string;
  task_id: string | null;
  inspection_type: string;
  status: InspectionStatus;
  scheduled_at: Date | null;
  actual_at: Date | null;
  officer_user_id: string | null;
  officer_role_id: string | null;
  findings_summary: string | null;
  checklist_jsonb: Record<string, unknown>;
  observations_jsonb: Record<string, unknown>;
  photos_jsonb: unknown[];
  outcome: InspectionOutcome | null;
  outcome_remarks: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateInspectionInput {
  arn: string;
  taskId?: string;
  inspectionType: string;
  scheduledAt?: Date | string;
  officerUserId?: string;
  officerRoleId?: string;
}

export interface CompleteInspectionInput {
  actualAt?: Date | string;
  findingsSummary?: string;
  checklistData?: Record<string, unknown>;
  observations?: Record<string, unknown>;
  photos?: unknown[];
  outcome: InspectionOutcome;
  outcomeRemarks?: string;
}

// ---------------------------------------------------------------------------
// Columns & mapper
// ---------------------------------------------------------------------------

const COLUMNS = `
  inspection_id, arn, task_id, inspection_type, status,
  scheduled_at, actual_at, officer_user_id, officer_role_id,
  findings_summary, checklist_jsonb, observations_jsonb, photos_jsonb,
  outcome, outcome_remarks, created_at, updated_at
`;

function rowToInspection(row: any): InspectionRow {
  return {
    inspection_id: row.inspection_id,
    arn: row.arn,
    task_id: row.task_id,
    inspection_type: row.inspection_type,
    status: row.status as InspectionStatus,
    scheduled_at: row.scheduled_at,
    actual_at: row.actual_at,
    officer_user_id: row.officer_user_id,
    officer_role_id: row.officer_role_id,
    findings_summary: row.findings_summary,
    checklist_jsonb: row.checklist_jsonb || {},
    observations_jsonb: row.observations_jsonb || {},
    photos_jsonb: row.photos_jsonb || [],
    outcome: row.outcome as InspectionOutcome | null,
    outcome_remarks: row.outcome_remarks,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a new inspection record. Typically called when a task is assigned
 * to a Junior Engineer / SDO for site verification.
 */
export async function createInspection(
  input: CreateInspectionInput,
  client?: PoolClient
): Promise<InspectionRow> {
  const run = client
    ? (text: string, params?: unknown[]) => client.query(text, params)
    : query;

  const id = uuidv4();
  const scheduledAt = input.scheduledAt
    ? new Date(input.scheduledAt)
    : null;

  await run(
    `INSERT INTO inspection (
       inspection_id, arn, task_id, inspection_type, status,
       scheduled_at, officer_user_id, officer_role_id
     ) VALUES ($1, $2, $3, $4, 'SCHEDULED', $5, $6, $7)`,
    [
      id,
      input.arn,
      input.taskId || null,
      input.inspectionType,
      scheduledAt,
      input.officerUserId || null,
      input.officerRoleId || null,
    ]
  );

  return (await getInspectionById(id, client))!;
}

// ---------------------------------------------------------------------------
// Update / complete
// ---------------------------------------------------------------------------

/** Assign an officer to an inspection. */
export async function assignInspection(
  inspectionId: string,
  officerUserId: string,
  officerRoleId?: string
): Promise<InspectionRow | null> {
  await query(
    `UPDATE inspection SET
       officer_user_id = $2,
       officer_role_id = COALESCE($3, officer_role_id),
       status = CASE WHEN status = 'SCHEDULED' THEN 'IN_PROGRESS' ELSE status END,
       updated_at = NOW()
     WHERE inspection_id = $1 AND status IN ('SCHEDULED', 'IN_PROGRESS')`,
    [inspectionId, officerUserId, officerRoleId || null]
  );
  return getInspectionById(inspectionId);
}

/** Record findings and complete an inspection. */
export async function completeInspection(
  inspectionId: string,
  input: CompleteInspectionInput
): Promise<InspectionRow | null> {
  const actualAt = input.actualAt ? new Date(input.actualAt) : new Date();

  await query(
    `UPDATE inspection SET
       status = 'COMPLETED',
       actual_at = $2,
       findings_summary = COALESCE($3, findings_summary),
       checklist_jsonb = CASE WHEN $4::jsonb != '{}'::jsonb THEN $4::jsonb ELSE checklist_jsonb END,
       observations_jsonb = CASE WHEN $5::jsonb != '{}'::jsonb THEN $5::jsonb ELSE observations_jsonb END,
       photos_jsonb = CASE WHEN $6::jsonb != '[]'::jsonb THEN $6::jsonb ELSE photos_jsonb END,
       outcome = $7,
       outcome_remarks = COALESCE($8, outcome_remarks),
       updated_at = NOW()
     WHERE inspection_id = $1 AND status IN ('SCHEDULED', 'IN_PROGRESS')`,
    [
      inspectionId,
      actualAt,
      input.findingsSummary || null,
      JSON.stringify(input.checklistData || {}),
      JSON.stringify(input.observations || {}),
      JSON.stringify(input.photos || []),
      input.outcome,
      input.outcomeRemarks || null,
    ]
  );
  return getInspectionById(inspectionId);
}

/** Cancel an inspection. */
export async function cancelInspection(inspectionId: string): Promise<InspectionRow | null> {
  await query(
    `UPDATE inspection SET status = 'CANCELLED', updated_at = NOW()
     WHERE inspection_id = $1 AND status IN ('SCHEDULED', 'IN_PROGRESS')`,
    [inspectionId]
  );
  return getInspectionById(inspectionId);
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export async function getInspectionById(
  inspectionId: string,
  client?: PoolClient
): Promise<InspectionRow | null> {
  const run = client
    ? (text: string, params?: unknown[]) => client.query(text, params)
    : query;
  const result = await run(
    `SELECT ${COLUMNS} FROM inspection WHERE inspection_id = $1`,
    [inspectionId]
  );
  return result.rows.length > 0 ? rowToInspection(result.rows[0]) : null;
}

/** Get all inspections for an application. */
export async function getInspectionsForApplication(arn: string): Promise<InspectionRow[]> {
  const result = await query(
    `SELECT ${COLUMNS} FROM inspection WHERE arn = $1 ORDER BY created_at DESC`,
    [arn]
  );
  return result.rows.map(rowToInspection);
}

/** Get the inspection linked to a specific task. */
export async function getInspectionForTask(taskId: string): Promise<InspectionRow | null> {
  const result = await query(
    `SELECT ${COLUMNS} FROM inspection WHERE task_id = $1 LIMIT 1`,
    [taskId]
  );
  return result.rows.length > 0 ? rowToInspection(result.rows[0]) : null;
}

/** Get an officer's inspection queue (scheduled + in-progress). */
export async function getOfficerInspectionQueue(
  officerUserId: string,
  includeCompleted = false,
  authorityIds?: string[]
): Promise<InspectionRow[]> {
  const statusFilter = includeCompleted
    ? "i.status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED')"
    : "i.status IN ('SCHEDULED', 'IN_PROGRESS')";

  const authorityFilter =
    authorityIds && authorityIds.length > 0 ? " AND a.authority_id = ANY($2)" : "";
  const params: unknown[] = [officerUserId];
  if (authorityIds && authorityIds.length > 0) {
    params.push(authorityIds);
  }

  const result = await query(
    `SELECT
       i.inspection_id, i.arn, i.task_id, i.inspection_type, i.status,
       i.scheduled_at, i.actual_at, i.officer_user_id, i.officer_role_id,
       i.findings_summary, i.checklist_jsonb, i.observations_jsonb, i.photos_jsonb,
       i.outcome, i.outcome_remarks, i.created_at, i.updated_at
     FROM inspection i
     JOIN application a ON a.arn = i.arn
     WHERE i.officer_user_id = $1 AND ${statusFilter}${authorityFilter}
     ORDER BY
       CASE i.status WHEN 'IN_PROGRESS' THEN 0 WHEN 'SCHEDULED' THEN 1 ELSE 2 END,
       i.scheduled_at ASC NULLS LAST`,
    params
  );
  return result.rows.map(rowToInspection);
}

// ---------------------------------------------------------------------------
// Workflow integration helper
// ---------------------------------------------------------------------------

/**
 * Called by the workflow engine when a task is created for a role that
 * requires site verification (e.g., JUNIOR_ENGINEER on water/sewerage).
 *
 * Checks if the service-pack state config has a checklist with
 * "site_visit_completed" and, if so, auto-creates an inspection record.
 */
export async function maybeCreateInspectionForTask(
  arn: string,
  taskId: string,
  stateId: string,
  systemRoleId: string,
  stateConfig?: any,
  client?: PoolClient
): Promise<InspectionRow | null> {
  // Only create if the state has a taskUi checklist with site_visit
  const checklist: any[] = stateConfig?.taskUi?.checklist || [];
  const hasSiteVisit = checklist.some(
    (item: any) => item.key === "site_visit_completed"
  );

  if (!hasSiteVisit) {
    return null;
  }

  // Determine inspection type from checklist items
  let inspectionType = "SITE_VISIT";
  if (checklist.some((item: any) => item.key === "plumber_certificate_verified")) {
    inspectionType = "PLUMBING_SITE_VISIT";
  }

  return createInspection(
    {
      arn,
      taskId,
      inspectionType,
      officerRoleId: systemRoleId,
    },
    client
  );
}
