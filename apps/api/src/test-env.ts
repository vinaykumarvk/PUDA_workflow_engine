import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { beforeAll } from "vitest";

/**
 * Test runtime env preflight.
 *
 * Goal: keep DB-backed suites deterministic and avoid silent skips due to local `.env` drift.
 *
 * Effective precedence:
 * 1) `DATABASE_URL` from shell/CI
 * 2) `DATABASE_URL_TEST` from shell/CI
 * 3) `DATABASE_URL_TEST` from repo `.env`
 * 4) `DATABASE_URL` from repo `.env`
 * 5) fallback: local docker-compose default (5433)
 */
const explicitDatabaseUrl = process.env.DATABASE_URL;
const explicitDatabaseUrlTest = process.env.DATABASE_URL_TEST;

let fileEnv: Record<string, string> = {};
try {
  const rootEnvPath = path.resolve(__dirname, "..", "..", "..", ".env");
  const raw = fs.readFileSync(rootEnvPath, "utf-8");
  fileEnv = dotenv.parse(raw);
} catch {
  // .env is optional for tests; fall through to explicit env or default.
}

process.env.DATABASE_URL =
  explicitDatabaseUrl ||
  explicitDatabaseUrlTest ||
  fileEnv.DATABASE_URL_TEST ||
  fileEnv.DATABASE_URL ||
  "postgres://puda:puda@localhost:5433/puda";

if (!process.env.ALLOWED_ORIGINS) {
  process.env.ALLOWED_ORIGINS = "http://localhost:5173";
}

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "test-secret";
}

beforeAll(async () => {
  try {
    const { seedCompleteApplicantProfilesForTests } = await import("./test-profile-fixtures");
    await seedCompleteApplicantProfilesForTests();
  } catch (error) {
    // Keep non-DB/unit suites runnable even when DB is unavailable locally.
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.warn(`[TEST_PROFILE_FIXTURE] Applicant profile seed skipped: ${message}`);
  }
});
