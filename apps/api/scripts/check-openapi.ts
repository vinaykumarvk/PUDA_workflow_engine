import { promises as fs } from "node:fs";
import path from "node:path";
import { buildApp } from "../src/app";

const BASELINE_PATH = path.resolve(__dirname, "..", "openapi.baseline.json");
const UPDATE_MODE = process.argv.includes("--update");

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

function sortJson(value: unknown): JsonValue {
  if (value === null || typeof value !== "object") {
    return value as JsonValue;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sortJson(entry));
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => [key, sortJson(entry)] as const);
  return Object.fromEntries(entries);
}

function collectEndpoints(spec: JsonValue): string[] {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return [];
  const paths = (spec as Record<string, unknown>).paths;
  if (!paths || typeof paths !== "object" || Array.isArray(paths)) return [];
  const endpoints: string[] = [];
  for (const [routePath, routeConfig] of Object.entries(paths as Record<string, unknown>)) {
    if (!routeConfig || typeof routeConfig !== "object" || Array.isArray(routeConfig)) continue;
    for (const method of Object.keys(routeConfig)) {
      endpoints.push(`${method.toUpperCase()} ${routePath}`);
    }
  }
  return endpoints.sort((a, b) => a.localeCompare(b));
}

function diffEndpoints(current: string[], baseline: string[]) {
  const currentSet = new Set(current);
  const baselineSet = new Set(baseline);
  const added = current.filter((endpoint) => !baselineSet.has(endpoint));
  const removed = baseline.filter((endpoint) => !currentSet.has(endpoint));
  return { added, removed };
}

async function buildSpec(): Promise<JsonValue> {
  process.env.NODE_ENV = "test";
  process.env.VITEST = "true";
  if (!process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS = "http://localhost:5173";
  }

  const app = await buildApp(false);
  try {
    await app.ready();
    const spec = app.swagger();
    return sortJson(spec);
  } finally {
    await app.close();
  }
}

async function readBaseline(): Promise<JsonValue> {
  const raw = await fs.readFile(BASELINE_PATH, "utf-8");
  return JSON.parse(raw) as JsonValue;
}

async function writeBaseline(spec: JsonValue): Promise<void> {
  await fs.writeFile(BASELINE_PATH, `${JSON.stringify(spec, null, 2)}\n`, "utf-8");
}

async function main() {
  const currentSpec = await buildSpec();
  if (UPDATE_MODE) {
    await writeBaseline(currentSpec);
    const endpoints = collectEndpoints(currentSpec);
    console.log(`[OPENAPI_UPDATED] ${endpoints.length} endpoint(s) written to baseline`);
    return;
  }

  const baselineSpec = await readBaseline();
  const currentSerialized = JSON.stringify(currentSpec);
  const baselineSerialized = JSON.stringify(sortJson(baselineSpec));
  if (currentSerialized === baselineSerialized) {
    const endpoints = collectEndpoints(currentSpec);
    console.log(`[OPENAPI_OK] ${endpoints.length} endpoint(s) match baseline`);
    return;
  }

  const currentEndpoints = collectEndpoints(currentSpec);
  const baselineEndpoints = collectEndpoints(sortJson(baselineSpec));
  const { added, removed } = diffEndpoints(currentEndpoints, baselineEndpoints);
  console.error("[OPENAPI_DRIFT] OpenAPI specification changed.");
  if (added.length > 0) {
    console.error(`Added endpoints (${added.length}):`);
    for (const endpoint of added) console.error(`+ ${endpoint}`);
  }
  if (removed.length > 0) {
    console.error(`Removed endpoints (${removed.length}):`);
    for (const endpoint of removed) console.error(`- ${endpoint}`);
  }
  console.error("Run: npm --workspace apps/api run check:openapi -- --update");
  process.exit(1);
}

main().catch((error) => {
  console.error(
    `[OPENAPI_CHECK_FAILED] ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
