# DB-Backed Re-Run Checklist (Queued)

Date queued: 2026-02-21
Owner: API/AuthZ hardening track
Purpose: Re-run DB-dependent suites after profile strict-schema hardening.

## 1. Environment Readiness

- [x] Start/confirm Postgres availability (local instance)
- [x] Verify DB health: `psql ${DATABASE_URL_TEST:-postgres://puda:puda@localhost:5433/puda} -c 'select 1;'`
- [x] Verify app DB connectivity env is present:
  - [x] `DATABASE_URL`
  - [x] `DATABASE_URL_TEST`
  - [x] `JWT_SECRET`
  - [x] `ALLOWED_ORIGINS`
- [x] Run migrations: `DATABASE_URL=${DATABASE_URL_TEST:-postgres://puda:puda@localhost:5433/puda} npm --workspace apps/api run migrate`
- [x] Seed baseline data: `DATABASE_URL=${DATABASE_URL_TEST:-postgres://puda:puda@localhost:5433/puda} npm --workspace apps/api run seed`
  - Note: fixed FK-safe cleanup ordering in `apps/api/scripts/seed.ts` so seed is repeatable on non-empty DBs.
  - Note: if your local Postgres is on `5432`, set `DATABASE_URL_TEST=postgres://puda:puda@localhost:5432/puda`.

## 2. Build + Fast Unit Gate

- [x] TypeScript build: `npm --workspace apps/api run build`
- [x] Fast non-DB policy gate:
  - `DATABASE_URL=${DATABASE_URL_TEST:-postgres://puda:puda@localhost:5433/puda} npm --workspace apps/api run test -- src/policy.test.ts src/route-access.test.ts src/profile.read-schema.test.ts`

## 3. DB-Backed Authorization Re-Run

- [x] Run authz integration suite:
  - `DATABASE_URL=${DATABASE_URL_TEST:-postgres://puda:puda@localhost:5433/puda} npm --workspace apps/api run test -- src/authz.integration.test.ts`
- [x] Confirm suite is not skipped due DB:
  - observed: no `[AUTHZ-IT] Skipping DB-backed authz integration tests` log
- [x] Confirm cross-authority denial tests still pass for:
  - tasks inbox (`/api/v1/tasks/inbox`)
  - inspections queue (`/api/v1/inspections/my-queue`)
  - notification logs (`/api/v1/notification-logs/my-logs`, `/for-application/*`, `/stats/*`)
  - properties by-upn (`/api/v1/properties/by-upn`)
  - admin reads (`/api/v1/admin/users`, `/api/v1/admin/stats`)
  - observed: suite passed `112/112`.

## 4. DB-Backed OTP Re-Run

- [x] Run OTP hardening suite:
  - `DATABASE_URL=${DATABASE_URL_TEST:-postgres://puda:puda@localhost:5433/puda} npm --workspace apps/api run test -- src/auth.otp.test.ts`
- [x] Confirm suite is not skipped due DB:
  - observed: no `[AUTH-OTP-IT] Skipping DB-backed OTP tests` log
  - observed: suite passed `3/3`.

## 5. Full API Regression Slice (Optional but Recommended)

- [x] Run full API tests:
  - `DATABASE_URL=${DATABASE_URL_TEST:-postgres://puda:puda@localhost:5433/puda} npm --workspace apps/api run test`
- [x] Capture rerun result and shard parity.
  - result: passed (`220` tests), failed (`0` tests)
  - shard parity:
    - `test:authz`: `112/112`
    - `test:brd`: `21/21`
    - `test:rest`: `87/87`
  - note: prior `213/213` baseline is superseded after adding telemetry boundary coverage.

## 6. Closeout

- [x] Update `ENDPOINT_MATRIX_RECHECK_DELTA_2026-02-21.md` with final DB-backed test results.
- [x] If all green, mark profile strict-schema item closed in backlog.
- [x] If failures occur, open follow-up tasks with:
  - failing endpoint
  - error code/status
  - suspected layer (schema, route guard, data query, policy)
