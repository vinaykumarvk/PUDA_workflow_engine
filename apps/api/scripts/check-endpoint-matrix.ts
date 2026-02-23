import { promises as fs } from "fs";
import path from "path";

const SRC_ROOT = path.resolve(__dirname, "..", "src");
const BASELINE_PATH = path.resolve(__dirname, "..", "endpoint-matrix.baseline.json");
const UPDATE_MODE = process.argv.includes("--update");

type EndpointBaseline = {
  generatedAt: string;
  source: string;
  endpoints: string[];
};

const ROUTE_REGEX = /app\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;

async function collectTypeScriptFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return collectTypeScriptFiles(fullPath);
      }
      if (!entry.isFile()) return [];
      if (!entry.name.endsWith(".ts")) return [];
      if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".spec.ts")) return [];
      return [fullPath];
    })
  );
  return files.flat();
}

async function collectEndpoints(): Promise<string[]> {
  const files = await collectTypeScriptFiles(SRC_ROOT);
  const endpointSet = new Set<string>();

  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf-8");
    let match: RegExpExecArray | null;
    ROUTE_REGEX.lastIndex = 0;
    while ((match = ROUTE_REGEX.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const routePath = match[2].trim();
      endpointSet.add(`${method} ${routePath}`);
    }
  }

  return Array.from(endpointSet).sort((a, b) => a.localeCompare(b));
}

async function readBaseline(): Promise<EndpointBaseline> {
  const raw = await fs.readFile(BASELINE_PATH, "utf-8");
  const parsed = JSON.parse(raw) as EndpointBaseline;
  if (!Array.isArray(parsed.endpoints)) {
    throw new Error("Baseline file is invalid: endpoints[] is required");
  }
  return parsed;
}

async function writeBaseline(endpoints: string[]): Promise<void> {
  const baseline: EndpointBaseline = {
    generatedAt: new Date().toISOString(),
    source: "apps/api/scripts/check-endpoint-matrix.ts",
    endpoints,
  };
  await fs.writeFile(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, "utf-8");
}

function diffEndpoints(current: string[], baseline: string[]) {
  const baselineSet = new Set(baseline);
  const currentSet = new Set(current);
  const added = current.filter((ep) => !baselineSet.has(ep));
  const removed = baseline.filter((ep) => !currentSet.has(ep));
  return { added, removed };
}

async function main() {
  const current = await collectEndpoints();
  if (UPDATE_MODE) {
    await writeBaseline(current);
    console.log(`[ENDPOINT_MATRIX_UPDATED] ${current.length} endpoint(s) written to baseline`);
    return;
  }

  const baseline = await readBaseline();
  const { added, removed } = diffEndpoints(current, baseline.endpoints);
  if (added.length === 0 && removed.length === 0) {
    console.log(`[ENDPOINT_MATRIX_OK] ${current.length} endpoint(s) match baseline`);
    return;
  }

  console.error("[ENDPOINT_MATRIX_DRIFT] Endpoint inventory changed.");
  if (added.length > 0) {
    console.error(`Added endpoints (${added.length}):`);
    for (const endpoint of added) console.error(`+ ${endpoint}`);
  }
  if (removed.length > 0) {
    console.error(`Removed endpoints (${removed.length}):`);
    for (const endpoint of removed) console.error(`- ${endpoint}`);
  }
  console.error("Run: npm --workspace apps/api run check:endpoint-matrix -- --update");
  process.exit(1);
}

main().catch((error) => {
  console.error(
    `[ENDPOINT_MATRIX_CHECK_FAILED] ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
