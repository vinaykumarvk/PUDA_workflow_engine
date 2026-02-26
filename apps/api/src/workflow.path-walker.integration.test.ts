import path from "node:path";
import dotenv from "dotenv";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { query } from "./db";
import {
  loadAllWorkflows,
  buildHappyPath,
  buildRejectionPath,
  buildQueryLoopPath,
  walkPath,
  createDraftApp,
  cleanupApplicationTree,
  verifyFinalState,
  verifyAuditTrail,
  verifyDecisionExists,
  verifyNoticeLetter,
  verifyQueryArtifacts,
  verifyAllTasksCompleted,
} from "./workflow.test-helpers";

dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });

// ── Load all workflows at module scope (before tests run) ──────────────────────

const allWorkflows = loadAllWorkflows();

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe("Workflow Path Walker", () => {
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

  it("loaded all 30 service-pack workflows", () => {
    expect(allWorkflows.length).toBe(30);
  });

  for (const { serviceKey, workflow, officerChain } of allWorkflows) {
    describe(serviceKey, () => {
      // ── Happy path ─────────────────────────────────────────────────────
      it("happy path: DRAFT → APPROVED → CLOSED", async () => {
        const arn = await createDraftApp(serviceKey);
        createdArns.add(arn);

        const steps = buildHappyPath(officerChain);
        await walkPath(arn, steps);

        await verifyFinalState(arn, "CLOSED", "APPROVED");
        await verifyAuditTrail(arn, steps.length);
        await verifyDecisionExists(arn, "APPROVE");
        await verifyNoticeLetter(arn, "APPROVAL");
        await verifyAllTasksCompleted(arn);
      }, 30_000);

      // ── Rejection at each officer level ────────────────────────────────
      for (let i = 0; i < officerChain.length; i++) {
        const level = officerChain[i];
        it(`rejection at ${level.stateId} (${level.systemRoleId})`, async () => {
          const arn = await createDraftApp(serviceKey);
          createdArns.add(arn);

          const steps = buildRejectionPath(officerChain, i);
          await walkPath(arn, steps);

          await verifyFinalState(arn, "CLOSED", "REJECTED");
          await verifyAuditTrail(arn, steps.length);
          await verifyDecisionExists(arn, "REJECT");
          await verifyNoticeLetter(arn, "REJECTION");
        }, 30_000);
      }

      // ── Query loop at clerk level ──────────────────────────────────────
      if (officerChain[0]?.queryTransitionId) {
        const queryTimeout = 45_000 + (officerChain.length > 3 ? 15_000 : 0);
        it("query loop at clerk → respond → re-approve", async () => {
          const arn = await createDraftApp(serviceKey);
          createdArns.add(arn);

          const steps = buildQueryLoopPath(officerChain);
          expect(steps).not.toBeNull();
          await walkPath(arn, steps!);

          await verifyFinalState(arn, "CLOSED", "APPROVED");
          await verifyQueryArtifacts(arn);
          await verifyAuditTrail(arn, steps!.length);
          await verifyDecisionExists(arn, "APPROVE");
          await verifyAllTasksCompleted(arn);
        }, queryTimeout);
      }
    });
  }
});
