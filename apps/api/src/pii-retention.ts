/**
 * ARC-032-033: PII Retention Framework
 *
 * Anonymizes disposed applications after the retention period (default 7 years).
 * Purges associated document blobs after retention + 30 days.
 */
import { query, getClient } from "./db";
import { getStorage } from "./storage";
import { logInfo, logError } from "./logger";

function getRetentionYears(): number {
  const parsed = Number.parseInt(process.env.PII_RETENTION_YEARS || "7", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
}

/**
 * Anonymize applications disposed more than PII_RETENTION_YEARS ago.
 * Replaces PII fields in data_jsonb and submission_snapshot_jsonb with [REDACTED].
 * Returns the count of anonymized rows.
 */
export async function anonymizeExpiredApplications(): Promise<{ anonymizedCount: number }> {
  const retentionYears = getRetentionYears();
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - retentionYears);

  const result = await query(
    `UPDATE application
     SET
       data_jsonb = '{"_redacted": true}'::jsonb,
       submission_snapshot_jsonb = NULL,
       anonymized_at = NOW()
     WHERE disposed_at IS NOT NULL
       AND disposed_at < $1
       AND anonymized_at IS NULL`,
    [cutoff.toISOString()]
  );

  const anonymizedCount = Number(result.rowCount || 0);
  if (anonymizedCount > 0) {
    logInfo("PII anonymization completed", {
      anonymizedCount,
      retentionYears,
      cutoff: cutoff.toISOString(),
    });
  }
  return { anonymizedCount };
}

/**
 * Purge document storage blobs for anonymized applications older than
 * retention period + 30 days. Deletes from both the document table and storage.
 * Returns the count of purged documents.
 */
export async function purgeOrphanDocuments(): Promise<{ purgedCount: number }> {
  const retentionYears = getRetentionYears();
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - retentionYears);
  cutoff.setDate(cutoff.getDate() - 30); // +30 day grace period

  // Find documents linked to anonymized applications past retention + 30d
  const docs = await query(
    `SELECT d.storage_key
     FROM document d
     JOIN application a ON a.arn = d.arn
     WHERE a.anonymized_at IS NOT NULL
       AND a.disposed_at < $1
       AND d.storage_key IS NOT NULL`,
    [cutoff.toISOString()]
  );

  const storage = getStorage();
  let purgedCount = 0;

  for (const row of docs.rows) {
    try {
      await storage.delete(row.storage_key);
      purgedCount++;
    } catch (err) {
      logError("Failed to purge document blob", {
        storageKey: row.storage_key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Remove the document rows after blob deletion
  if (docs.rows.length > 0) {
    await query(
      `DELETE FROM document d
       USING application a
       WHERE a.arn = d.arn
         AND a.anonymized_at IS NOT NULL
         AND a.disposed_at < $1`,
      [cutoff.toISOString()]
    );
  }

  if (purgedCount > 0) {
    logInfo("Orphan document purge completed", { purgedCount });
  }
  return { purgedCount };
}
