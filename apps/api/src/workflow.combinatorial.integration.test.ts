import path from "node:path";
import dotenv from "dotenv";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { query } from "./db";
import {
  type OfficerLevel,
  type PathStep,
  type ParsedWorkflow,
  loadAllWorkflows,
  buildSubmitSteps,
  buildOfficerForwardStep,
  buildApprovalTail,
  buildRejectionTail,
  buildQuerySteps,
  walkPath,
  createDraftApp,
  cleanupApplicationTree,
  verifyFinalState,
  verifyAuditTrail,
  verifyDecisionExists,
  verifyNoticeLetter,
  verifyAllTasksCompleted,
  verifyQueryCount,
  verifyQueryNoticeCount,
} from "./workflow.test-helpers";

dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });

// ── Path Enumeration Types ─────────────────────────────────────────────────────

interface Decision {
  type: "FORWARD" | "APPROVE" | "REJECT" | "QUERY";
  levelIndex: number;
}

interface EnumeratedPath {
  decisions: Decision[];
  expectedOutcome: "APPROVED" | "REJECTED";
  queryCount: number;
  label: string;
}

// ── Path Enumerator ────────────────────────────────────────────────────────────

/**
 * Enumerate all unique decision paths through the officer chain, bounded by
 * a maximum number of query loops. Each TASK state can FORWARD/APPROVE,
 * REJECT (terminal), or QUERY (resets to level 0 with decremented budget).
 */
function enumerateAllPaths(chain: OfficerLevel[], maxQueries: number): EnumeratedPath[] {
  const results: EnumeratedPath[] = [];

  function recurse(levelIndex: number, queriesUsed: number, acc: Decision[]): void {
    const level = chain[levelIndex];
    const isLast = levelIndex === chain.length - 1;

    // Branch 1: FORWARD (non-last) or APPROVE (last)
    if (isLast) {
      const decisions = [...acc, { type: "APPROVE" as const, levelIndex }];
      results.push({
        decisions,
        expectedOutcome: "APPROVED",
        queryCount: queriesUsed,
        label: buildLabel(decisions, chain),
      });
    } else {
      recurse(levelIndex + 1, queriesUsed, [
        ...acc,
        { type: "FORWARD" as const, levelIndex },
      ]);
    }

    // Branch 2: REJECT (terminal)
    {
      const decisions = [...acc, { type: "REJECT" as const, levelIndex }];
      results.push({
        decisions,
        expectedOutcome: "REJECTED",
        queryCount: queriesUsed,
        label: buildLabel(decisions, chain),
      });
    }

    // Branch 3: QUERY (if budget allows and transition exists)
    if (queriesUsed < maxQueries && level.queryTransitionId) {
      recurse(0, queriesUsed + 1, [
        ...acc,
        { type: "QUERY" as const, levelIndex },
      ]);
    }
  }

  recurse(0, 0, []);
  return results;
}

// ── Label Generator ────────────────────────────────────────────────────────────

function buildLabel(decisions: Decision[], chain: OfficerLevel[]): string {
  return decisions
    .map((d) => {
      switch (d.type) {
        case "FORWARD":
          return "FWD";
        case "APPROVE":
          return "APPROVE";
        case "REJECT":
          return `REJECT@${chain[d.levelIndex].systemRoleId}`;
        case "QUERY":
          return `Q@${chain[d.levelIndex].systemRoleId}`;
      }
    })
    .join("→");
}

// ── Step Builder ───────────────────────────────────────────────────────────────

/**
 * Convert an enumerated decision sequence into executable PathStep[].
 */
function buildStepsFromDecisions(chain: OfficerLevel[], decisions: Decision[]): PathStep[] {
  const steps: PathStep[] = [...buildSubmitSteps()];

  for (const d of decisions) {
    const level = chain[d.levelIndex];

    switch (d.type) {
      case "FORWARD":
        steps.push(buildOfficerForwardStep(level, chain[d.levelIndex + 1].stateId));
        break;

      case "APPROVE":
        steps.push(...buildApprovalTail(level));
        break;

      case "REJECT":
        steps.push(...buildRejectionTail(level));
        break;

      case "QUERY":
        steps.push(...buildQuerySteps(level));
        break;
    }
  }

  return steps;
}

