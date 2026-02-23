# Submission Validation Phase-In Plan

Date: 2026-02-21

## Policy Surface

Each service pack now declares:

```yaml
submissionValidation:
  propertyRequired: <true|false>
  enforcementMode: <warn|enforce>
```

These values are read from `service_version.config_jsonb.submissionValidation` at submit time.

## Current Rollout Decision

| Service Key | propertyRequired | enforcementMode | Reason |
| --- | --- | --- | --- |
| `no_due_certificate` | `true` | `enforce` | Stable payload shape; safe first service to hard-fail on invalid submit payloads. |
| `registration_of_architect` | `false` | `warn` | Legitimately no property section; keep warning-only while monitoring. |
| `sanction_of_water_supply` | `true` | `warn` | Keep non-blocking while monitoring real submit telemetry. |
| `sanction_of_sewerage_connection` | `true` | `warn` | Keep non-blocking while monitoring real submit telemetry. |

## Promotion Criteria (`warn` -> `enforce`)

Move a service to `enforce` when all are true:

1. 0 validation warnings in integration + BRD suite for 3 consecutive runs.
2. No recent production/staging submit warnings for that service.
3. Negative-path tests exist for at least one invalid submit body case.

## Promotion Steps

1. Change the service’s `service-packs/<service>/service.yaml` `submissionValidation.enforcementMode` to `enforce`.
2. Run seed to publish updated `config_jsonb`:
   - `DATABASE_URL=... npm --workspace apps/api run seed`
3. Re-run:
   - `npm --workspace apps/api run test -- src/submission.validation.integration.test.ts`
   - `DATABASE_URL=... npm --workspace apps/api run test -- src/api.test.ts src/brd-test-cases.test.ts`
