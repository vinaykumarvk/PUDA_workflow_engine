import fs from "node:fs";
import path from "node:path";
import { expect } from "vitest";
import { createApplication } from "./applications";
import { query as dbQuery } from "./db";
import { executeTransition } from "./workflow";

// ── Constants ──────────────────────────────────────────────────────────────────

export const TEST_AUTHORITY_ID = "PUDA";
export const TEST_CITIZEN_ID = "test-citizen-1";
export const GENERIC_OFFICER_ID = "test-officer-1";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WorkflowState {
  stateId: string;
  type: "DRAFT" | "SYSTEM" | "TASK" | "QUERY" | "END";
  taskRequired: boolean;
  systemRoleId?: string;
  slaDays?: number;
}

export interface WorkflowTransition {
  transitionId: string;
  fromStateId: string;
  toStateId: string;
  trigger: "manual" | "system";
  allowedActorTypes?: string[];
  allowedSystemRoleIds?: string[];
  actions?: string[];
}

export interface WorkflowConfig {
  workflowId: string;
  version: string;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
}

export interface OfficerLevel {
  stateId: string;
  systemRoleId: string;
  forwardTransitionId?: string;
  approveTransitionId?: string;
  rejectTransitionId: string;
  queryTransitionId?: string;
}

export interface PathStep {
  transitionId: string;
  actorType: "CITIZEN" | "OFFICER" | "SYSTEM";
  actorSystemRoles: string[];
  actionPayload?: any;
  remarks?: string;
  expectedNewState: string;
  /** Assign the pending task to GENERIC_OFFICER before executing */
  assignTask?: boolean;
  /** State whose pending task to assign (for the UPDATE query) */
  taskStateId?: string;
}

export interface ParsedWorkflow {
  serviceKey: string;
  workflow: WorkflowConfig;
  officerChain: OfficerLevel[];
}

// ── Workflow Loader ────────────────────────────────────────────────────────────

export function loadAllWorkflows(): ParsedWorkflow[] {
  const servicePacksDir = path.resolve(__dirname, "../../../service-packs");
  const entries = fs.readdirSync(servicePacksDir, { withFileTypes: true });
  const results: ParsedWorkflow[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const workflowPath = path.join(servicePacksDir, entry.name, "workflow.json");
    if (!fs.existsSync(workflowPath)) continue;

    let workflow: WorkflowConfig;
    try {
      workflow = JSON.parse(fs.readFileSync(workflowPath, "utf-8"));
    } catch (e: any) {
      throw new Error(`Failed to parse ${workflowPath}: ${e.message}`);
    }

    const officerChain = parseOfficerChain(workflow, entry.name);
    if (officerChain.length === 0) {
      throw new Error(
        `${entry.name}: Could not parse officer chain — no TASK states found from PENDING_AT_CLERK`
      );
    }

    results.push({ serviceKey: entry.name, workflow, officerChain });
  }

  return results;
}

// ── Workflow Parser ────────────────────────────────────────────────────────────

export function parseOfficerChain(workflow: WorkflowConfig, serviceKey: string): OfficerLevel[] {
  const stateMap = new Map(workflow.states.map((s) => [s.stateId, s]));
  const transitionsByFrom = new Map<string, WorkflowTransition[]>();
  for (const t of workflow.transitions) {
    const list = transitionsByFrom.get(t.fromStateId) || [];
    list.push(t);
    transitionsByFrom.set(t.fromStateId, list);
  }

  const chain: OfficerLevel[] = [];
  let currentStateId = "PENDING_AT_CLERK";

  while (true) {
    const state = stateMap.get(currentStateId);
    if (!state || state.type !== "TASK" || !state.systemRoleId) break;

    const transitions = transitionsByFrom.get(currentStateId) || [];

    // FORWARD: manual transition whose target is another TASK state
    const forward = transitions.find(
      (t) => t.trigger === "manual" && stateMap.get(t.toStateId)?.type === "TASK"
    );
    // APPROVE: manual transition to APPROVED
    const approve = transitions.find(
      (t) => t.trigger === "manual" && t.toStateId === "APPROVED"
    );
    // REJECT: manual transition to REJECTED
    const reject = transitions.find(
      (t) => t.trigger === "manual" && t.toStateId === "REJECTED"
    );
    // QUERY: manual transition to QUERY_PENDING
    const queryTrans = transitions.find(
      (t) => t.trigger === "manual" && t.toStateId === "QUERY_PENDING"
    );

    if (!reject) {
      throw new Error(
        `${serviceKey}: No REJECT transition found from ${currentStateId}`
      );
    }

    chain.push({
      stateId: currentStateId,
      systemRoleId: state.systemRoleId,
      forwardTransitionId: forward?.transitionId,
      approveTransitionId: approve?.transitionId,
      rejectTransitionId: reject.transitionId,
      queryTransitionId: queryTrans?.transitionId,
    });

    if (forward) {
      currentStateId = forward.toStateId;
    } else {
      // Last officer — must have an APPROVE transition
      if (!approve) {
        throw new Error(
          `${serviceKey}: Last officer at ${currentStateId} has no FORWARD and no APPROVE transition`
        );
      }
      break;
    }
  }

  return chain;
}

