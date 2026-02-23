import path from "node:path";
import dotenv from "dotenv";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApplication } from "./applications";
import { query } from "./db";
import { executeTransition } from "./workflow";

dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });

const TEST_AUTHORITY_ID = "PUDA";
const TEST_SERVICE_KEY = "no_due_certificate";
const TEST_CITIZEN_ID = "test-citizen-1";
const TEST_CLERK_ID = "test-officer-1";

async function cleanupApplicationTree(arn: string): Promise<void> {
  await query(
    `DELETE FROM notice_letter
      WHERE arn = $1
         OR query_id IN (SELECT query_id FROM query WHERE arn = $1)
         OR decision_id IN (SELECT decision_id FROM decision WHERE arn = $1)`,
    [arn]
  );
  await query(`DELETE FROM output WHERE arn = $1`, [arn]);
  await query(`DELETE FROM decision WHERE arn = $1`, [arn]);
  await query(`DELETE FROM inspection WHERE arn = $1`, [arn]);
  await query(`DELETE FROM refund_request WHERE arn = $1`, [arn]);
  await query(`DELETE FROM payment WHERE arn = $1`, [arn]);
  await query(
    `DELETE FROM fee_demand_line
      WHERE demand_id IN (SELECT demand_id FROM fee_demand WHERE arn = $1)`,
    [arn]
  );
  await query(`DELETE FROM fee_demand WHERE arn = $1`, [arn]);
  await query(`DELETE FROM fee_line_item WHERE arn = $1`, [arn]);
  await query(`DELETE FROM notification_log WHERE arn = $1`, [arn]);
  await query(`DELETE FROM notification WHERE arn = $1`, [arn]);
  await query(`DELETE FROM document WHERE arn = $1`, [arn]);
  await query(`DELETE FROM query WHERE arn = $1`, [arn]);
  await query(`DELETE FROM task WHERE arn = $1`, [arn]);
  await query(`DELETE FROM application_property WHERE arn = $1`, [arn]);
  await query(`DELETE FROM application WHERE arn = $1`, [arn]);
}

async function createDraftApplication(): Promise<string> {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const created = await createApplication(
    TEST_AUTHORITY_ID,
    TEST_SERVICE_KEY,
    TEST_CITIZEN_ID,
    {
      applicant: { full_name: "Workflow Test Citizen" },
      property: { upn: `WF-UPN-${uniqueSuffix}` },
    }
  );
  return created.arn;
}

async function transitionToClerkInbox(arn: string): Promise<void> {
  const submitResult = await executeTransition(arn, "SUBMIT", TEST_CITIZEN_ID, "CITIZEN", []);
  expect(submitResult).toEqual(expect.objectContaining({ success: true, newStateId: "SUBMITTED" }));
  const assignResult = await executeTransition(arn, "ASSIGN_CLERK", "system", "SYSTEM", []);
  expect(assignResult).toEqual(
    expect.objectContaining({ success: true, newStateId: "PENDING_AT_CLERK" })
  );
}

