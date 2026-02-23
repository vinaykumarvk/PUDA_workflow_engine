# Runbook: DB Degradation / Pool Saturation

## Triggers
- Alert: `PudaApiDbPoolSaturation`
- Alert: `PudaApiHighLatencyP95`
- Metrics:
  - `puda_api_db_pool_waiting_clients` sustained above threshold
  - rising DB query duration

## Immediate Checks (first 5 minutes)
1. Confirm DB health:
   - API `/health`
   - DB `pg_isready`
2. Inspect pool metrics:
   - total vs idle vs waiting clients
3. Inspect top failing SQL operations:
   - query error logs grouped by operation (`SELECT/UPDATE/INSERT`)

## Diagnosis
1. Check database resource pressure:
   - CPU, memory, disk IOPS
   - active sessions and locks
2. Validate slow query suspects:
   - long-running transactions
   - lock contention on `application`, `task`, `payment` tables
3. Validate connection exhaustion:
   - app replica count vs DB max connections
4. Check downstream dependency effects:
   - gateway callback storms or retry loops

## Mitigation
1. If lock contention:
   - terminate clearly stuck sessions after impact review.
2. If connection pressure:
   - temporarily scale down API replicas or increase DB connection limit.
3. If slow query regression:
   - roll back to previous revision.
4. If infra-level degradation:
   - fail over or restart DB instance per platform SOP.

## Recovery Validation
1. `puda_api_db_pool_waiting_clients` returns near `0`.
2. p95 latency back under SLO for 15+ minutes.
3. No sustained increase in `puda_api_http_errors_total`.

## Follow-up Tasks
1. Add index/query optimization for observed slow paths.
2. Tune pool settings (`max`, timeout) with measured capacity tests.
3. Capture incident timeline and permanent corrective actions.
