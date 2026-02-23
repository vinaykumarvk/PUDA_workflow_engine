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

const migrationDir = path.resolve(__dirname, "..", "migrations");
const migrations = fs
  .readdirSync(migrationDir)
  .filter((entry) => /^[0-9]{3}_.+\.sql$/.test(entry))
  .sort((a, b) => a.localeCompare(b, "en"))
  .map((entry) => `migrations/${entry}`);

for (const migration of migrations) {
  console.log(`\nRunning ${migration}...`);
  try {
    // Use -h localhost to force TCP connection instead of Unix socket
    const dbUrl = new URL(DATABASE_URL);
    const host = dbUrl.hostname || "localhost";
    const port = dbUrl.port || "5432";
    const user = dbUrl.username || "puda";
    const password = dbUrl.password || "puda";
    const database = dbUrl.pathname.slice(1) || "puda";
    
    // Use PGPASSWORD environment variable and psql with explicit host/port
    const cmd = `PGPASSWORD="${password}" psql -h ${host} -p ${port} -U ${user} -d ${database} -f ${migration}`;
    execSync(cmd, { 
      stdio: "inherit",
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, PGPASSWORD: password }
    });
    console.log(`✅ ${migration} completed`);
  } catch (error: any) {
    console.error(`❌ ${migration} failed:`, error.message);
    process.exit(1);
  }
}

console.log("\n✅ All migrations completed successfully!");
