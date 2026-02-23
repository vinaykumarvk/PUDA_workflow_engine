import dotenv from "dotenv";
import path from "path";
import { cleanupClientTelemetryEvents, getClientTelemetryRetentionDays } from "../src/telemetry-retention";
import { pool, query } from "../src/db";

dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const retentionDays = getClientTelemetryRetentionDays();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  if (dryRun) {
    const countResult = await query(
      `SELECT COUNT(*)::int AS count
       FROM audit_event
       WHERE event_type = 'CLIENT_CACHE_TELEMETRY'
         AND created_at < $1::timestamptz`,
      [cutoff]
    );
    const count = Number(countResult.rows[0]?.count || 0);
    console.log(
      `[CLIENT_TELEMETRY_CLEANUP_DRY_RUN] retentionDays=${retentionDays} cutoff=${cutoff} candidates=${count}`
    );
    return;
  }

  const result = await cleanupClientTelemetryEvents(retentionDays);
  console.log(
    `[CLIENT_TELEMETRY_CLEANUP_OK] retentionDays=${retentionDays} cutoff=${result.cutoff} deleted=${result.deletedCount}`
  );
}

main()
  .catch((error) => {
    console.error(
      `[CLIENT_TELEMETRY_CLEANUP_FAILED] ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
