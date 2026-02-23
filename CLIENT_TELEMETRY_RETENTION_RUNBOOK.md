# Client Telemetry Retention Runbook

## Purpose
Keep `audit_event` growth bounded for client cache telemetry (`event_type='CLIENT_CACHE_TELEMETRY'`).

## Retention Policy
- Default retention: `90` days
- Config:
  - `CLIENT_TELEMETRY_RETENTION_DAYS` (default `90`)
  - `CLIENT_TELEMETRY_RETENTION_INTERVAL_MS` (default `86400000`, daily)

## Runtime Job
The API starts a background retention job at boot (non-test runtimes) via:
- `apps/api/src/telemetry-retention.ts`
- boot hook in `apps/api/src/app.ts`

## Manual Run
Dry run:
```bash
npm --workspace apps/api run cleanup:client-telemetry -- --dry-run
```

Delete expired rows now:
```bash
npm --workspace apps/api run cleanup:client-telemetry
```

## Verification
Check old telemetry row count:
```sql
SELECT COUNT(*)::int AS old_rows
FROM audit_event
WHERE event_type = 'CLIENT_CACHE_TELEMETRY'
  AND created_at < NOW() - INTERVAL '90 days';
```

Inspect recent telemetry:
```sql
SELECT event_id, actor_type, actor_id, created_at
FROM audit_event
WHERE event_type = 'CLIENT_CACHE_TELEMETRY'
ORDER BY created_at DESC
LIMIT 20;
```

## Safety Notes
- Cleanup only touches `CLIENT_CACHE_TELEMETRY` events.
- If retention needs to be paused, set a very large `CLIENT_TELEMETRY_RETENTION_DAYS` temporarily.
