# PUDA Workflow Engine — Architecture Review

**Date:** 2026-02-23
**Reviewer:** Principal Software Architect / Security Engineer
**Scope:** Full codebase — API, Citizen Portal, Officer Portal, Shared Packages, Infrastructure

---

## 1. System Map

### 1.1 Runtime Components

| Component | Tech | Port | Purpose |
|-----------|------|------|---------|
| **API Server** | Fastify 5 / Node 20 / TypeScript | 3001 (dev), 8080 (prod) | REST API, business logic, workflow engine |
| **Citizen Portal** | React 18 / Vite 6 SPA | 5173 (dev), 8080 (prod via nginx) | Citizen-facing application submission |
| **Officer Portal** | React 18 / Vite 6 SPA | 5174 (dev), 8080 (prod via nginx) | Officer task inbox, review, approval |
| **PostgreSQL 15** | Alpine | 5432 (container), 5433 (host) | Primary datastore |
| **Redis** (optional) | — | — | Distributed feature flag cache |
| **Nginx 1.27** | Alpine | 8080 | Static asset serving for SPAs |

### 1.2 Architecture Diagram

```
                          ┌──────────────────────────────────────────────┐
                          │              Google Cloud Run                │
                          │                                              │
  ┌─────────┐   HTTPS    │  ┌─────────────┐     ┌─────────────┐        │
  │ Citizen  │◄──────────►│  │ nginx:8080  │     │ nginx:8080  │        │
  │ Browser  │            │  │ (citizen)   │     │ (officer)   │        │
  └─────────┘             │  └──────┬──────┘     └──────┬──────┘        │
                          │         │static              │static        │
  ┌─────────┐   HTTPS    │  ┌──────┴──────┐     ┌──────┴──────┐        │
  │ Officer  │◄──────────►│  │ Vite Build  │     │ Vite Build  │        │
  │ Browser  │            │  │ dist/       │     │ dist/       │        │
  └─────────┘             │  └─────────────┘     └─────────────┘        │
                          │                                              │
                          │         ┌───────────────────┐               │
  ┌─────────────┐  POST   │         │  Fastify API :8080│               │
  │ Payment     │◄───────►│         │                   │               │
  │ Gateway     │ callback│         │  ┌──────────────┐ │               │
  │(Razorpay)   │         │         │  │ Middleware    │ │               │
  └─────────────┘         │         │  │ CORS→Rate    │ │               │
                          │         │  │ Limit→JWT    │ │               │
  ┌─────────────┐         │         │  │ Auth→RBAC    │ │               │
  │ Email/SMS   │◄────────│         │  └──────┬───────┘ │               │
  │ Transport   │         │         │         │         │               │
  └─────────────┘         │         │  ┌──────┴───────┐ │  ┌─────────┐ │
                          │         │  │ Domain Logic │ │  │ Postgres│ │
                          │         │  │ workflow.ts  │◄├─►│   15    │ │
                          │         │  │ payments.ts  │ │  │         │ │
                          │         │  │ applications │ │  └─────────┘ │
                          │         │  └──────────────┘ │               │
                          │         │                   │  ┌─────────┐ │
                          │         │  ┌──────────────┐ │  │ Local/  │ │
                          │         │  │ File Storage │◄├─►│ S3 Vol  │ │
                          │         │  └──────────────┘ │  └─────────┘ │
                          │         └───────────────────┘               │
                          └──────────────────────────────────────────────┘
```

### 1.3 Key Domains

| Domain | Files | Responsibility |
|--------|-------|----------------|
| **Auth & Identity** | `auth.ts`, `middleware/auth.ts`, `token-security.ts`, `mfa-stepup.ts` | JWT auth, Aadhaar OTP, MFA step-up, token revocation |
| **Workflow Engine** | `workflow.ts`, `tasks.ts`, `sla.ts`, `sla-checker.ts` | State machine transitions, task assignment, SLA tracking |
| **Applications** | `applications.ts`, `routes/application.routes.ts` | CRUD, search, export, query-response cycles |
| **Payments & Fees** | `payments.ts`, `fees.ts`, `routes/fee.routes.ts` | Fee assessment, demand management, gateway integration |
| **Documents** | `documents.ts`, `storage.ts`, `routes/document.routes.ts` | Upload, versioning, storage abstraction |
| **Notifications** | `notifications.ts`, `notification-log.ts`, `notices.ts` | Email/SMS dispatch, audit log |
| **Observability** | `observability/metrics.ts`, `observability/tracing.ts`, `logger.ts` | Prometheus, OpenTelemetry, structured JSON logs |
| **Service Packs** | `service-packs/`, `service-packs.ts`, `service-metadata.ts` | Declarative workflow/form/fee config per service type |
| **Shared UI** | `packages/shared/` | FormRenderer, UI components, Zod master model, constants |

### 1.4 Data Flow

```
Citizen submits → POST /applications → validate form vs service pack schema
  → INSERT application (DRAFT) → citizen uploads docs → PUT /applications/{arn}
  → POST /applications/{arn}/submit → workflow.executeTransition(DRAFT→SUBMITTED)
  → INSERT task (PENDING_AT_CLERK) → notify officer via email/SMS
  → Officer claims task → POST /tasks/{id}/action (FORWARD|QUERY|APPROVE|REJECT)
  → workflow.executeTransition → UPDATE application.state_id → INSERT audit_event
  → On APPROVE: generate PDF output → INSERT output → notify citizen
```

### 1.5 AuthN/AuthZ Flow

- **AuthN:** JWT Bearer tokens (24h expiry), Aadhaar OTP login, password login, token revocation denylist
- **AuthZ:** Role-based (CITIZEN, OFFICER, ADMIN) + posting-based authority scoping for officers
- **MFA:** Optional step-up for officer decisions (6-digit code, 5-min expiry)

### 1.6 Deployment Model