// ── Path Builders ──────────────────────────────────────────────────────────────

export function buildSubmitSteps(): PathStep[] {
  return [
    {
      transitionId: "SUBMIT",
      actorType: "CITIZEN",
      actorSystemRoles: [],
      expectedNewState: "SUBMITTED",
    },
    {
      transitionId: "ASSIGN_CLERK",
      actorType: "SYSTEM",
      actorSystemRoles: [],
      expectedNewState: "PENDING_AT_CLERK",
    },
  ];
}

export function buildOfficerForwardStep(level: OfficerLevel, nextStateId: string): PathStep {
  return {
    transitionId: level.forwardTransitionId!,
    actorType: "OFFICER",
    actorSystemRoles: [level.systemRoleId],
    actionPayload: { decision: "FORWARD" },
    remarks: `Forwarding from ${level.systemRoleId}`,
    expectedNewState: nextStateId,
    assignTask: true,
    taskStateId: level.stateId,
  };
}

export function buildApprovalTail(lastLevel: OfficerLevel): PathStep[] {
  return [
    {
      transitionId: lastLevel.approveTransitionId!,
      actorType: "OFFICER",
      actorSystemRoles: [lastLevel.systemRoleId],
      actionPayload: { decision: "APPROVE" },
      remarks: `Approved by ${lastLevel.systemRoleId}`,
      expectedNewState: "APPROVED",
      assignTask: true,
      taskStateId: lastLevel.stateId,
    },
    {
      transitionId: "CLOSE_APPROVED",
      actorType: "SYSTEM",
      actorSystemRoles: [],
      expectedNewState: "CLOSED",
    },
  ];
}

export function buildRejectionTail(level: OfficerLevel): PathStep[] {
  return [
    {
      transitionId: level.rejectTransitionId,
      actorType: "OFFICER",
      actorSystemRoles: [level.systemRoleId],
      actionPayload: { decision: "REJECT" },
      remarks: `Rejected by ${level.systemRoleId}`,
      expectedNewState: "REJECTED",
      assignTask: true,
      taskStateId: level.stateId,
    },
    {
      transitionId: "CLOSE_REJECTED",
      actorType: "SYSTEM",
      actorSystemRoles: [],
      expectedNewState: "CLOSED",
    },
  ];
}

export function buildHappyPath(chain: OfficerLevel[]): PathStep[] {
  const steps: PathStep[] = [...buildSubmitSteps()];

  // Forward through all officers except the last
  for (let i = 0; i < chain.length - 1; i++) {
    steps.push(buildOfficerForwardStep(chain[i], chain[i + 1].stateId));
  }

  // Last officer approves → CLOSED
  steps.push(...buildApprovalTail(chain[chain.length - 1]));
  return steps;
}

export function buildRejectionPath(chain: OfficerLevel[], rejectAtIndex: number): PathStep[] {
  const steps: PathStep[] = [...buildSubmitSteps()];

  // Forward through officers up to the rejection point
  for (let i = 0; i < rejectAtIndex; i++) {
    steps.push(buildOfficerForwardStep(chain[i], chain[i + 1].stateId));
  }

  // Reject at the target level → CLOSED
  steps.push(...buildRejectionTail(chain[rejectAtIndex]));
  return steps;
}

export function buildQueryLoopPath(chain: OfficerLevel[]): PathStep[] | null {
  const clerk = chain[0];
  if (!clerk.queryTransitionId) return null;

  const steps: PathStep[] = [
    ...buildSubmitSteps(),
    ...buildQuerySteps(clerk),
  ];

  // Continue with full happy path from clerk onward
  for (let i = 0; i < chain.length - 1; i++) {
    steps.push(buildOfficerForwardStep(chain[i], chain[i + 1].stateId));
  }
  steps.push(...buildApprovalTail(chain[chain.length - 1]));

  return steps;
}

