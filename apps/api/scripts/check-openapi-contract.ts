import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { buildApp } from "../src/app";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonObject = Record<string, JsonValue>;

const BASELINE_PATH = path.resolve(__dirname, "..", "openapi.baseline.json");
const COMPARE_REF = process.env.OPENAPI_COMPARE_REF?.trim() || "";
const API_PATH_PREFIX = "/api/v1/";
const MIN_COVERAGE_DEFAULT = Number.parseFloat(process.env.OPENAPI_CONTRACT_MIN_COVERAGE || "0.95");
const MIN_OPERATION_ID_COVERAGE = Number.parseFloat(
  process.env.OPENAPI_MIN_OPERATION_ID_COVERAGE || String(MIN_COVERAGE_DEFAULT)
);
const MIN_TAG_COVERAGE = Number.parseFloat(
  process.env.OPENAPI_MIN_TAG_COVERAGE || String(MIN_COVERAGE_DEFAULT)
);
const MIN_ERROR_RESPONSE_COVERAGE = Number.parseFloat(
  process.env.OPENAPI_MIN_ERROR_RESPONSE_COVERAGE || String(MIN_COVERAGE_DEFAULT)
);
const MIN_SUCCESS_SCHEMA_COVERAGE = Number.parseFloat(
  process.env.OPENAPI_MIN_SUCCESS_SCHEMA_COVERAGE || String(MIN_COVERAGE_DEFAULT)
);
const MIN_SECURITY_COVERAGE = Number.parseFloat(
  process.env.OPENAPI_MIN_SECURITY_COVERAGE || String(MIN_COVERAGE_DEFAULT)
);

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head", "trace"] as const;
const PUBLIC_ROUTE_EXACT_PATHS = new Set([
  "/health",
  "/ready",
  "/metrics",
  "/docs",
  "/api/v1/openapi.json",
  "/api/v1/auth/login",
  "/api/v1/auth/register",
  "/api/v1/auth/aadhar/send-otp",
  "/api/v1/auth/aadhar/verify-otp",
  "/api/v1/auth/forgot-password",
  "/api/v1/auth/reset-password",
  "/api/v1/payments/callback",
]);
const PUBLIC_ROUTE_PREFIXES = ["/docs/", "/api/v1/config/"];

type OperationEntry = {
  path: string;
  method: string;
  operation: JsonObject;
  key: string;
};

type CompletenessMetrics = {
  totalOperations: number;
  protectedOperations: number;
  withSecurity: number;
  withOperationId: number;
  withTags: number;
  with4xxResponse: number;
  withJsonSuccessSchema: number;
};

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

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonObject;
}

function isRefObject(value: unknown): value is JsonObject {
  const node = asObject(value);
  return Boolean(node && typeof node.$ref === "string");
}

async function buildSpec(): Promise<JsonObject> {
  process.env.NODE_ENV = "test";
  process.env.VITEST = "true";
  if (!process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS = "http://localhost:5173";
  }

  const app = await buildApp(false);
  try {
    await app.ready();
    return sortJson(app.swagger()) as JsonObject;
  } finally {
    await app.close();
  }
}

async function readJsonFile(filePath: string): Promise<JsonObject> {
  const raw = await fs.readFile(filePath, "utf-8");
  return sortJson(JSON.parse(raw)) as JsonObject;
}