- **Target:** Google Cloud Run (asia-south1)
- **DB:** Cloud SQL PostgreSQL 15 with SSL
- **Secrets:** GCP Secret Manager (DATABASE_URL, JWT_SECRET)
- **CI/CD:** GitHub Actions → preflight checks → build → test → security scan → canary deploy
- **IaC:** Terraform for GCP baseline (APIs, service accounts, secrets)

### 1.7 Architectural Pattern

**Modular monolith** — single Fastify process with domain-organized modules. No microservices. Service packs provide declarative extensibility. Raw `pg` driver (no ORM).

---

## 2. Architecture Review Checklist

### A) Code Organization & Boundaries

**Current State:** Flat `src/` directory with ~54 source files. Domain modules (applications.ts, payments.ts, workflow.ts) sit alongside routes, middleware, and utilities. No explicit layering (controller/service/repository).

**Risks/Issues:**
1. **God file:** `apps/citizen/src/App.tsx` is 1,868 lines with 38+ useState hooks. Unmaintainable.
2. **No clear dependency direction:** Route handlers import domain logic directly; domain logic imports `db.ts` directly. No inversion of control.
3. **Flat structure:** All API source files in `src/` — no folders for domains (auth/, workflow/, payments/).
4. **Tight coupling:** `fees.ts` and `payments.ts` import each other (`updateDemandPayment`).
5. **Shared package is a barrel:** `packages/shared/src/index.ts` re-exports everything — tree shaking may fail.

**Recommendations:**
1. Reorganize API `src/` into domain folders: `src/auth/`, `src/workflow/`, `src/payments/`, `src/documents/`
2. Extract citizen `App.tsx` into route-level components using React Router
3. Introduce explicit service layer between routes and data access

**Verification:** `find apps/api/src -maxdepth 1 -name "*.ts" | wc -l` should decrease from ~54 to ~5 after reorganization.

---

### B) API Design & Contracts

**Current State:** RESTful API at `/api/v1/` with OpenAPI spec auto-generated by `@fastify/swagger`. Strict schema enforcement on mutations (line 420-464 of `app.ts`). Optimistic concurrency via `row_version`.

**Risks/Issues:**
1. **No API versioning strategy beyond `/v1/`** — no header-based versioning, no deprecation policy.
2. **Inconsistent error model:** Some errors return `{error: "CODE", message: "..."}`, others return `{error: "string"}`. No standard envelope.
3. **No idempotency keys** on POST endpoints (payments, applications). Retry after network timeout can create duplicates.
4. **No request timeout** configured on Fastify — long-running queries can block indefinitely.
5. **CSV export has no pagination** — `GET /applications/export` can return unbounded result sets.
6. **Missing content-type validation on responses** — JSON assumed everywhere.

**Recommendations:**
1. Add idempotency key header (`Idempotency-Key`) on all POST mutations. Store in `idempotency_key` table with 24h TTL.
2. Standardize error envelope: `{error: {code: string, message: string, details?: any}, statusCode: number}`.
3. Set `server.timeout` on Fastify (default 30s).
4. Cap export at 10,000 rows with `LIMIT` and provide download link for larger sets.

**Verification:** `npm run test:api` should validate error format consistency. Add contract test for error envelope.

---

### C) Data Architecture

**Current State:** PostgreSQL 15 with 21 sequential SQL migrations. Raw `pg` driver with manual `query()` calls. JSONB for flexible form data (`data_jsonb`). Audit trail with SHA-256 hash chain.

**Risks/Issues:**
1. **Missing critical indexes (confirmed from query analysis):**
   - `authority_holiday(authority_id, holiday_date)` — SLA calculation does full scan
   - `task(status, sla_due_at)` — SLA breach detection full scan
   - `fee_line_item(arn)` — fee lookup
   - `payment(gateway_order_id)` — gateway callback lookup
   - `feature_flag(flag_key)` — flag resolution
   - `audit_event(arn, event_type)` — breach detection NOT EXISTS
2. **Race condition in fee payment:** `fees.ts:258-282` — `paid_amount + $2` evaluated without row lock, enabling double-counting under concurrency.
3. **No CHECK constraints on status columns** — `application.state_id`, `payment.status`, `task.status` are unconstrained TEXT.
4. **No foreign key from `payment.demand_id` to `fee_demand`** — orphan payments possible.
5. **Schema drift risk:** Migrations use `IF NOT EXISTS` / `IF NOT EXISTS column` pattern which can mask errors.
6. **No down migrations** — cannot rollback schema changes.
7. **JSONB `data_jsonb` is schema-less in the database** — validation only at application layer.