/** Build the 3 steps for an officer raising a query: raise → citizen respond → system route back */
export function buildQuerySteps(level: OfficerLevel): PathStep[] {
  return [
    {
      transitionId: level.queryTransitionId!,
      actorType: "OFFICER",
      actorSystemRoles: [level.systemRoleId],
      actionPayload: {
        decision: "QUERY",
        queryMessage: "Test query: please provide additional documents.",
        unlockedFields: [],
        unlockedDocuments: [],
      },
      remarks: `Query raised by ${level.systemRoleId}`,
      expectedNewState: "QUERY_PENDING",
      assignTask: true,
      taskStateId: level.stateId,
    },
    {
      transitionId: "QUERY_RESPOND",
      actorType: "CITIZEN",
      actorSystemRoles: [],
      expectedNewState: "RESUBMITTED",
    },
    {
      transitionId: "RESUBMIT_ROUTE",
      actorType: "SYSTEM",
      actorSystemRoles: [],
      expectedNewState: "PENDING_AT_CLERK",
    },
  ];
}

// ── Step Executor ──────────────────────────────────────────────────────────────

export async function executeStep(arn: string, step: PathStep): Promise<void> {
  // Assign the pending task to the generic officer before an officer transition
  if (step.assignTask && step.taskStateId) {
    const assigned = await dbQuery(
      `UPDATE task
       SET assignee_user_id = $1, status = 'IN_PROGRESS', started_at = NOW()
       WHERE arn = $2 AND state_id = $3 AND status = 'PENDING'
       RETURNING task_id`,
      [GENERIC_OFFICER_ID, arn, step.taskStateId]
    );
    if (assigned.rows.length === 0) {
      throw new Error(
        `No PENDING task found for arn=${arn} state=${step.taskStateId} before ${step.transitionId}`
      );
    }
  }

  const actorUserId =
    step.actorType === "CITIZEN"
      ? TEST_CITIZEN_ID
      : step.actorType === "SYSTEM"
        ? "system"
        : GENERIC_OFFICER_ID;

  const result = await executeTransition(
    arn,
    step.transitionId,
    actorUserId,
    step.actorType,
    step.actorSystemRoles,
    step.remarks,
    step.actionPayload
  );

  expect(
    result,
    `${step.transitionId} failed: ${result.error ?? "unknown"}`
  ).toEqual(
    expect.objectContaining({
      success: true,
      newStateId: step.expectedNewState,
    })
  );
}

export async function walkPath(arn: string, steps: PathStep[]): Promise<void> {
  for (const step of steps) {
    await executeStep(arn, step);
  }
}

// ── Cleanup ────────────────────────────────────────────────────────────────────

export async function cleanupApplicationTree(arn: string): Promise<void> {
  await dbQuery(
    `DELETE FROM notice_letter
      WHERE arn = $1
         OR query_id IN (SELECT query_id FROM query WHERE arn = $1)
         OR decision_id IN (SELECT decision_id FROM decision WHERE arn = $1)`,
    [arn]
  );
  await dbQuery(`DELETE FROM output WHERE arn = $1`, [arn]);
  await dbQuery(`DELETE FROM decision WHERE arn = $1`, [arn]);
  await dbQuery(`DELETE FROM inspection WHERE arn = $1`, [arn]);
  await dbQuery(`DELETE FROM refund_request WHERE arn = $1`, [arn]);
  await dbQuery(`DELETE FROM payment WHERE arn = $1`, [arn]);
  await dbQuery(
    `DELETE FROM fee_demand_line
      WHERE demand_id IN (SELECT demand_id FROM fee_demand WHERE arn = $1)`,
    [arn]
  );
  await dbQuery(`DELETE FROM fee_demand WHERE arn = $1`, [arn]);
  await dbQuery(`DELETE FROM fee_line_item WHERE arn = $1`, [arn]);
  await dbQuery(`DELETE FROM notification_log WHERE arn = $1`, [arn]);
  await dbQuery(`DELETE FROM notification WHERE arn = $1`, [arn]);
  await dbQuery(`DELETE FROM application_document WHERE arn = $1`, [arn]);
  await dbQuery(`DELETE FROM document WHERE arn = $1`, [arn]);
  await dbQuery(`DELETE FROM query WHERE arn = $1`, [arn]);
  await dbQuery(`DELETE FROM task WHERE arn = $1`, [arn]);
  await dbQuery(`DELETE FROM application_property WHERE arn = $1`, [arn]);
  await dbQuery(`DELETE FROM application WHERE arn = $1`, [arn]);
}

// ── Application Factory ────────────────────────────────────────────────────────

export async function createDraftApp(serviceKey: string): Promise<string> {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const created = await createApplication(
    TEST_AUTHORITY_ID,
    serviceKey,
    TEST_CITIZEN_ID,
    {
      applicant: { full_name: "Path Walker Test Citizen" },
      property: { upn: `PW-UPN-${uniqueSuffix}` },
    }
  );
  return created.arn;
}