async function readBaseline(compareRef: string): Promise<{ spec: JsonObject; source: string }> {
  if (!compareRef) {
    return { spec: await readJsonFile(BASELINE_PATH), source: BASELINE_PATH };
  }

  const gitPath = "apps/api/openapi.baseline.json";
  try {
    const content = execSync(`git show ${compareRef}:${gitPath}`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return {
      spec: sortJson(JSON.parse(content)) as JsonObject,
      source: `${compareRef}:${gitPath}`,
    };
  } catch (error) {
    const fallback = await readJsonFile(BASELINE_PATH);
    console.warn(
      `[OPENAPI_CONTRACT_WARN] Unable to load ${compareRef}:${gitPath}; falling back to local baseline. ${error instanceof Error ? error.message : String(error)}`
    );
    return { spec: fallback, source: `${BASELINE_PATH} (fallback)` };
  }
}

function collectOperations(spec: JsonObject): OperationEntry[] {
  const pathsNode = asObject(spec.paths);
  if (!pathsNode) return [];

  const operations: OperationEntry[] = [];
  for (const [routePath, pathItemRaw] of Object.entries(pathsNode)) {
    if (!routePath.startsWith(API_PATH_PREFIX)) continue;
    const pathItem = asObject(pathItemRaw);
    if (!pathItem) continue;
    for (const method of HTTP_METHODS) {
      const operationRaw = pathItem[method];
      const operation = asObject(operationRaw);
      if (!operation) continue;
      operations.push({
        path: routePath,
        method: method.toUpperCase(),
        operation,
        key: `${method.toUpperCase()} ${routePath}`,
      });
    }
  }
  return operations.sort((a, b) => a.key.localeCompare(b.key));
}

function responseCodes(operation: JsonObject): string[] {
  const responses = asObject(operation.responses);
  if (!responses) return [];
  return Object.keys(responses);
}

function hasSuccessResponse(operation: JsonObject): boolean {
  return responseCodes(operation).some((code) => /^2\d\d$/.test(code));
}

function has4xxResponse(operation: JsonObject): boolean {
  return responseCodes(operation).some((code) => /^4\d\d$/.test(code));
}

function hasJsonSuccessSchema(operation: JsonObject): boolean {
  const responses = asObject(operation.responses);
  if (!responses) return false;
  for (const [code, responseRaw] of Object.entries(responses)) {
    if (!/^2\d\d$/.test(code)) continue;
    if (isRefObject(responseRaw)) return true;
    const response = asObject(responseRaw);
    const content = asObject(response?.content);
    const jsonContent = asObject(content?.["application/json"]);
    if (jsonContent?.schema !== undefined) return true;
  }
  return false;
}

function isPublicRoutePath(routePath: string): boolean {
  if (PUBLIC_ROUTE_EXACT_PATHS.has(routePath)) return true;
  return PUBLIC_ROUTE_PREFIXES.some((prefix) => routePath.startsWith(prefix));
}

function hasOperationSecurity(operation: JsonObject): boolean {
  const security = operation.security;
  if (!Array.isArray(security) || security.length === 0) {
    return false;
  }
  return security.some((entry) => {
    const securityObj = asObject(entry);
    if (!securityObj) return false;
    return Object.keys(securityObj).includes("bearerAuth");
  });
}

function validateStructuralCompleteness(operations: OperationEntry[]): string[] {
  const failures: string[] = [];

  for (const entry of operations) {
    const { operation, key } = entry;
    const responses = asObject(operation.responses);
    if (!responses || Object.keys(responses).length === 0) {
      failures.push(`${key}: responses object is required`);
      continue;
    }

    if (!hasSuccessResponse(operation)) {
      failures.push(`${key}: at least one 2xx response is required`);
    }

    const parameters = operation.parameters;
    if (Array.isArray(parameters)) {
      for (const parameterRaw of parameters) {
        if (isRefObject(parameterRaw)) continue;
        const parameter = asObject(parameterRaw);
        const name = typeof parameter?.name === "string" ? parameter.name : "";
        const input = typeof parameter?.in === "string" ? parameter.in : "";
        if (!name || !input) {
          failures.push(`${key}: parameters must include name and in`);
          break;
        }
        if (parameter?.schema === undefined) {
          failures.push(`${key}: parameter ${input}:${name} missing schema`);
          break;
        }
        if (input === "path" && parameter.required !== true) {
          failures.push(`${key}: path parameter ${name} must be required=true`);
          break;
        }
      }
    }

    if (operation.requestBody !== undefined && !isRefObject(operation.requestBody)) {
      const requestBody = asObject(operation.requestBody);
      const content = asObject(requestBody?.content);
      if (!content || Object.keys(content).length === 0) {
        failures.push(`${key}: requestBody must define at least one content type`);
        continue;
      }
      const contentEntries = Object.entries(content);
      const hasSchema = contentEntries.some(([, mediaRaw]) => {
        if (isRefObject(mediaRaw)) return true;
        const media = asObject(mediaRaw);
        return media?.schema !== undefined;
      });
      if (!hasSchema) {
        failures.push(`${key}: requestBody content must include schema`);
      }
    }
  }

  return failures;
}

function collectMetrics(operations: OperationEntry[]): CompletenessMetrics {
  let protectedOperations = 0;
  let withSecurity = 0;
  let withOperationId = 0;
  let withTags = 0;
  let with4xxResponse = 0;
  let withJsonSuccessSchema = 0;

  for (const entry of operations) {
    if (!isPublicRoutePath(entry.path)) {
      protectedOperations += 1;
      if (hasOperationSecurity(entry.operation)) {
        withSecurity += 1;
      }
    }
    if (typeof entry.operation.operationId === "string" && entry.operation.operationId.trim()) {
      withOperationId += 1;
    }
    const tags = entry.operation.tags;
    if (Array.isArray(tags) && tags.length > 0 && tags.every((tag) => typeof tag === "string")) {
      withTags += 1;
    }
    if (has4xxResponse(entry.operation)) {
      with4xxResponse += 1;
    }
    if (hasJsonSuccessSchema(entry.operation)) {
      withJsonSuccessSchema += 1;
    }
  }

  return {
    totalOperations: operations.length,
    protectedOperations,
    withSecurity,
    withOperationId,
    withTags,
    with4xxResponse,
    withJsonSuccessSchema,
  };
}

function metricFailures(current: CompletenessMetrics, baseline: CompletenessMetrics): string[] {
  const failures: string[] = [];
  const metricKeys: Array<keyof Omit<CompletenessMetrics, "totalOperations" | "protectedOperations">> = [
    "withSecurity",
    "withOperationId",
    "withTags",
    "with4xxResponse",
    "withJsonSuccessSchema",
  ];
  for (const key of metricKeys) {
    if (current[key] < baseline[key]) {
      failures.push(
        `Completeness regression: ${key} dropped from ${baseline[key]} to ${current[key]}`
      );
    }
  }
  return failures;
}

function coverageRatio(value: number, total: number): number {
  if (total <= 0) return 1;
  return value / total;
}

function coverageFloorFailures(metrics: CompletenessMetrics): string[] {
  const failures: string[] = [];
  const checks = [
    {
      label: "protected operation security coverage",
      value: coverageRatio(metrics.withSecurity, metrics.protectedOperations),
      min: MIN_SECURITY_COVERAGE,
    },
    {
      label: "operationId coverage",
      value: coverageRatio(metrics.withOperationId, metrics.totalOperations),
      min: MIN_OPERATION_ID_COVERAGE,
    },
    {
      label: "tag coverage",
      value: coverageRatio(metrics.withTags, metrics.totalOperations),
      min: MIN_TAG_COVERAGE,
    },
    {
      label: "4xx response coverage",
      value: coverageRatio(metrics.with4xxResponse, metrics.totalOperations),
      min: MIN_ERROR_RESPONSE_COVERAGE,
    },
    {
      label: "JSON success schema coverage",
      value: coverageRatio(metrics.withJsonSuccessSchema, metrics.totalOperations),
      min: MIN_SUCCESS_SCHEMA_COVERAGE,
    },
  ];
  for (const check of checks) {
    if (check.value < check.min) {
      failures.push(
        `Coverage floor unmet: ${check.label} ${(check.value * 100).toFixed(1)}% < ${(check.min * 100).toFixed(1)}%`
      );
    }
  }
  return failures;
}

function requiredParameterMap(operation: JsonObject): Map<string, boolean> {
  const required = new Map<string, boolean>();
  const parameters = operation.parameters;
  if (!Array.isArray(parameters)) return required;

  for (const parameterRaw of parameters) {
    if (isRefObject(parameterRaw)) continue;
    const parameter = asObject(parameterRaw);
    const name = typeof parameter?.name === "string" ? parameter.name : "";
    const input = typeof parameter?.in === "string" ? parameter.in : "";
    if (!name || !input) continue;
    required.set(`${input}:${name}`, parameter.required === true);
  }
  return required;
}

function requestBodyRequired(operation: JsonObject): boolean {
  if (operation.requestBody === undefined) return false;
  if (isRefObject(operation.requestBody)) return false;
  const requestBody = asObject(operation.requestBody);
  return requestBody?.required === true;
}

function successCodes(operation: JsonObject): Set<string> {
  return new Set(responseCodes(operation).filter((code) => /^2\d\d$/.test(code)));
}

function compareCompatibility(
  baselineOperations: OperationEntry[],
  currentOperations: OperationEntry[]
): string[] {
  const failures: string[] = [];
  const baselineByKey = new Map(baselineOperations.map((entry) => [entry.key, entry]));
  const currentByKey = new Map(currentOperations.map((entry) => [entry.key, entry]));

  for (const [key, baselineEntry] of baselineByKey.entries()) {
    const currentEntry = currentByKey.get(key);
    if (!currentEntry) {
      failures.push(`Breaking change: removed endpoint ${key}`);
      continue;
    }

    const baselineParams = requiredParameterMap(baselineEntry.operation);
    const currentParams = requiredParameterMap(currentEntry.operation);

    for (const [paramKey, baselineRequired] of baselineParams.entries()) {
      if (!currentParams.has(paramKey)) {
        failures.push(`Breaking change: removed parameter ${paramKey} from ${key}`);
        continue;
      }
      const currentRequired = currentParams.get(paramKey) === true;
      if (!baselineRequired && currentRequired) {
        failures.push(`Breaking change: parameter ${paramKey} became required in ${key}`);
      }
    }

    for (const [paramKey, currentRequired] of currentParams.entries()) {
      if (!baselineParams.has(paramKey) && currentRequired) {
        failures.push(`Breaking change: new required parameter ${paramKey} added to ${key}`);
      }
    }

    const baselineBodyRequired = requestBodyRequired(baselineEntry.operation);
    const currentBodyRequired = requestBodyRequired(currentEntry.operation);
    if (!baselineBodyRequired && currentBodyRequired) {
      failures.push(`Breaking change: requestBody became required for ${key}`);
    }

    const baselineSuccess = successCodes(baselineEntry.operation);
    const currentSuccess = successCodes(currentEntry.operation);
    for (const code of baselineSuccess) {
      if (!currentSuccess.has(code)) {
        failures.push(`Breaking change: success response ${code} removed from ${key}`);
      }
    }
  }

  return failures;
}

function printMetrics(prefix: string, metrics: CompletenessMetrics): void {
  const ratio = (value: number, total: number) =>
    total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "0.0%";
  console.log(
    `${prefix} total=${metrics.totalOperations}` +
      ` protected=${metrics.protectedOperations}` +
      ` security=${metrics.withSecurity} (${ratio(metrics.withSecurity, metrics.protectedOperations)})` +
      ` operationId=${metrics.withOperationId} (${ratio(metrics.withOperationId, metrics.totalOperations)})` +
      ` tags=${metrics.withTags} (${ratio(metrics.withTags, metrics.totalOperations)})` +
      ` errorResponses=${metrics.with4xxResponse} (${ratio(metrics.with4xxResponse, metrics.totalOperations)})` +
      ` jsonSuccessSchema=${metrics.withJsonSuccessSchema} (${ratio(metrics.withJsonSuccessSchema, metrics.totalOperations)})`
  );
}

async function main() {
  const [currentSpec, baselineLoaded] = await Promise.all([
    buildSpec(),
    readBaseline(COMPARE_REF),
  ]);
  const baselineSpec = baselineLoaded.spec;

  const currentOperations = collectOperations(currentSpec);
  const baselineOperations = collectOperations(baselineSpec);
  if (currentOperations.length === 0) {
    throw new Error("No /api/v1 operations found in generated OpenAPI spec.");
  }

  const structureFailures = validateStructuralCompleteness(currentOperations);
  const compatibilityFailures = compareCompatibility(baselineOperations, currentOperations);
  const currentMetrics = collectMetrics(currentOperations);
  const baselineMetrics = collectMetrics(baselineOperations);
  const regressionFailures = metricFailures(currentMetrics, baselineMetrics);
  const thresholdFailures = coverageFloorFailures(currentMetrics);

  printMetrics("[OPENAPI_CONTRACT_CURRENT]", currentMetrics);
  printMetrics(`[OPENAPI_CONTRACT_BASELINE:${baselineLoaded.source}]`, baselineMetrics);

  const failures = [
    ...structureFailures,
    ...compatibilityFailures,
    ...regressionFailures,
    ...thresholdFailures,
  ];
  if (failures.length > 0) {
    console.error("[OPENAPI_CONTRACT_FAILED]");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`[OPENAPI_CONTRACT_OK] ${currentOperations.length} operation(s) validated.`);
}

main().catch((error) => {
  console.error(
    `[OPENAPI_CONTRACT_ERROR] ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