// ── Assertion Matrix ───────────────────────────────────────────────────────────

async function runAssertionMatrix(arn: string, path: EnumeratedPath, stepCount: number): Promise<void> {
  // Always: final state = CLOSED, disposal_type matches, disposed_at set, no dangling tasks
  await verifyFinalState(arn, "CLOSED", path.expectedOutcome);
  await verifyAllTasksCompleted(arn);
  await verifyAuditTrail(arn, stepCount);

  if (path.expectedOutcome === "APPROVED") {
    await verifyDecisionExists(arn, "APPROVE");
    await verifyNoticeLetter(arn, "APPROVAL");
  } else {
    await verifyDecisionExists(arn, "REJECT");
    await verifyNoticeLetter(arn, "REJECTION");
  }

  if (path.queryCount > 0) {
    await verifyQueryCount(arn, path.queryCount);
    await verifyQueryNoticeCount(arn, path.queryCount);
  }
}

// ── Timeout Calculator ─────────────────────────────────────────────────────────

function dynamicTimeout(queryCount: number, chainLength: number): number {
  return 30_000 + queryCount * 15_000 + (chainLength > 3 ? 15_000 : 0);
}

// ── Representative Services (one per tier, K=2) ────────────────────────────────

const REPRESENTATIVES = new Set([
  "demarcation_of_plot",           // T1: 2 officers → 21 paths
  "no_due_certificate",            // T2: 3 officers → 52 paths
  "conveyance_deed",               // T3: 4 officers → 105 paths
  "completion_certificate_above_1000", // T4: 5 officers → 186 paths
]);

/** Expected path counts for K=2, keyed by chain length */
const EXPECTED_COUNTS_K2: Record<number, number> = {
  2: 21,
  3: 52,
  4: 105,
  5: 186,
};

// ── Load Workflows ─────────────────────────────────────────────────────────────

const allWorkflows = loadAllWorkflows();
const representatives = allWorkflows.filter((w) => REPRESENTATIVES.has(w.serviceKey));
const nonRepresentatives = allWorkflows.filter((w) => !REPRESENTATIVES.has(w.serviceKey));

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe("Workflow Combinatorial Paths", () => {
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

  // ── Full combinatorial (representative services, K=2) ──────────────────────

  describe("Full combinatorial (representative services, K=2)", () => {
    for (const pw of representatives) {
      describe(pw.serviceKey, () => {
        const paths = enumerateAllPaths(pw.officerChain, 2);
        const chainLen = pw.officerChain.length;

        it(`generates ${EXPECTED_COUNTS_K2[chainLen] ?? "?"} paths for ${chainLen}-officer chain`, () => {
          const expected = EXPECTED_COUNTS_K2[chainLen];
          if (expected != null) {
            expect(paths.length).toBe(expected);
          }
          expect(paths.length).toBeGreaterThan(0);
        });

        for (const p of paths) {
          it(`${p.label} → ${p.expectedOutcome}`, async () => {
            const arn = await createDraftApp(pw.serviceKey);
            createdArns.add(arn);

            const steps = buildStepsFromDecisions(pw.officerChain, p.decisions);
            await walkPath(arn, steps);
            await runAssertionMatrix(arn, p, steps.length);
          }, dynamicTimeout(p.queryCount, chainLen));
        }
      });
    }
  });

  // ── Reduced matrix (all other services, K=0) ──────────────────────────────

  describe("Reduced matrix (all other services, K=0)", () => {
    for (const pw of nonRepresentatives) {
      describe(pw.serviceKey, () => {
        const paths = enumerateAllPaths(pw.officerChain, 0);
        const chainLen = pw.officerChain.length;

        it(`generates ${chainLen + 1} paths for ${chainLen}-officer chain (K=0)`, () => {
          expect(paths.length).toBe(chainLen + 1);
        });

        for (const p of paths) {
          it(`${p.label} → ${p.expectedOutcome}`, async () => {
            const arn = await createDraftApp(pw.serviceKey);
            createdArns.add(arn);

            const steps = buildStepsFromDecisions(pw.officerChain, p.decisions);
            await walkPath(arn, steps);
            await runAssertionMatrix(arn, p, steps.length);
          }, dynamicTimeout(p.queryCount, chainLen));
        }
      });
    }
  });
});
