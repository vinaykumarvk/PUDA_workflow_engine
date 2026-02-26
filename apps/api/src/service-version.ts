import { query } from "./db";

/**
 * Resolve the currently-active published version for a service key.
 *
 * Filters by effective_from/effective_to so that future-dated versions
 * are not prematurely activated and expired versions are excluded.
 *
 * Returns the version string (e.g. "1.0.0") or null if none is active.
 */
export async function resolveActiveVersion(
  serviceKey: string,
  client?: { query: (text: string, params?: any[]) => Promise<any> }
): Promise<string | null> {
  const q = client?.query ?? query;
  const result = await q(
    `SELECT version
     FROM service_version
     WHERE service_key = $1
       AND status = 'published'
       AND (effective_from IS NULL OR effective_from <= NOW())
       AND (effective_to   IS NULL OR effective_to   >  NOW())
     ORDER BY effective_from DESC NULLS LAST
     LIMIT 1`,
    [serviceKey]
  );
  return result.rows.length > 0 ? result.rows[0].version : null;
}