// ── Verification Helpers ───────────────────────────────────────────────────────

export async function verifyFinalState(
  arn: string,
  expectedState: string,
  expectedDisposalType?: "APPROVED" | "REJECTED"
): Promise<void> {
  const appRow = await dbQuery(
    `SELECT state_id, disposal_type, disposed_at FROM application WHERE arn = $1`,
    [arn]
  );
  expect(appRow.rows).toHaveLength(1);
  expect(appRow.rows[0].state_id).toBe(expectedState);
  if (expectedDisposalType) {
    expect(appRow.rows[0].disposal_type).toBe(expectedDisposalType);
    expect(appRow.rows[0].disposed_at).toBeTruthy();
  }
}

export async function verifyAuditTrail(arn: string, minEvents: number): Promise<void> {
  const auditRows = await dbQuery(
    `SELECT COUNT(*)::int as cnt FROM audit_event WHERE arn = $1 AND event_type = 'STATE_CHANGED'`,
    [arn]
  );
  expect(auditRows.rows[0].cnt).toBeGreaterThanOrEqual(minEvents);
}

export async function verifyDecisionExists(
  arn: string,
  decisionType: "APPROVE" | "REJECT"
): Promise<void> {
  const decRow = await dbQuery(
    `SELECT decision_type FROM decision WHERE arn = $1 ORDER BY created_at DESC LIMIT 1`,
    [arn]
  );
  expect(decRow.rows).toHaveLength(1);
  expect(decRow.rows[0].decision_type).toBe(decisionType);
}

export async function verifyNoticeLetter(arn: string, noticeType: string): Promise<void> {
  const noticeRow = await dbQuery(
    `SELECT notice_type FROM notice_letter WHERE arn = $1 AND notice_type = $2 LIMIT 1`,
    [arn, noticeType]
  );
  expect(noticeRow.rows.length).toBeGreaterThanOrEqual(1);
}

export async function verifyQueryArtifacts(arn: string): Promise<void> {
  const qRow = await dbQuery(
    `SELECT status, message FROM query WHERE arn = $1 ORDER BY raised_at DESC LIMIT 1`,
    [arn]
  );
  expect(qRow.rows).toHaveLength(1);
  expect(qRow.rows[0].status).toBe("PENDING");
  expect(qRow.rows[0].message).toBeTruthy();

  const appRow = await dbQuery(
    `SELECT query_count FROM application WHERE arn = $1`,
    [arn]
  );
  expect(Number(appRow.rows[0].query_count)).toBeGreaterThanOrEqual(1);
}

export async function verifyAllTasksCompleted(arn: string): Promise<void> {
  const pendingTasks = await dbQuery(
    `SELECT task_id, state_id, status FROM task WHERE arn = $1 AND status NOT IN ('COMPLETED', 'CANCELLED')`,
    [arn]
  );
  expect(
    pendingTasks.rows,
    `Expected no open tasks but found ${pendingTasks.rows.length}: ${JSON.stringify(pendingTasks.rows)}`
  ).toHaveLength(0);
}

// ── Additional Verification Helpers (for combinatorial tests) ──────────────────

export async function verifyQueryCount(arn: string, expectedMin: number): Promise<void> {
  const appRow = await dbQuery(
    `SELECT query_count FROM application WHERE arn = $1`,
    [arn]
  );
  expect(Number(appRow.rows[0].query_count)).toBeGreaterThanOrEqual(expectedMin);

  const queryRows = await dbQuery(
    `SELECT COUNT(*)::int as cnt FROM query WHERE arn = $1`,
    [arn]
  );
  expect(queryRows.rows[0].cnt).toBeGreaterThanOrEqual(expectedMin);
}

export async function verifyQueryNoticeCount(arn: string, expectedMin: number): Promise<void> {
  const noticeRows = await dbQuery(
    `SELECT COUNT(*)::int as cnt FROM notice_letter WHERE arn = $1 AND notice_type = 'QUERY'`,
    [arn]
  );
  expect(noticeRows.rows[0].cnt).toBeGreaterThanOrEqual(expectedMin);
}

export async function verifyStatusHistoryLength(arn: string, expectedMin: number): Promise<void> {
  const appRow = await dbQuery(
    `SELECT data_jsonb FROM application WHERE arn = $1`,
    [arn]
  );
  const data = appRow.rows[0]?.data_jsonb;
  const history = data?.application?.statusHistory ?? [];
  expect(history.length).toBeGreaterThanOrEqual(expectedMin);
}
