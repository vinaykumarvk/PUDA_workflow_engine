import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { logError, logInfo, logWarn } from "./logger";
import { recordDbQueryMetric, updateDbPoolMetric } from "./observability/metrics";

// Load .env for local dev; in Cloud Run, env vars are injected directly
dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });

const { Pool } = pg;
const isTestRuntime = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

// Require DATABASE_URL in non-test runtime — no hardcoded fallback outside tests
const connectionString = process.env.DATABASE_URL;
if (!connectionString && !isTestRuntime) {
  throw new Error("FATAL: DATABASE_URL environment variable must be set in non-test runtime");
}

/** Returns true when DATABASE_URL uses a Cloud SQL Unix socket path. */
function isUnixSocketConnection(url: string): boolean {
  return url.includes("/cloudsql/");
}

function resolveSslConfig():
  | { ssl: { rejectUnauthorized: true; ca: string } }
  | undefined {
  if (process.env.NODE_ENV !== "production") return undefined;

  // Unix socket connections (Cloud SQL Auth Proxy) are local — SSL is not needed.
  if (connectionString && isUnixSocketConnection(connectionString)) return undefined;

  if (process.env.DATABASE_SSL === "false") {
    throw new Error("FATAL: DATABASE_SSL=false is not allowed in production");
  }
  const inlineCa = process.env.DATABASE_SSL_CA?.replace(/\\n/g, "\n");
  const base64Ca = process.env.DATABASE_SSL_CA_BASE64;
  const caPath = process.env.DATABASE_SSL_CA_PATH;
  const ca =
    inlineCa ||
    (base64Ca ? Buffer.from(base64Ca, "base64").toString("utf8") : undefined) ||
    (caPath ? fs.readFileSync(caPath, "utf8") : undefined);
  if (!ca) {
    throw new Error(
      "FATAL: production database SSL requires DATABASE_SSL_CA, DATABASE_SSL_CA_BASE64, or DATABASE_SSL_CA_PATH"
    );
  }
  return { ssl: { rejectUnauthorized: true, ca } };
}

const resolvedConnectionString =
  connectionString || (isTestRuntime ? "postgres://puda:puda@localhost:5432/puda" : undefined);
if (!resolvedConnectionString) {
  throw new Error("FATAL: Unable to resolve DATABASE_URL");
}

function parsePositiveIntEnv(rawValue: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(rawValue || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const DB_POOL_MAX = parsePositiveIntEnv(process.env.DB_POOL_MAX, 8);
const DB_SLOW_QUERY_MS = parsePositiveIntEnv(process.env.DB_SLOW_QUERY_MS, 500);

export const pool = new Pool({
  connectionString: resolvedConnectionString,
  max: DB_POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ...resolveSslConfig(),
});

const LOG_QUERIES = process.env.LOG_QUERIES === "true" || process.env.NODE_ENV !== "production";

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    recordDbQueryMetric(text, duration / 1000, true);
    updateDbPoolMetric({
      totalClients: pool.totalCount,
      idleClients: pool.idleCount,
      waitingClients: pool.waitingCount,
    });
    // M2: Only log query text in non-production; in prod log a truncated summary
    if (LOG_QUERIES) {
      logInfo("Executed query", { text: text.slice(0, 120), duration, rows: res.rowCount });
    }
    if (duration > DB_SLOW_QUERY_MS) {
      logWarn("SLOW_QUERY", { text: text.slice(0, 120), durationMs: duration, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    const duration = Date.now() - start;
    recordDbQueryMetric(text, duration / 1000, false);
    updateDbPoolMetric({
      totalClients: pool.totalCount,
      idleClients: pool.idleCount,
      waitingClients: pool.waitingCount,
    });
    if (duration > DB_SLOW_QUERY_MS) {
      logWarn("SLOW_QUERY_ERROR", { text: text.slice(0, 120), durationMs: duration });
    }
    // In errors, log a truncated query (never full SQL with potential user data)
    logError("Query error", { text: text.slice(0, 120), error });
    throw error;
  }
}

export async function getClient() {
  return await pool.connect();
}
