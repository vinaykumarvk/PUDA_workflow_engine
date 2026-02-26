import { execSync } from "child_process";
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
  return execSync(
    `PGPASSWORD="${password}" psql -h ${host} -p ${port} -U ${user} -d ${database} -tAc "${sql.replace(/"/g, '\\"')}"`,
    { cwd, env: psqlEnv, encoding: "utf-8" }
  ).trim();
}

function psqlFile(filePath: string): void {
  execSync(
    `PGPASSWORD="${password}" psql -h ${host} -p ${port} -U ${user} -d ${database} -v ON_ERROR_STOP=1 -f ${filePath}`,
    { stdio: "inherit", cwd, env: psqlEnv }
  );
}

// Ensure schema_migrations tracking table exists
psql(`CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`);

// Get already-applied migrations
const appliedRaw = psql("SELECT filename FROM schema_migrations ORDER BY filename");
const applied = new Set(appliedRaw ? appliedRaw.split("\n") : []);

const migrationDir = path.resolve(__dirname, "..", "migrations");
const migrations = fs
  .readdirSync(migrationDir)
  .filter((entry) => /^[0-9]{3}_.+\.sql$/.test(entry))
  .sort((a, b) => a.localeCompare(b, "en"));

let ranCount = 0;

for (const migration of migrations) {
  if (applied.has(migration)) {
    continue;
  }

  console.log(`\nRunning ${migration}...`);
  try {
    psqlFile(`migrations/${migration}`);
    psql(`INSERT INTO schema_migrations (filename) VALUES ('${migration}')`);
    console.log(`  ${migration} completed`);
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
