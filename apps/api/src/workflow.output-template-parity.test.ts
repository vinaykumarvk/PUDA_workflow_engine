import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { templateIdFromOutputAction } from "./outputs";

const servicePackRoot = path.resolve(__dirname, "..", "..", "..", "service-packs");
const ignoredEntries = new Set(["_shared", "README.md"]);

interface WorkflowTransitionLike {
  transitionId: string;
  fromStateId: string;
  toStateId: string;
  actions?: string[];
}

async function listServicePacks(): Promise<string[]> {
  const entries = await fs.readdir(servicePackRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !ignoredEntries.has(entry.name))
    .map((entry) => entry.name)
    .sort();
}

describe("Workflow output template parity", () => {
  it("every close transition resolves to an existing service-pack template file", async () => {
    const failures: string[] = [];
    const packs = await listServicePacks();

    for (const serviceKey of packs) {
      const workflowPath = path.join(servicePackRoot, serviceKey, "workflow.json");
      const workflowRaw = await fs.readFile(workflowPath, "utf-8");
      const workflow = JSON.parse(workflowRaw) as { transitions?: WorkflowTransitionLike[] };
      const transitions = Array.isArray(workflow.transitions) ? workflow.transitions : [];
      const closeTransitions = transitions.filter(
        (transition) =>
          (transition.fromStateId === "APPROVED" || transition.fromStateId === "REJECTED") &&
          transition.toStateId === "CLOSED"
      );

      if (closeTransitions.length === 0) {
        failures.push(`${serviceKey}: no APPROVED/REJECTED -> CLOSED transitions in workflow`);
        continue;
      }

      for (const transition of closeTransitions) {
        const outputActions = (transition.actions || []).filter((action) =>
          action.startsWith("GENERATE_OUTPUT_")
        );
        if (outputActions.length === 0) {
          failures.push(
            `${serviceKey}/${transition.transitionId}: missing GENERATE_OUTPUT_* action`
          );
          continue;
        }

        for (const outputAction of outputActions) {
          const templateId = templateIdFromOutputAction(outputAction);
          if (!templateId) {
            failures.push(
              `${serviceKey}/${transition.transitionId}: could not derive template id from ${outputAction}`
            );
            continue;
          }

          const templatePath = path.join(
            servicePackRoot,
            serviceKey,
            "templates",
            `${templateId}.html`
          );
          try {
            await fs.access(templatePath);
          } catch {
            failures.push(
              `${serviceKey}/${transition.transitionId}: missing template file templates/${templateId}.html`
            );
          }
        }
      }
    }

    if (failures.length > 0) {
      expect.fail(`Output template parity failures:\n${failures.map((f) => `  ${f}`).join("\n")}`);
    }
  });
});