describe("Workflow Engine Integration", () => {
  let dbReady = false;
  const createdArns = new Set<string>();

  beforeAll(async () => {
    try {
      await query("SELECT 1");
      dbReady = true;
    } catch {
      dbReady = false;
    }
  });

  beforeEach((ctx) => {
    if (!dbReady) ctx.skip();
  });

  afterEach(async () => {
    for (const arn of createdArns) {
      await cleanupApplicationTree(arn);
    }
    createdArns.clear();
  });

  it("executes DRAFT -> SUBMITTED and records status history + audit", async () => {
    const arn = await createDraftApplication();
    createdArns.add(arn);

    const transition = await executeTransition(arn, "SUBMIT", TEST_CITIZEN_ID, "CITIZEN", []);
    expect(transition.success).toBe(true);
    expect(transition.newStateId).toBe("SUBMITTED");

    const appState = await query(
      `SELECT state_id, row_version, data_jsonb
       FROM application
       WHERE arn = $1`,
      [arn]
    );
    expect(appState.rows).toHaveLength(1);
    expect(appState.rows[0].state_id).toBe("SUBMITTED");
    expect(Number(appState.rows[0].row_version)).toBeGreaterThanOrEqual(1);

    const statusHistoryRaw = appState.rows[0].data_jsonb?.application?.statusHistory;
    const statusHistory = Array.isArray(statusHistoryRaw)
      ? statusHistoryRaw
      : statusHistoryRaw
        ? [statusHistoryRaw]
        : [];
    expect(statusHistory.length).toBeGreaterThan(0);
    expect(statusHistory.at(-1)).toEqual(
      expect.objectContaining({
        from: "DRAFT",
        to: "SUBMITTED",
        changedBy: TEST_CITIZEN_ID,
      })
    );

    const auditEvents = await query(
      `SELECT event_type, actor_type, actor_id
       FROM audit_event
       WHERE arn = $1 AND event_type = 'STATE_CHANGED'
       ORDER BY created_at DESC
       LIMIT 1`,
      [arn]
    );
    expect(auditEvents.rows).toHaveLength(1);
    expect(auditEvents.rows[0]).toEqual(
      expect.objectContaining({
        event_type: "STATE_CHANGED",
        actor_type: "CITIZEN",
        actor_id: TEST_CITIZEN_ID,
      })
    );
  });

  it("rejects unknown transitions", async () => {
    const arn = await createDraftApplication();
    createdArns.add(arn);

    const transition = await executeTransition(
      arn,
      "UNKNOWN_TRANSITION",
      TEST_CITIZEN_ID,
      "CITIZEN",
      []
    );
    expect(transition).toEqual({ success: false, error: "TRANSITION_NOT_FOUND" });
  });

  it("rejects transition calls from invalid source state", async () => {
    const arn = await createDraftApplication();
    createdArns.add(arn);
    await transitionToClerkInbox(arn);

    const invalidSubmit = await executeTransition(arn, "SUBMIT", TEST_CITIZEN_ID, "CITIZEN", []);
    expect(invalidSubmit).toEqual({ success: false, error: "INVALID_STATE" });
  });

  it("enforces allowed system roles for officer transitions", async () => {
    const arn = await createDraftApplication();
    createdArns.add(arn);
    await transitionToClerkInbox(arn);

    const unauthorizedForward = await executeTransition(
      arn,
      "CLERK_FORWARD",
      "test-officer-2",
      "OFFICER",
      ["SENIOR_ASSISTANT"],
      "Attempted forward without clerk role"
    );
    expect(unauthorizedForward).toEqual({ success: false, error: "UNAUTHORIZED_ROLE" });
  });

  it("creates next task and completes assigned current task on clerk forward", async () => {
    const arn = await createDraftApplication();
    createdArns.add(arn);
    await transitionToClerkInbox(arn);

    await query(
      `UPDATE task
       SET assignee_user_id = $1, status = 'IN_PROGRESS', started_at = NOW()
       WHERE arn = $2 AND state_id = 'PENDING_AT_CLERK' AND status = 'PENDING'`,
      [TEST_CLERK_ID, arn]
    );

    const forward = await executeTransition(
      arn,
      "CLERK_FORWARD",
      TEST_CLERK_ID,
      "OFFICER",
      ["CLERK"],
      "Forwarding after scrutiny",
      { decision: "FORWARD" }
    );
    expect(forward).toEqual(
      expect.objectContaining({
        success: true,
        newStateId: "PENDING_AT_SR_ASSISTANT_ACCOUNTS",
      })
    );

    const oldTask = await query(
      `SELECT status, decision, assignee_user_id
       FROM task
       WHERE arn = $1 AND state_id = 'PENDING_AT_CLERK'
       ORDER BY created_at DESC
       LIMIT 1`,
      [arn]
    );
    expect(oldTask.rows).toHaveLength(1);
    expect(oldTask.rows[0].status).toBe("COMPLETED");
    expect(oldTask.rows[0].decision).toBe("FORWARD");
    expect(oldTask.rows[0].assignee_user_id).toBe(TEST_CLERK_ID);

    const nextTask = await query(
      `SELECT state_id, system_role_id, status
       FROM task
       WHERE arn = $1
         AND state_id = 'PENDING_AT_SR_ASSISTANT_ACCOUNTS'
       ORDER BY created_at DESC
       LIMIT 1`,
      [arn]
    );
    expect(nextTask.rows).toHaveLength(1);
    expect(nextTask.rows[0]).toEqual(
      expect.objectContaining({
        state_id: "PENDING_AT_SR_ASSISTANT_ACCOUNTS",
        system_role_id: "SENIOR_ASSISTANT",
        status: "PENDING",
      })
    );
  });

  it("creates query artifacts and pauses SLA on clerk query transition", async () => {
    const arn = await createDraftApplication();
    createdArns.add(arn);
    await transitionToClerkInbox(arn);

    await query(
      `UPDATE task
       SET assignee_user_id = $1, status = 'IN_PROGRESS', started_at = NOW()
       WHERE arn = $2 AND state_id = 'PENDING_AT_CLERK' AND status = 'PENDING'`,
      [TEST_CLERK_ID, arn]
    );

    const queryTransition = await executeTransition(
      arn,
      "CLERK_QUERY",
      TEST_CLERK_ID,
      "OFFICER",
      ["CLERK"],
      "Need additional clarifications",
      {
        decision: "QUERY",
        queryMessage: "Please upload updated property proof and clarify ownership.",
        unlockedFields: ["property.upn"],
        unlockedDocuments: ["DOC_PAYMENT_RECEIPT"],
      }
    );
    expect(queryTransition).toEqual(
      expect.objectContaining({
        success: true,
        newStateId: "QUERY_PENDING",
      })
    );

    const queryRows = await query(
      `SELECT message, status, unlocked_field_keys, unlocked_doc_type_ids, raised_by_user_id, raised_by_role
       FROM query
       WHERE arn = $1
       ORDER BY raised_at DESC
       LIMIT 1`,
      [arn]
    );
    expect(queryRows.rows).toHaveLength(1);
    expect(queryRows.rows[0]).toEqual(
      expect.objectContaining({
        status: "PENDING",
        message: "Please upload updated property proof and clarify ownership.",
        raised_by_user_id: TEST_CLERK_ID,
        raised_by_role: "CLERK",
      })
    );
    expect(queryRows.rows[0].unlocked_field_keys).toEqual(["property.upn"]);
    expect(queryRows.rows[0].unlocked_doc_type_ids).toEqual(["DOC_PAYMENT_RECEIPT"]);

    const appState = await query(
      `SELECT state_id, query_count, sla_paused_at
       FROM application
       WHERE arn = $1`,
      [arn]
    );
    expect(appState.rows).toHaveLength(1);
    expect(appState.rows[0].state_id).toBe("QUERY_PENDING");
    expect(Number(appState.rows[0].query_count)).toBe(1);
    expect(appState.rows[0].sla_paused_at).toBeTruthy();

    const noticeRows = await query(
      `SELECT notice_type, query_id, issued_by_user_id
       FROM notice_letter
       WHERE arn = $1 AND notice_type = 'QUERY'
       ORDER BY created_at DESC
       LIMIT 1`,
      [arn]
    );
    expect(noticeRows.rows).toHaveLength(1);
    expect(noticeRows.rows[0].issued_by_user_id).toBe(TEST_CLERK_ID);
    expect(noticeRows.rows[0].query_id).toBeTruthy();
  });
});
