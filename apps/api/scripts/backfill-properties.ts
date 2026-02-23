/**
 * Backfill script: populate the property + application_property tables
 * from existing application.data_jsonb.
 *
 * Safe to run multiple times (idempotent via upsert).
 *
 * Usage: npx tsx scripts/backfill-properties.ts
 */
import { query } from "../src/db";
import { upsertPropertyFromApplication } from "../src/properties";

async function main() {
  console.log("[BACKFILL] Starting property backfill...");

  const result = await query(
    `SELECT arn, authority_id, data_jsonb->'property' AS prop
     FROM application
     WHERE data_jsonb->'property' IS NOT NULL
       AND data_jsonb->'property' != 'null'::jsonb
       AND jsonb_typeof(data_jsonb->'property') = 'object'
     ORDER BY created_at ASC`
  );

  console.log(`[BACKFILL] Found ${result.rows.length} applications with property data.`);

  let success = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of result.rows) {
    const { arn, authority_id, prop } = row;

    if (!prop || Object.keys(prop).length === 0) {
      skipped++;
      continue;
    }

    try {
      const propertyId = await upsertPropertyFromApplication(arn, authority_id, prop);
      console.log(`  ✓ ${arn} → property ${propertyId} (UPN: ${prop.upn || prop.uniquePropertyNumber || "N/A"})`);
      success++;
    } catch (err: any) {
      console.error(`  ✗ ${arn}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n[BACKFILL] Done. Success: ${success}, Skipped: ${skipped}, Errors: ${errors}`);
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[BACKFILL] Fatal:", err);
  process.exit(1);
});
