import { spawnSync } from "child_process";
import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL not set in environment");
  process.exit(1);
}

console.log(`Running migrations against: ${DATABASE_URL.replace(/:[^:@]+@/, ":****@")}`);

const dbUrl = new URL(DATABASE_URL);
const host = dbUrl.hostname || "localhost";
const port = dbUrl.port || "5432";
const user = dbUrl.username || "puda";
const password = dbUrl.password || "puda";
const database = dbUrl.pathname.slice(1) || "puda";
const cwd = path.resolve(__dirname, "..");
const psqlEnv = { ...process.env, PGPASSWORD: password };

function psql(sql: string): string {
  const result = spawnSync(
    "psql",
    ["-h", host, "-p", port, "-U", user, "-d", database, "-tAc", sql],
    { cwd, env: psqlEnv, encoding: "utf-8" }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`psql failed (exit ${result.status}): ${(result.stderr || "").toString().trim()}`);
  }
  return (result.stdout || "").toString().trim();
}

function psqlFile(filePath: string): void {
  const result = spawnSync(
    "psql",
    ["-h", host, "-p", port, "-U", user, "-d", database, "-v", "ON_ERROR_STOP=1", "-f", filePath],
    { stdio: "inherit", cwd, env: psqlEnv }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`psql -f failed (exit ${result.status})`);
  }
}

function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

// Ensure schema_migrations tracking table exists (with checksum column)
psql(`CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  content_hash TEXT
)`);
// Ensure content_hash column exists for older installs
psql("ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS content_hash TEXT");

// Get already-applied migrations with their checksums
const appliedRaw = psql("SELECT filename || '|' || COALESCE(content_hash, '') FROM schema_migrations ORDER BY filename");
const appliedMap = new Map<string, string>();
if (appliedRaw) {
  for (const line of appliedRaw.split("\n")) {
    const sep = line.indexOf("|");
    const name = line.slice(0, sep);
    const hash = line.slice(sep + 1);
    appliedMap.set(name, hash);
  }
}

const migrationDir = path.resolve(__dirname, "..", "migrations");
const MIGRATION_FILENAME_RE = /^[0-9]{3}_[A-Za-z0-9_-]+\.sql$/;
const migrations = fs
  .readdirSync(migrationDir)
  .filter((entry) => MIGRATION_FILENAME_RE.test(entry))
  .sort((a, b) => a.localeCompare(b, "en"));

// Drift detection: warn if an already-applied migration file has changed on disk
let driftCount = 0;
for (const migration of migrations) {
  const storedHash = appliedMap.get(migration);
  if (storedHash === undefined) continue; // not yet applied
  if (!storedHash) continue; // no hash recorded (legacy row)

  const diskHash = hashFile(path.join(migrationDir, migration));
  if (diskHash !== storedHash) {
    console.warn(`  WARNING: ${migration} has changed since it was applied (expected ${storedHash.slice(0, 12)}…, got ${diskHash.slice(0, 12)}…)`);
    driftCount++;
  }
}
if (driftCount > 0) {
  console.warn(`\n⚠ ${driftCount} migration(s) have drifted from their applied versions. Review before proceeding.\n`);
}

let ranCount = 0;

for (const migration of migrations) {
  if (appliedMap.has(migration)) {
    continue;
  }

  console.log(`\nRunning ${migration}...`);
  try {
    const filePath = path.join(migrationDir, migration);
    psqlFile(`migrations/${migration}`);
    const contentHash = hashFile(filePath);
    const escapedMigration = migration.replace(/'/g, "''");
    psql(`INSERT INTO schema_migrations (filename, content_hash) VALUES ('${escapedMigration}', '${contentHash}')`);
    console.log(`  ${migration} completed (hash: ${contentHash.slice(0, 12)}…)`);
    ranCount++;
  } catch (error: any) {
    console.error(`  ${migration} failed:`, error.message);
    process.exit(1);
  }
}

if (ranCount === 0) {
  console.log("\nAll migrations already applied — nothing to do.");
} else {
  console.log(`\n${ranCount} migration(s) applied successfully!`);
}