**Recommendations:**
1. Add missing indexes (see Architect's Backlog).
2. Add `SELECT ... FOR UPDATE` on `fee_demand` before `updateDemandPayment`.
3. Add CHECK constraints on all status/enum columns.
4. Add foreign key `payment(demand_id) REFERENCES fee_demand(demand_id)`.
5. Consider JSONB schema validation via CHECK constraint or PostgreSQL JSON Schema extension.

**Verification:** Run `EXPLAIN ANALYZE` on SLA breach query before/after index creation. Confirm query plans use index scan.

---

### D) Security

**HIGH-IMPACT FINDINGS:**

| # | Issue | Severity | Location | Impact |
|---|-------|----------|----------|--------|
| D1 | `AUTH_DISABLED` flag can bypass all auth/authz | **P0** | `middleware/auth.ts:137`, `policy.ts:31` | Complete system compromise if env var leaks |
| D2 | Officer postings loaded silently fail — officer proceeds without role data | **P0** | `middleware/auth.ts:182-184` | Officer can access endpoints without authority validation |
| D3 | `.env` file committed with real credentials | **P0** | `.env` (root) | JWT_SECRET and DB credentials exposed in repo |
| D4 | OTP dev bypass (`AADHAR_OTP_DEV_BYPASS=true`) accepts any OTP | **P1** | `auth.ts:232-235`, `.env:14` | Account takeover if flag deployed to production |
| D5 | MFA debug code returned in API response | **P1** | `mfa-stepup.ts:181` | MFA bypass via response inspection |
| D6 | Document access has no authorization check | **P1** | `documents.ts:96-148` | Any authenticated user can download any document by ID |
| D7 | Payment amount not validated against demand | **P1** | `payments.ts:97-171` | $0 payment accepted for any demand |
| D8 | CSV export vulnerable to formula injection | **P1** | `applications.ts:787-789` | Excel macro execution via crafted field values |
| D9 | No file size limit in storage adapter | **P1** | `storage.ts:30-34` | Disk exhaustion DoS |
| D10 | Password reset token expiry not enforced in DB query | **P2** | `auth.ts:296-314` | Expired tokens accepted |
| D11 | Symlink following in LocalStorageAdapter | **P2** | `storage.ts:44` | Potential file read outside uploads directory |
| D12 | Test credentials hardcoded in Login UI | **P2** | `Login.tsx` footer, `OfficerLogin.tsx` footer | Credential leak in production build |
| D13 | No account lockout after failed login attempts | **P2** | `routes/auth.routes.ts:142-147` | Brute force attacks |
| D14 | CORS origin parsing doesn't trim whitespace | **P2** | `app.ts:472` | Origin validation failures with spaces |

**Recommendations (in priority order):**
1. **D1:** Remove `AUTH_DISABLED` entirely. Use dedicated test instance instead.
2. **D2:** Make posting load failure return 503, not silent continue.
3. **D3:** Remove `.env` from repo, add to `.gitignore`, rotate all secrets immediately.
4. **D4/D5:** Remove dev bypass flags or enforce `NODE_ENV !== 'production'` at startup with fatal error.
5. **D6:** Add `requireApplicationAccess(docArn, userId)` check before document retrieval.
6. **D7:** Validate `amount >= demand.total_amount - demand.paid_amount` before recording payment.

---

### E) Reliability & Scalability

**Current State:** Single Fastify process, Cloud Run autoscale (max 10 instances), 20-connection DB pool per instance.

**Risks/Issues:**
1. **SLA checker runs on startup and blocks** — `sla-checker.ts:113-115`. If 10K tasks breached, startup delayed.
2. **SLA breach detection has no transaction boundary** — creates audit_event, notification, and task update as 3 separate queries. Crash mid-batch leaves inconsistent state.
3. **No circuit breaker** on payment gateway calls — if Razorpay is down, all payment requests hang.
4. **`telemetry-retention.ts` cleanup job has no pagination** — deletes all expired events in one query.
5. **Feature flag cache has 3 layers** (local, Redis, DB) with no version-based invalidation — stale flags for up to 15s.
6. **File uploads stored on local disk** — not horizontally scalable. S3 adapter is a stub.
7. **No health check for DB migration state** — `/ready` only checks `SELECT 1`.

**Recommendations:**
1. Move SLA checker to background interval (already `setInterval` but fires immediately — add initial delay).
2. Wrap SLA breach processing in a transaction per task.
3. Add timeout + retry with backoff on gateway adapter calls.
4. Implement S3 adapter for production file storage.

---

### F) Observability & Operations

**Current State:** Structured JSON logger, Prometheus metrics (`prom-client`), OpenTelemetry tracing, Grafana dashboard, SLO definitions, 4 runbooks.

**Strengths:** Good foundation — SLOs defined, burn-rate alerts configured, request correlation via `x-request-id`.

**Gaps:**
1. **No user ID in log context** — `log-context.ts` only stores `requestId`. Cannot correlate logs per user.
2. **Overly aggressive PII redaction** — `logger.ts` redacts any key matching `email|phone|mobile`, including boolean fields like `phone_verified`.
3. **DB query tracing disabled** — `tracing.ts:75` sets `enhancedDatabaseReporting: false`.
4. **No alerting on auth failures spike** — Prometheus rules cover SLOs but not security events.
5. **Slow query logging absent** — queries >500ms not flagged separately.

**Recommendations:**
1. Add `userId` and `authorityId` to log context in auth middleware.
2. Make PII redaction key-based (exact match list) instead of pattern-based.
3. Enable DB query tracing in non-production environments.
4. Add Prometheus alert for `auth_failure_rate > 10/min`.

---

### G) Performance

**Risks/Issues:**
1. **N+1 in `assessFees`** — `fees.ts:92-118` inserts fee items one-by-one then reads each back.
2. **SLA calculation is O(N)** — `sla.ts:29-39` loops per working day with no holiday calendar caching.
3. **Citizen App.tsx re-renders entire tree** — 38+ state variables trigger cascading re-renders.
4. **Audit chain verification loads all events into memory** — `audit-chain.ts:58-66`. Will OOM at scale.
5. **No DB connection pooling awareness** — 20 connections × 10 Cloud Run instances = 200 connections. Cloud SQL default is 100.
6. **Export endpoint unbounded** — `GET /applications/export` can return all applications.

**Recommendations:**
1. Batch fee inserts with `INSERT ... VALUES (...), (...), ... RETURNING *`.
2. Cache holiday calendar per authority (TTL 1h) in memory.
3. Introduce React.memo and useMemo in citizen app; split into route components.
4. Chunk audit chain verification into 10K-record batches.
5. Reduce pool to 10 per instance, or use PgBouncer.

---

### H) Testing & Quality Gates

**Current State:** Vitest for unit/integration tests, Playwright for E2E, coverage thresholds on critical paths (60-65%), CI runs 15+ parallel checks.

**Strengths:** Good test variety — BRD acceptance tests, authorization matrix tests, load smoke, DAST scanning.

**Gaps:**
1. **No test for concurrent payment processing** — the critical race condition in fees.ts is untested.
2. **No contract tests** against OpenAPI spec (drift check exists but doesn't validate response shapes).
3. **Integration tests require live DB** — no test containers or mocks for CI isolation.
4. **Frontend has minimal tests** — only `cache.test.ts` and `cacheTelemetry.test.ts` in citizen; officer has zero tests.
5. **Coverage thresholds are low** — 60% lines on critical paths (workflow, payments).

**Recommendations:**
1. Add concurrent payment test: 2 parallel verify calls on same demand.
2. Add Zod-based response validation in API tests against OpenAPI spec.
3. Raise critical path coverage to 80% lines/branches.
4. Add React Testing Library tests for citizen/officer auth flows.

---

### I) DevEx & Maintainability

**Current State:** npm workspaces monorepo, `tsx` for dev mode, separate build/dev/test scripts per workspace.

**Gaps:**
1. **No ESLint configuration** — no linting enforced.
2. **No Prettier configuration** — no formatting consistency.
3. **No pre-commit hooks** — no lint/format/type-check before commit.
4. **`package-lock.json` is 356KB** — no lock file integrity verification in CI.
5. **No `CLAUDE.md` or `CONTRIBUTING.md` with setup instructions** for AI assistants.

**Recommendations:**
1. Add ESLint + Prettier + `lint-staged` + Husky pre-commit hook.
2. Add `npm ci` in CI instead of `npm install`.
3. Add type-check script: `tsc --noEmit` across all workspaces.

---

### J) Deployment & Infrastructure

**Current State:** Multi-stage Dockerfiles, Cloud Run deployment script, Terraform for baseline, canary deployment workflow.

**Strengths:** Non-root Docker user, health checks, Secret Manager integration, canary rollout.

**Gaps:**
1. **Docker builds not reproducible** — no pinned base image digests, `npm install` without `--frozen-lockfile`.
2. **No staging environment defined** — DAST workflow references `STAGING_BASE_URL` but no provisioning.
3. **Terraform only provisions baseline** — Cloud Run services not in Terraform (manual `gcloud` deploy).
4. **No database migration strategy in deployment** — migrations run manually or at app startup.
5. **`VITE_API_BASE_URL` baked into frontend at build time** — cannot change API URL without rebuild.

**Recommendations:**
1. Pin Docker base images to SHA digests.
2. Use `npm ci` in Dockerfiles.
3. Add migration step to CI/CD pipeline (before deploy, in a Job).
4. Consider runtime env injection for frontend API URL via `window.__ENV__`.

---

## 3. Bugs & Foot-Guns

### High-Impact (10)

| # | Issue | Severity | Evidence | Impact | Fix | Verify |
|---|-------|----------|----------|--------|-----|--------|
| H1 | `.env` with secrets committed to git | **CRITICAL** | `.env` in repo root, not in `.gitignore` pattern `**/.env` IS there but file already tracked | Credential exposure | `git rm --cached .env`, rotate JWT_SECRET and DB password | `git ls-files .env` returns empty |
| H2 | `AUTH_DISABLED=true` disables all auth in production | **CRITICAL** | `middleware/auth.ts:137-139` — no production guard beyond startup check | Full bypass if env var set | Remove flag entirely; use separate test server | grep for `AUTH_DISABLED` returns 0 results |
| H3 | Officer posting load failure silently ignored | **CRITICAL** | `middleware/auth.ts:182-184` — catch block is empty | Officer accesses all endpoints without role/authority validation | Return 503 on posting load failure | Test: simulate DB error during posting load → expect 503 |
| H4 | Concurrent fee payment double-counting | **CRITICAL** | `fees.ts:258-282` — `UPDATE paid_amount = paid_amount + $2` without row lock | Incorrect financial records, overpayment | Add `SELECT ... FOR UPDATE` on fee_demand before update | Run 2 concurrent payments on same demand → verify total correct |
| H5 | Document download has no authz check | **HIGH** | `documents.ts:96-148` — `getDocument` queries by doc_id only | Any user can download any document | Add `WHERE applicant_user_id = $2` join to application table | Test: user A tries to download user B's document → 403 |
| H6 | Payment amount not validated against demand | **HIGH** | `payments.ts:97-171` — `input.amount` inserted without validation | $0 or mismatched payment accepted | Validate amount matches remaining demand balance | Test: record $0 payment → expect rejection |
| H7 | OTP dev bypass enabled in `.env` | **HIGH** | `.env:14` — `AADHAR_OTP_DEV_BYPASS=true` | Any OTP accepted for Aadhaar login | Remove from `.env`, fatal error if set in production | Verify `AADHAR_OTP_DEV_BYPASS` not set in prod secrets |
| H8 | SLA breach detection creates orphan audit events | **HIGH** | `sla-checker.ts:48-86` — 3 queries without transaction | Audit event exists but notification/task update missing | Wrap in transaction with savepoints | Test: simulate DB error after audit insert → verify rollback |
| H9 | CSV export formula injection | **HIGH** | `applications.ts:787-789` — no prefix sanitization for `=`, `+`, `@`, `-` | Macro execution in Excel | Prefix cell values starting with `=+@-` with `'` | Test: create app with `=cmd|...` in name → verify escaped in CSV |
| H10 | No request timeout on Fastify | **HIGH** | No `server.timeout` in `app.ts` or `index.ts` | Slow queries hold connections indefinitely | Set `connectionTimeout: 30000` in Fastify config | Test: simulate slow query → verify timeout after 30s |

### Medium-Impact (10)

| # | Issue | Severity | Evidence | Impact | Fix | Verify |
|---|-------|----------|----------|--------|-----|--------|
| M1 | N+1 queries in `assessFees` | **MEDIUM** | `fees.ts:92-118` — loop with individual INSERT + SELECT per item | Slow fee creation under load | Batch insert with `INSERT ... RETURNING *` | Load test: assess 20 items → verify single INSERT |
| M2 | Test credentials shown in production UI | **MEDIUM** | `Login.tsx` and `OfficerLogin.tsx` footer sections | Credential disclosure to users | Conditionally render only when `import.meta.env.DEV` | Build production → verify no test credentials visible |
| M3 | CORS origin parsing bug with whitespace | **MEDIUM** | `app.ts:472` — `split(",")` without `.map(s => s.trim())` | Legitimate origins rejected | Add `.map(s => s.trim()).filter(Boolean)` | Test: set ALLOWED_ORIGINS with spaces → verify CORS works |
| M4 | No ESLint / Prettier enforced | **MEDIUM** | No `.eslintrc`, `.prettierrc`, or `lint-staged` in repo | Inconsistent code style, missed bugs | Add ESLint + Prettier + pre-commit hook | `npm run lint` exits 0 |
| M5 | Audit chain verification loads all events | **MEDIUM** | `audit-chain.ts:58-66` — `SELECT *` with no LIMIT | OOM at scale (100K+ events) | Chunk into 10K batches with cursor | Verify: 50K events → memory stays under 200MB |
| M6 | Feature flag stale for up to 15s | **MEDIUM** | `feature-flags.ts:212-215` — local cache TTL 15s | Flag changes not reflected immediately | Reduce TTL to 5s; add version-based invalidation | Toggle flag → verify takes effect within 5s |
| M7 | DB pool max 20 × 10 instances = 200 connections | **MEDIUM** | `db.ts:50` — `max: 20`, Cloud Run max 10 instances | Exceeds Cloud SQL default max_connections (100) | Reduce to `max: 8` or add PgBouncer | Check `pg_stat_activity` under load |
| M8 | No slow query logging | **MEDIUM** | `db.ts:64-72` — timing recorded but no threshold alert | Cannot identify performance regression source | Log queries >500ms at WARN level | Inject 1s delay → verify WARN log emitted |
| M9 | Missing indexes on hot query paths | **MEDIUM** | See Section 2C | Full table scans on SLA, fee, payment queries | Create indexes (see backlog) | `EXPLAIN ANALYZE` shows Index Scan |
| M10 | Citizen App.tsx 1,868 lines / 38+ state vars | **MEDIUM** | `apps/citizen/src/App.tsx` | Unmaintainable, cascading re-renders | Split into route-level components with React Router | Component files each <300 lines |

---

## 4. Architect's Backlog

| ID | Title | Sev | Effort | Area | Where | Why | Change Summary | Verify | Deps |
|----|-------|-----|--------|------|-------|-----|----------------|--------|------|
| AB-01 | Remove `.env` from git, rotate secrets | P0 | S | Security | `.env`, `.gitignore` | Credentials exposed in repo | `git rm --cached .env`; rotate JWT_SECRET & DB password in Secret Manager; verify `.gitignore` covers `.env` | `git ls-files .env` empty; old secret rejected | — |
| AB-02 | Remove `AUTH_DISABLED` flag entirely | P0 | S | Security | `middleware/auth.ts:137`, `policy.ts:31`, `errors.ts:35` | Production auth bypass risk | Delete all `AUTH_DISABLED` checks; use dedicated test API instance; update test-env.ts to inject test tokens directly | `grep -r AUTH_DISABLED src/` returns 0 | — |
| AB-03 | Fail request on officer posting load error | P0 | S | Security | `middleware/auth.ts:178-185` | Officers proceed without authority scoping | Replace empty catch with `reply.code(503).send(...)` | Test: DB error on posting query → 503 returned | — |
| AB-04 | Add row-level locking on fee demand payment | P0 | S | Data | `fees.ts:258-282` | Concurrent double-counting | Add `SELECT ... FOR UPDATE` on `fee_demand` row before `UPDATE paid_amount` | 2 concurrent updates → correct total | — |
| AB-05 | Add document download authorization | P0 | S | Security | `documents.ts`, `routes/document.routes.ts` | Any user can download any document | Join `document` to `application` and check `applicant_user_id = authUser.userId` OR officer with authority access | User A cannot download User B's doc → 403 | — |
| AB-06 | Validate payment amount against demand | P0 | S | Data | `payments.ts:97-171`, `routes/fee.routes.ts` | Arbitrary payment amounts accepted | Load demand, verify `amount >= remaining_balance`; reject $0 payments | Test: $0 payment → rejected | AB-04 |
| AB-07 | Remove OTP/MFA dev bypass flags in production | P0 | S | Security | `auth.ts:232`, `mfa-stepup.ts:87-92`, `.env:14` | Bypass authentication in production | Add startup fatal error: if `AADHAR_OTP_DEV_BYPASS=true` and `NODE_ENV=production`, crash | Startup fails with flag in prod mode | — |
| AB-08 | Fix CSV export formula injection | P0 | S | Security | `applications.ts:787-789` | Excel macro execution | In `esc()` function, prefix values starting with `=`, `+`, `-`, `@`, `\t`, `\r` with `'` | Export with `=cmd` → cell shows `'=cmd` | — |
| AB-09 | Add Fastify request timeout | P0 | S | Reliability | `apps/api/src/index.ts` | Unbounded request duration | Add `server: { requestTimeout: 30000 }` to Fastify options | Slow handler → 408 after 30s | — |
| AB-10 | Wrap SLA breach in transaction | P1 | S | Data | `sla-checker.ts:48-86` | Orphan audit events on crash | Wrap audit_event INSERT + notification INSERT + task UPDATE in single BEGIN/COMMIT per task | Simulate failure → all 3 rolled back | — |
| AB-11 | Add missing database indexes | P1 | M | Data | `migrations/022_*.sql` (new) | Full table scans on hot paths | Create migration with: `authority_holiday(authority_id, holiday_date)`, `task(status, sla_due_at)`, `payment(gateway_order_id)`, `fee_line_item(arn)`, `audit_event(arn, event_type)`, `feature_flag(flag_key)` | `EXPLAIN ANALYZE` confirms index usage | — |
| AB-12 | Add CHECK constraints on status columns | P1 | M | Data | `migrations/022_*.sql` | No DB-level enum enforcement | `ALTER TABLE application ADD CONSTRAINT chk_state CHECK (state_id IN (...))` for application, task, payment, demand | INSERT invalid status → DB error | AB-11 |
| AB-13 | Remove test credentials from production UI | P1 | S | Security | `apps/citizen/src/Login.tsx`, `apps/officer/src/OfficerLogin.tsx` | Credential exposure in production | Wrap in `{import.meta.env.DEV && <section>...</section>}` | Production build → no test credentials visible | — |
| AB-14 | Fix CORS origin whitespace parsing | P1 | S | Security | `apps/api/src/app.ts:472` | Legitimate origins rejected | Change `.split(",")` to `.split(",").map(s => s.trim()).filter(Boolean)` | Test: `"origin1, origin2"` → both accepted | — |
| AB-15 | Add password reset token expiry enforcement | P1 | S | Security | `auth.ts:319-321` | Expired tokens accepted | Add `AND expires_at > NOW()` to token lookup query | Test: expired token → rejected | — |
| AB-16 | Validate password complexity on registration/reset | P1 | S | Security | `auth.ts:316-331`, `routes/auth.routes.ts:30` | Weak passwords accepted (minLength 6) | Enforce 12+ chars, 1 uppercase, 1 number, 1 special char via Zod schema | Test: `aaa` password → rejected | — |
| AB-17 | Add account lockout after failed login | P1 | M | Security | `routes/auth.routes.ts`, `auth.ts` | Brute force possible | Track failed attempts in `user` table; lock after 5 failures for 15 min | 6th attempt → locked response | — |
| AB-18 | Batch fee line item inserts | P1 | M | Performance | `fees.ts:92-118` | N+1 queries on fee assessment | Refactor to single `INSERT ... VALUES (...), (...) RETURNING *` | 10 items → 1 INSERT query (check metrics) | — |
| AB-19 | Cache holiday calendar for SLA calc | P1 | S | Performance | `sla.ts:15-19` | Repeated DB queries per SLA calculation | In-memory Map keyed by `authorityId`, TTL 1h, invalidate on holiday CRUD | SLA calc → 0 holiday queries after first call | — |
| AB-20 | Add ESLint + Prettier + pre-commit hooks | P1 | M | DevEx | Root, `.eslintrc.js`, `.prettierrc`, `package.json` | No code quality enforcement | Install `eslint`, `prettier`, `husky`, `lint-staged`; add configs; add `lint` and `format` scripts | `npm run lint` exits 0; pre-commit runs lint | — |
| AB-21 | Reduce DB pool size for Cloud Run scaling | P1 | S | Reliability | `db.ts:50` | 200 connections exceed Cloud SQL limit | Set `max: 8` (8 × 10 instances = 80 < 100 max_connections) | `pg_stat_activity` count < 100 under load | — |
| AB-22 | Add slow query logging | P1 | S | Observability | `db.ts:64-72` | Cannot identify slow queries | Add `if (durationMs > 500) logWarn("SLOW_QUERY", ...)` with full query text | Inject 1s query → WARN log emitted | — |
| AB-23 | Add userId to structured log context | P1 | S | Observability | `log-context.ts`, `middleware/auth.ts` | Cannot correlate logs per user | After auth middleware sets `authUser`, add `userId` and `authorityId` to log context | Logs include `userId` field | — |
| AB-24 | Pin Docker base images to SHA digests | P1 | S | Infra | `Dockerfile.api`, `Dockerfile.citizen`, `Dockerfile.officer` | Non-reproducible builds | Change `FROM node:20-alpine` to `FROM node:20-alpine@sha256:...` | `docker build` uses exact image | — |
| AB-25 | Use `npm ci` in Dockerfiles | P1 | S | Infra | All Dockerfiles | Non-deterministic dependency resolution | Replace `npm install` with `npm ci` | Build deterministic with lockfile | AB-24 |
| AB-26 | Add type-check CI gate | P1 | S | Quality | `package.json`, `.github/workflows/ci.yml` | Type errors not caught in CI | Add `"typecheck": "tsc --noEmit -p apps/api && tsc --noEmit -p apps/citizen && tsc --noEmit -p apps/officer"` | CI fails on type error | — |
| AB-27 | Split citizen App.tsx into route components | P2 | L | Frontend | `apps/citizen/src/App.tsx` | 1,868 lines unmaintainable | Add `react-router-dom`; extract ServiceCatalog, ApplicationForm, ApplicationTracker, Dashboard into separate files | Each component <300 lines | — |
| AB-28 | Add React Router to officer app | P2 | M | Frontend | `apps/officer/src/App.tsx` | View state management via useState is fragile | Add `react-router-dom`; routes: `/inbox`, `/task/:id`, `/search` | Browser back/forward works | — |
| AB-29 | Add concurrent payment integration test | P1 | M | Testing | `apps/api/src/payments.lifecycle.integration.test.ts` | Race condition untested | Test: 2 parallel `verifyGatewayPayment` calls → only 1 succeeds; demand total correct | Test passes consistently | AB-04 |
| AB-30 | Add frontend unit tests for auth flows | P2 | M | Testing | `apps/citizen/`, `apps/officer/` | Zero frontend auth tests | Add React Testing Library tests for login, logout, token expiry, cross-tab sync | `npm run test:unit` covers auth | — |
| AB-31 | Add foreign key payment→fee_demand | P2 | S | Data | `migrations/022_*.sql` | Orphan payments possible | `ALTER TABLE payment ADD CONSTRAINT fk_demand FOREIGN KEY (demand_id) REFERENCES fee_demand(demand_id)` | INSERT with invalid demand_id → FK error | AB-11 |
| AB-32 | Add idempotency key to POST endpoints | P2 | M | API | `middleware/`, `routes/*.routes.ts` | Retry creates duplicates | Add `Idempotency-Key` header handling middleware; store in `idempotency_cache` table (24h TTL) | Same key on POST → returns cached response | — |
| AB-33 | Implement S3 storage adapter | P2 | M | Infra | `storage.ts:64-83` | Local disk not horizontally scalable | Implement `S3StorageAdapter` with `@aws-sdk/client-s3`; configure via `STORAGE_ADAPTER=s3` env var | Upload/download works with S3 bucket | — |
| AB-34 | Add file size limit to document upload | P1 | S | Security | `routes/document.routes.ts`, `storage.ts` | Disk exhaustion DoS | Validate `fileBuffer.length <= 25_000_000` before storage write; already limited in multipart config but enforce in storage layer too | Upload 30MB file → 413 response | — |
| AB-35 | Add Prometheus alert for auth failure spike | P2 | S | Observability | `ops/observability/prometheus-alerts.yml` | No security event monitoring | Add rule: `rate(http_requests_total{status="401"}[5m]) > 0.1` | Simulate 10 failed logins → alert fires | — |
| AB-36 | Standardize API error envelope | P2 | M | API | `errors.ts`, all route files | Inconsistent error format | Define `ApiError` type: `{error: {code, message, details?}, statusCode}`; update all `send400`/`send500` calls | All error responses match envelope schema | — |
| AB-37 | Add migration step to CI/CD pipeline | P2 | M | Infra | `.github/workflows/deploy-cloudrun.yml` | Migrations run at app startup (risky) | Add pre-deploy job: run `npm run migrate` against target DB in CI before deploy | Migrations verified before new code deployed | — |
| AB-38 | Add PII redaction whitelist | P2 | S | Observability | `logger.ts` | Legitimate fields redacted (phone_verified) | Change regex-based redaction to exact key set: `["email", "phone", "mobile", "aadhar", "password"]` | `phone_verified: true` appears in logs unredacted | — |
| AB-39 | Add symlink check in LocalStorageAdapter | P2 | S | Security | `storage.ts:36-47` | Symlink can escape uploads dir | Use `fs.lstat()` to check if resolved path is symlink before reading | Symlink to `/etc/passwd` → INVALID_STORAGE_KEY error | — |
| AB-40 | Add DB migration state to health check | P2 | S | Reliability | `app.ts:495-504` | `/ready` passes with incomplete schema | Check `migration_version` table for expected version | Old schema + new code → `/ready` returns 503 | — |
| AB-41 | Cap export query at 10K rows | P2 | S | Performance | `applications.ts:734-804` | Unbounded CSV export | Add `LIMIT 10001` to export query; return error if >10K rows advising use of pagination | Export 15K → returns error with suggestion | — |
| AB-42 | Add down migrations | P2 | L | Data | `migrations/` | Cannot rollback schema changes | For each migration, add `_down.sql` counterpart; add `npm run migrate:down` script | `migrate:down` rolls back last migration | — |
| AB-43 | Chunk audit chain verification | P2 | M | Performance | `audit-chain.ts:58-66` | OOM at scale | Process in 10K-event batches using `OFFSET/LIMIT` cursor | Verify 100K events → memory <200MB | — |
| AB-44 | Add runtime env injection for frontend API URL | P2 | M | Infra | `Dockerfile.citizen`, `Dockerfile.officer`, nginx config | API URL requires rebuild to change | Inject `window.__ENV__ = {API_URL: "$API_URL"}` at nginx level; read in `main.tsx` | Change API_URL → no rebuild needed | — |
| AB-45 | Reduce feature flag cache TTL | P2 | S | Reliability | `feature-flags.ts:212` | Stale flags for 15s | Reduce local cache TTL to 5s | Flag change → effective within 5s | — |
| AB-46 | Add UNIQUE constraint on SLA breach audit | P2 | S | Data | `migrations/022_*.sql` | Duplicate SLA_BREACHED events possible | `CREATE UNIQUE INDEX ON audit_event(arn, event_type, (payload_jsonb->>'taskId')) WHERE event_type = 'SLA_BREACHED'` | Concurrent breach detection → only 1 event | AB-10 |
| AB-47 | Enable DB tracing in non-prod | P2 | S | Observability | `observability/tracing.ts:75` | Cannot correlate queries to requests | Set `enhancedDatabaseReporting: true` when `NODE_ENV !== 'production'` | Dev traces include SQL statements | — |
| AB-48 | Add SLA checker initial delay | P2 | S | Reliability | `sla-checker.ts:113` | Blocks startup if many breaches | Add `setTimeout(run, 30_000)` instead of immediate execution | App starts in <5s regardless of breach count | — |

---

## 5. Quick Wins (< 2 Hours) & Stabilization (2 Days)

### Quick Wins — Do Right Now

| # | Backlog ID | What | Time |
|---|-----------|------|------|
| 1 | AB-01 | Remove `.env` from git, add to `.gitignore`, rotate secrets | 15 min |
| 2 | AB-08 | Fix CSV formula injection (add `'` prefix in `esc()`) | 10 min |
| 3 | AB-14 | Fix CORS origin whitespace parsing | 5 min |
| 4 | AB-13 | Hide test credentials behind `import.meta.env.DEV` | 10 min |
| 5 | AB-09 | Add Fastify request timeout (30s) | 5 min |
| 6 | AB-03 | Fail request on officer posting load error | 10 min |
| 7 | AB-22 | Add slow query logging (>500ms threshold) | 15 min |
| 8 | AB-23 | Add userId to log context | 15 min |
| 9 | AB-48 | Add 30s initial delay to SLA checker | 5 min |
| 10 | AB-15 | Add `expires_at > NOW()` to password reset token query | 5 min |

**Total estimated: ~1.5 hours**

### 2-Day Stabilization

| # | Backlog ID | What | Effort |
|---|-----------|------|--------|
| 1 | AB-02 | Remove `AUTH_DISABLED` flag entirely | 2h |
| 2 | AB-04 | Add row-level locking on fee demand payment | 1h |
| 3 | AB-05 | Add document download authorization check | 2h |
| 4 | AB-06 | Validate payment amount against demand balance | 1h |
| 5 | AB-07 | Remove OTP/MFA dev bypass flags in production | 1h |
| 6 | AB-10 | Wrap SLA breach detection in transaction | 1h |
| 7 | AB-11 | Create missing database indexes (new migration) | 2h |
| 8 | AB-16 | Add password complexity validation | 1h |
| 9 | AB-17 | Add account lockout after failed login | 2h |
| 10 | AB-21 | Reduce DB pool size for Cloud Run scaling | 15min |
| 11 | AB-26 | Add type-check CI gate | 30min |
| 12 | AB-29 | Add concurrent payment integration test | 2h |
| 13 | AB-34 | Add file size limit enforcement in storage layer | 30min |

**Total estimated: ~16 hours (2 working days)**

---

## 6. Refactor Proposal

The architecture is fundamentally **sound** — a modular monolith is appropriate for this scale. No fundamental redesign needed. However, two phased improvements are recommended:

### Phase 1: Code Organization (1 week)
**Target:** Domain-organized folders with explicit layering.

```
apps/api/src/
├── auth/           # auth.ts, token-security.ts, mfa-stepup.ts, middleware/auth.ts
├── workflow/       # workflow.ts, tasks.ts, sla.ts, sla-checker.ts
├── payments/       # payments.ts, fees.ts, providers/payment-gateway.ts
├── documents/      # documents.ts, storage.ts
├── applications/   # applications.ts
├── notifications/  # notifications.ts, notification-log.ts, notices.ts, transports/
├── admin/          # admin routes, feature-flags.ts
├── observability/  # metrics.ts, tracing.ts, logger.ts, log-context.ts
├── shared/         # errors.ts, db.ts, policy.ts, route-access.ts
└── routes/         # thin route registrations importing from domain modules
```

**Migration:** Move files one domain at a time. Each move is a separate PR. Update imports. Verify `npm run build && npm test` passes after each.

### Phase 2: Frontend Decomposition (1 week)
**Target:** React Router based navigation, component files < 300 lines.

```
apps/citizen/src/
├── routes/
│   ├── Dashboard.tsx
│   ├── ServiceCatalog.tsx
│   ├── ApplicationForm.tsx
│   ├── ApplicationDetail.tsx
│   └── Login.tsx
├── components/
│   ├── DocumentUpload.tsx
│   ├── NDCPaymentLedger.tsx
│   └── QueryResponseForm.tsx
├── hooks/
│   ├── useAuth.ts
│   ├── useCache.ts
│   └── useApi.ts
└── App.tsx (< 100 lines, just Router + providers)
```

**Rollback:** Each route can be extracted independently. If a route causes issues, revert that single PR.

---

## 7. Commands & Scripts

### Run locally
```bash
# Start PostgreSQL
docker compose up -d postgres

# Install dependencies
npm ci

# Run database migrations
npm --workspace apps/api run migrate

# Seed test data
npm --workspace apps/api run seed

# Start API (dev mode with hot reload)
npm run dev:api

# Start Citizen Portal (separate terminal)
npm run dev:citizen

# Start Officer Portal (separate terminal)
npm run dev:officer
```

### Run tests
```bash
# API unit + integration tests (requires running PostgreSQL)
npm run test:api

# Critical path tests with coverage
npm --workspace apps/api run test:critical

# Authorization matrix tests
npm --workspace apps/api run test:authz

# BRD acceptance tests
npm --workspace apps/api run test:brd

# Frontend unit tests
npm run test:citizen:unit

# E2E tests (requires all services running)
npx playwright test --config=e2e/playwright.config.ts

# Accessibility smoke tests
npm run test:e2e:a11y

# Load smoke test
npm run test:api:load
```

### Linting & Type Checks (TO ADD)
```bash
# Currently missing — add these:
# npm run lint          # ESLint across all workspaces
# npm run format        # Prettier check
# npm run typecheck     # tsc --noEmit for all apps

# Existing checks:
npm run check:observability      # Verify SLO/dashboard/runbook artifacts
npm run check:frontend-budgets   # Frontend bundle size thresholds
npm run check:iac                # Terraform fmt + validate
npm run check:slo-alerts         # Alert rule validation
```

### Security scans
```bash
# DAST (local, requires running API)
npm run test:api:dast:local

# ZAP report analysis
npm run check:dast:report

# Semgrep (if installed)
semgrep scan --config=auto apps/api/src/

# npm audit
npm audit --omit=dev

# Check for known vulnerable packages
npx better-npm-audit audit
```

### Docker build & deploy
```bash
# Build all Docker images
docker compose build

# Run all services
docker compose up -d

# Deploy to Cloud Run
./deploy-cloudrun.sh all <PROJECT_ID> <REGION>

# Canary deploy (via GitHub Actions)
# Trigger workflow_dispatch on deploy-cloudrun.yml
```

---

## Top 5 Priorities

1. **AB-01 + AB-07: Remove `.env` from git and eliminate dev bypass flags** — Credentials are exposed. OTP bypass enables account takeover. Fix today.

2. **AB-04 + AB-06: Fix payment concurrency and amount validation** — Financial data integrity is at risk. Concurrent payments can double-count. Zero-amount payments accepted.

3. **AB-02 + AB-03: Remove AUTH_DISABLED and fix officer posting failure** — Two paths to complete authorization bypass. Any authenticated officer can access any authority's data.

4. **AB-05: Add document download authorization** — Any authenticated user can download any document by guessing/enumerating UUIDs. PII exposure risk.

5. **AB-11: Add missing database indexes** — 6 hot query paths running full table scans. Will cause latency spikes under production load.
