import { query } from "./db";
import { logError, logInfo } from "./logger";

const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function getClientTelemetryRetentionDays(): number {
  return parsePositiveInt(process.env.CLIENT_TELEMETRY_RETENTION_DAYS, DEFAULT_RETENTION_DAYS);
}

export function getClientTelemetryRetentionIntervalMs(): number {
  return parsePositiveInt(process.env.CLIENT_TELEMETRY_RETENTION_INTERVAL_MS, DEFAULT_INTERVAL_MS);
}

export async function cleanupClientTelemetryEvents(retentionDays = getClientTelemetryRetentionDays()): Promise<{
  deletedCount: number;
  cutoff: string;
}> {
  const safeRetentionDays = Number.isFinite(retentionDays) && retentionDays > 0
    ? Math.floor(retentionDays)
    : DEFAULT_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - safeRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  const result = await query(
    `DELETE FROM audit_event
     WHERE event_type = 'CLIENT_CACHE_TELEMETRY'
       AND created_at < $1::timestamptz`,
    [cutoff]
  );
  return { deletedCount: Number(result.rowCount || 0), cutoff };
}

export function startClientTelemetryRetentionJob(
  intervalMs = getClientTelemetryRetentionIntervalMs(),
  retentionDays = getClientTelemetryRetentionDays()
): NodeJS.Timeout {
  const effectiveIntervalMs = Math.max(60_000, intervalMs);

  const run = async () => {
    try {
      const result = await cleanupClientTelemetryEvents(retentionDays);
      logInfo("Client telemetry retention cleanup completed", {
        retentionDays,
        cutoff: result.cutoff,
        deletedCount: result.deletedCount
      });
    } catch (error) {
      logError("Client telemetry retention cleanup failed", {
        retentionDays,
        error
      });
    }
  };

  void run();
  const timer = setInterval(() => {
    void run();
  }, effectiveIntervalMs);
  timer.unref?.();
  return timer;
}
