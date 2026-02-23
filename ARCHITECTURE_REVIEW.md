# PUDA Workflow Engine — Architecture Review

**Date:** 2026-02-10
**Reviewer:** Principal Software Architect + Security Engineer

---

## 1. System Map

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTS                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Citizen SPA  │  │ Officer SPA  │  │ Future: Mobile / CSC │   │
│  │ React+Vite   │  │ React+Vite   │  │                      │   │
│  │ :5173 / :3002│  │ :5174 / :3003│  │                      │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────┘   │
│         │                  │                                     │
│         └────────┬─────────┘                                     │
│                  ▼                                                │
│  ┌──────────────────────────────┐                                │
│  │   Nginx (prod: citizen/off) │  SPA fallback, gzip, headers   │
│  └──────────────┬───────────────┘                                │
└─────────────────┼───────────────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API SERVER                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Fastify 5 — :3001 (local) / :8080 (Docker/Cloud Run)   │   │
│  │                                                          │   │
│  │  Middleware: JWT Auth → Rate Limit → CORS → Routes       │   │
│  │                                                          │   │
│  │  ┌────────────┐ ┌───────────┐ ┌──────────────────────┐  │   │
│  │  │ Auth       │ │ Workflow  │ │ Application CRUD     │  │   │
│  │  │ (JWT+OTP)  │ │ Engine    │ │ + Submit + Query     │  │   │
│  │  └────────────┘ └───────────┘ └──────────────────────┘  │   │
│  │  ┌────────────┐ ┌───────────┐ ┌──────────────────────┐  │   │
│  │  │ Documents  │ │ Tasks     │ │ Fees & Payments      │  │   │
│  │  │ (upload/dl)│ │ (inbox)   │ │ (demands, gateway)   │  │   │
│  │  └────────────┘ └───────────┘ └──────────────────────┘  │   │
│  │  ┌────────────┐ ┌───────────┐ ┌──────────────────────┐  │   │
│  │  │ Inspections│ │ Decisions │ │ Communications       │  │   │
│  │  │ (schedule) │ │ & Outputs │ │ (notices, notify)    │  │   │
│  │  └────────────┘ └───────────┘ └──────────────────────┘  │   │
│  │  ┌────────────┐ ┌───────────┐ ┌──────────────────────┐  │   │
│  │  │ Properties │ │ SLA Check │ │ Config / ServicePack │  │   │
│  │  │ (master)   │ │ (cron)    │ │ (registry)           │  │   │
│  │  └────────────┘ └───────────┘ └──────────────────────┘  │   │
│  └──────────────────────────┬───────────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ PostgreSQL 15│  │ Local FS     │  │ SMTP (Nodemailer)    │  │
│  │ :5432        │  │ ./uploads    │  │ (disabled by default)│  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                        DATA TIER                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Architecture Pattern:** Modular monolith with config-driven workflow engine and JSONB-based flexible data model.

**Key Data Flow:**
1. Citizen creates application → API validates → stores in `application.data_jsonb` + extracts property to `property` table
2. Citizen submits → API validates (Zod + service-pack rules) → workflow engine transitions state → creates first task
3. Officer acts on task → workflow engine transitions → may raise query / approve / reject → generates output
4. All transitions: `FOR UPDATE` row lock → state change → status history → audit event → notification (post-commit)

---

## 2. Architecture Review Findings

### A) Code Organization & Boundaries

**Current State:** Well-structured monorepo with `apps/` (api, citizen, officer) and `packages/shared/`. Shared package contains Zod schemas (`master-model/`), form renderer, and UI components.

**Issues:**
- `apps/api/src/applications.ts` (750 lines) is a god module: CRUD, validation, search, export, query response all in one file
- `apps/api/src/workflow.ts` mixes state machine logic with side effects (task creation, query raising, decision recording, notice generation)
- Business logic (fee calculation, SLA computation) imports are lazy (`await import()`) scattered through workflow actions — makes dependency graph unclear

**Recommendations:**
1. Extract `applications.ts` into `application-crud.ts`, `application-search.ts`, `application-submit.ts`
2. Extract workflow actions into separate `workflow-actions/` directory
3. Move lazy imports to explicit module boundaries

### B) API Design & Contracts

**Current State:** REST API at `/api/v1/` with JSON schema validation on all mutation routes. Wildcard routing for ARN-based paths (ARNs contain slashes).

**Issues:**
- No API versioning strategy beyond `/v1/` prefix
- Inconsistent pagination: some routes cap at 200, others at 50
- Error response shape inconsistent: some return `{error}`, others `{error, message, statusCode}`
- No request ID / correlation ID in responses
- No idempotency keys for mutation endpoints

**Recommendations:**
1. Standardize error response shape across all routes → always `{error, message, statusCode}`
2. Add `X-Request-Id` header (generate UUID per request, return in response)
3. Standardize pagination: default 50, max 200, always return `{items, total, limit, offset}`

### C) Data Architecture

**Current State:** PostgreSQL with JSONB (`data_jsonb`) for flexible application data + first-class relational tables for workflow entities. 13 migrations. Proper FK constraints and indexes.

**Issues:**
- `data_jsonb` is essentially a document store inside PostgreSQL — no schema enforcement at DB level
- Missing index: `payment.gateway_payment_id` (needed for duplicate detection in gateway callbacks)
- No database connection retry logic on startup
- No connection pool monitoring/metrics
- Migrations are not idempotent-safe in all cases (some use `CREATE TABLE IF NOT EXISTS`, others don't)

**Recommendations:**
1. Add `CREATE INDEX IF NOT EXISTS idx_payment_gateway_id ON payment(gateway_payment_id) WHERE gateway_payment_id IS NOT NULL`
2. Add connection retry with exponential backoff in `db.ts`
3. Add pool event logging (`pool.on('error')`, `pool.on('connect')`)

### D) Security

**Current State:** Strong baseline — parameterized SQL, JWT + Argon2, rate limiting, OTP with lockout, production guards.

**Issues (ordered by severity):**

| # | Issue | Severity | Location |
|---|-------|----------|----------|
| D1 | **No CSRF protection** | High | All state-changing endpoints rely solely on JWT |
| D2 | **File upload: no filename sanitization** | High | `document.routes.ts` — path traversal risk |
| D3 | **No Content-Security-Policy header** | Medium | `nginx.citizen.conf`, `nginx.officer.conf` |
| D4 | **AUTH_DISABLED=true test mode** | Medium | `middleware/auth.ts` — if accidentally set in prod |
| D5 | **No request body size limit** | Medium | Fastify default is 1MB but not explicitly configured |
| D6 | **JWT secret fallback** | Low | Test env uses `test-secret` — ensure never in prod |

**Recommendations:**
1. Add `SameSite=Strict` cookie flag if cookies are used; for pure JWT, CSRF is mitigated but add `Origin` header check
2. Sanitize uploaded filenames: strip path separators, limit length, allow only alphanumeric + dots
3. Add CSP headers to nginx configs
4. Add startup check: refuse to start if `AUTH_DISABLED=true` and `NODE_ENV=production`

### E) Reliability & Scalability

**Issues:**
- No `FOR UPDATE NOWAIT` or `FOR UPDATE SKIP LOCKED` — under load, workflow transitions can queue up
- No circuit breaker for external services (email, payment gateway)
- SLA checker runs as in-process `setInterval` — not distributed-safe for multiple API instances
- No graceful shutdown handling (inflight requests, DB pool drain)
- No health check beyond basic `/health` endpoint (should check DB connectivity)

**Recommendations:**
1. Add `NOWAIT` to `FOR UPDATE` in workflow and return 503 on lock contention
2. Add graceful shutdown: `process.on('SIGTERM')` → stop accepting, drain pool, exit
3. Health check should ping DB: `SELECT 1`

### F) Observability & Operations

**Issues:**
- No structured logging (uses `console.log` / `console.warn` / `console.error`)
- No correlation IDs
- No metrics (request latency, error rate, DB pool utilization)
- No distributed tracing
- Audit events in DB but no centralized log aggregation

**Recommendations:**
1. Replace `console.*` with Pino (Fastify's built-in logger) — structured JSON logs
2. Add request ID middleware: `request.id` → log all operations with it
3. Add `/health/ready` (checks DB) alongside `/health/live`

### G) Performance

**Issues:**
- `searchApplications()` uses `ILIKE` with leading wildcard (`%term%`) on 7 JSONB paths — will not use indexes
- `exportApplicationsToCSV()` loads up to 10,000 rows into memory
- No query result caching
- Frontend: No code splitting, no lazy loading of routes

**Recommendations:**
1. Add GIN index on frequently searched JSONB paths
2. Stream CSV export instead of buffering
3. Add `React.lazy()` for route-level code splitting

### H) Testing & Quality Gates

**Current State:** 13+ test files using Vitest. Integration tests for auth, authorization, BRD. No workflow engine tests.

**Gaps:**
- No workflow engine tests (critical path!)
- No payment flow tests
- No concurrency/race condition tests
- No test coverage reporting
- No CI/CD pipeline defined

**Recommendations:**
1. Add workflow transition tests (happy path + invalid state + unauthorized)
2. Add `vitest --coverage` to test script
3. Define CI pipeline: lint → typecheck → test → build

### I) DevEx & Maintainability

**Strengths:** Good monorepo structure, clear scripts, `.env.example`, seed data.

**Issues:**
- No `Makefile` or task runner for common operations
- No local setup documentation beyond README
- TypeScript errors in shared package (pre-existing: JSX config, argument count mismatches)

### J) Deployment & Infrastructure

**Issues:**
- `Dockerfile.api` health check uses `wget` — not available in `node:20-alpine`
- `deploy-cloudrun.sh` doesn't pass `VITE_API_BASE_URL` build arg
- No environment variable injection for Cloud Run services
- No rollback mechanism in deployment script
- No infrastructure-as-code (Terraform/Pulumi)

---

## 3. Bugs and Foot-guns

### High-Impact (10)

| # | Issue | Severity | Evidence | Impact | Fix | Verify |
|---|-------|----------|----------|--------|-----|--------|
| H1 | **Dockerfile health check fails** | P0 | `Dockerfile.api:76` uses `wget` — not in `node:20-alpine` | Container never becomes healthy; orchestrator kills it | Use `node -e "fetch('http://localhost:8080/health')"` | `docker build -f Dockerfile.api . && docker run --rm -it <img> wget` |
| H2 | **File upload path traversal** | P0 | `document.routes.ts` — filename from user not sanitized | Attacker overwrites arbitrary files | Sanitize: `path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_')` | Upload file named `../../etc/passwd` |
| H3 | **No graceful shutdown** | P1 | No `SIGTERM` handler in `index.ts` | Inflight requests dropped on deploy; DB connections leak | Add shutdown handler: close server, drain pool | `kill -TERM <pid>` and verify clean exit |
| H4 | **SLA checker not distributed-safe** | P1 | `setInterval` in API process | Multiple instances send duplicate notifications | Use advisory lock or separate worker | Run 2 instances, check for duplicate SLA alerts |
| H5 | **CSV export OOM risk** | P1 | `exportApplicationsToCSV()` loads 10K rows to memory | Large authority could crash the process | Stream with cursor-based pagination | Export with 10K+ rows, monitor RSS |
| H6 | **No DB health in /health** | P1 | `/health` returns 200 without checking DB | Load balancer routes to unhealthy instance | Add `SELECT 1` check | Kill DB, check `/health` still returns 200 |
| H7 | **Cloud Run deploy missing env vars** | P1 | `deploy-cloudrun.sh` has no `--set-env-vars` | Services start without DB URL, JWT secret | Add env var flags from Secret Manager | Deploy and check logs |
| H8 | **Cloud Run deploy missing build args** | P1 | `deploy-cloudrun.sh` has no `--build-arg` for frontend | Citizen/officer portals point to wrong API URL | Add `--build-arg VITE_API_BASE_URL=...` | Deploy frontend, check network tab |
| H9 | **FOR UPDATE without timeout** | P1 | `workflow.ts:48` | Under load, transactions queue indefinitely | Add `SET LOCAL lock_timeout = '5s'` | Simulate concurrent transitions |
| H10 | **Missing CSRF / Origin check** | P1 | No Origin header validation | Cross-site request forgery on state-changing endpoints | Add Origin header check middleware | Test with cross-origin POST |

### Medium-Impact (10)

| # | Issue | Severity | Evidence | Impact | Fix | Verify |
|---|-------|----------|----------|--------|-----|--------|
| M1 | **Inconsistent error responses** | P2 | Various route handlers | Client parsing breaks | Standardize to `{error, message, statusCode}` | Grep for `reply.code` patterns |
| M2 | **No request correlation IDs** | P2 | No `X-Request-Id` in any route | Cannot trace requests across logs | Add Fastify request ID plugin | Check response headers |
| M3 | **console.log instead of structured logging** | P2 | Throughout API codebase | Logs unparseable in production | Replace with Pino | Check log output format |
| M4 | **No workflow engine tests** | P2 | No test file for `workflow.ts` | Regressions undetected in critical path | Add transition unit tests | Run test suite |
| M5 | **TypeScript errors in shared package** | P2 | `fees-payments.ts:10`, `inspections.ts:21` | Build warnings, potential runtime issues | Fix argument count mismatches | `npx tsc --noEmit` |
| M6 | **Leading wildcard ILIKE on JSONB** | P2 | `searchApplications()` | Full table scan on search | Add GIN indexes or full-text search | `EXPLAIN ANALYZE` on search query |
| M7 | **No connection retry on startup** | P2 | `db.ts` — pool created once | API fails to start if DB is briefly unavailable | Retry with backoff | Stop DB, start API, check behavior |
| M8 | **Officer portal missing i18n** | P2 | No `i18next` in officer `package.json` | Cannot localize for Punjabi users | Add i18n matching citizen pattern | Check for hardcoded strings |
| M9 | **No Content-Security-Policy** | P2 | Nginx configs | XSS mitigation weakened | Add `Content-Security-Policy` header | Check response headers |
| M10 | **Breakpoints inconsistent** | P2 | CSS: 30rem, 32rem, 36rem, 48rem | UI inconsistencies across screen sizes | Standardize to 3 breakpoints | Visual regression test |

---

## 4. Architect's Backlog

| ID | Title | Sev | Effort | Area | Where | Why | Change | Verify | Deps |
|----|-------|-----|--------|------|-------|-----|--------|--------|------|
| AB-01 | Fix Dockerfile health check | P0 | S | Infra | `Dockerfile.api:76` | Container never healthy | Replace `wget` with `node -e` health check | Docker build + run | — |
| AB-02 | Sanitize upload filenames | P0 | S | Security | `document.routes.ts` | Path traversal | `path.basename()` + regex sanitize | Upload `../../test` | — |
| AB-03 | Add graceful shutdown | P1 | S | Reliability | `apps/api/src/index.ts` | Request drops on deploy | SIGTERM handler: close server, drain pool | `kill -TERM`, verify clean exit | — |
| AB-04 | Add DB health to /health | P1 | S | Reliability | `apps/api/src/app.ts` | LB routes to dead instance | `SELECT 1` in health endpoint | Kill DB, check /health | — |
| AB-05 | Add lock timeout to workflow | P1 | S | Reliability | `workflow.ts:44` | Indefinite waits under load | `SET LOCAL lock_timeout = '5s'` | Concurrent transition test | — |
| AB-06 | Fix Cloud Run deploy script | P1 | M | Infra | `deploy-cloudrun.sh` | Missing env vars + build args | Add `--set-env-vars`, `--build-arg` | Deploy to staging | — |
| AB-07 | Add CSRF / Origin check | P1 | S | Security | `apps/api/src/app.ts` | Cross-site forgery | Check `Origin` header on mutations | Cross-origin POST test | — |
| AB-08 | Standardize error responses | P2 | M | API | All route handlers | Client parsing breaks | Centralize via Fastify error handler | Grep for error patterns | — |
| AB-09 | Add structured logging (Pino) | P2 | M | Observability | Entire API | Unparseable logs in prod | Replace console.* with Fastify logger | Check JSON log output | — |
| AB-10 | Add request correlation IDs | P2 | S | Observability | `apps/api/src/app.ts` | Cannot trace requests | Fastify `request.id` + `X-Request-Id` header | Check response headers | AB-09 |
| AB-11 | Add workflow engine tests | P2 | M | Testing | New test file | Critical path untested | Test transitions, guards, actions | `npm test` | — |
| AB-12 | Fix TypeScript compilation errors | P2 | S | Quality | `fees-payments.ts`, `inspections.ts` | Build warnings | Fix argument count mismatches | `npx tsc --noEmit` | — |
| AB-13 | Add payment gateway_id index | P2 | S | Data | New migration | Duplicate detection perf | `CREATE INDEX` on `payment.gateway_payment_id` | `EXPLAIN ANALYZE` | — |
| AB-14 | Add DB connection retry | P2 | S | Reliability | `apps/api/src/db.ts` | API fails on brief DB downtime | Retry with exponential backoff | Stop/start DB | — |
| AB-15 | Add CSP headers to nginx | P2 | S | Security | `nginx.*.conf` | XSS mitigation | Add `Content-Security-Policy` header | Check response headers | — |
| AB-16 | Stream CSV export | P2 | M | Performance | `applications.ts` | OOM on large exports | Cursor-based streaming | Export 10K+ rows | — |
| AB-17 | Add GIN index for JSONB search | P2 | S | Performance | New migration | Full table scan on search | GIN index on `data_jsonb` | `EXPLAIN ANALYZE` | — |
| AB-18 | Standardize pagination | P2 | M | API | All list routes | Inconsistent behavior | Default 50, max 200, always `{items, total}` | API response check | — |
| AB-19 | Make SLA checker distributed-safe | P2 | M | Reliability | `apps/api/src/sla.ts` | Duplicate notifications | Advisory lock or separate worker | Run 2 instances | — |
| AB-20 | Add nginx health checks | P2 | S | Infra | `Dockerfile.citizen`, `Dockerfile.officer` | No container health | Add `HEALTHCHECK` with `curl` | Docker inspect | — |
| AB-21 | Add i18n to officer portal | P2 | M | Frontend | `apps/officer/` | Cannot localize | Add i18next matching citizen pattern | Check Punjabi rendering | — |
| AB-22 | Standardize CSS breakpoints | P2 | S | Frontend | All CSS files | Inconsistent responsive behavior | Use 3 breakpoints from design system | Visual regression | — |
| AB-23 | Add focus trap to Modal | P2 | S | Frontend | `packages/shared/src/ui.tsx` | Accessibility violation | Trap focus within modal when open | Keyboard test | — |
| AB-24 | Add CI/CD pipeline | P2 | M | Infra | New file | No automated quality gates | GitHub Actions: lint → type → test → build | Push and verify | — |
| AB-25 | Add test coverage reporting | P2 | S | Testing | `vitest.config.ts` | Unknown coverage | Add `--coverage` flag | Run tests, check report | — |

---

## 5. Quick Wins (2 hours) and Stabilization (2 days)

### Quick Wins (5-10 items, under 2 hours)

1. **AB-01**: Fix Dockerfile health check — replace `wget` with `node -e` (5 min)
2. **AB-02**: Sanitize upload filenames — add `path.basename()` + regex (15 min)
3. **AB-04**: Add DB health check to `/health` endpoint (10 min)
4. **AB-05**: Add lock timeout to workflow transitions (5 min)
5. **AB-15**: Add CSP headers to nginx configs (10 min)
6. **AB-20**: Add health checks to frontend Dockerfiles (10 min)
7. **AB-13**: Add `gateway_payment_id` index migration (5 min)
8. **AB-12**: Fix TypeScript compilation errors (15 min)

### 2-Day Stabilization (8-15 items)

1. **AB-03**: Add graceful shutdown handler (1 hr)
2. **AB-06**: Fix Cloud Run deployment script (2 hr)
3. **AB-07**: Add Origin header check for CSRF (1 hr)
4. **AB-08**: Standardize error responses (2 hr)
5. **AB-09**: Replace console.* with Pino structured logging (3 hr)
6. **AB-10**: Add request correlation IDs (1 hr)
7. **AB-11**: Add workflow engine tests (3 hr)
8. **AB-14**: Add DB connection retry with backoff (1 hr)
9. **AB-16**: Stream CSV export (2 hr)
10. **AB-25**: Add test coverage reporting (30 min)

---

## 6. Refactor Proposal

No fundamental architectural misalignment. The modular monolith + JSONB + config-driven workflow is appropriate for this stage. Recommended incremental improvements:

**Phase 1 (current):** Fix security and reliability issues (AB-01 through AB-07)
**Phase 2 (UAT-2):** Add observability (AB-09, AB-10), testing (AB-11, AB-25), CI/CD (AB-24)
**Phase 3 (pre-production):** Extract workflow actions, performance optimization, distributed SLA checker

---

## 7. Commands

```bash
# Run locally
docker compose up -d postgres        # Start DB
npm run dev:api                       # API on :3001
npm run dev:citizen                   # Citizen on :5173
npm run dev:officer                   # Officer on :5174

# Run tests
cd apps/api && npm test               # All tests
cd apps/api && npm run test:authz     # Authorization tests
cd apps/api && npm run test:brd       # BRD tests

# Type check
npx tsc --noEmit -p apps/api/tsconfig.json

# Lint (not configured — add ESLint)
# npm run lint

# Security scan
npm audit                             # Dependency vulnerabilities
# Add: npx snyk test (if Snyk configured)

# Build all
npm run build:all

# Run migrations
cd apps/api && npm run migrate

# Docker build
docker compose build
docker compose up
```

---

## Top 5 Priorities

1. **Fix Dockerfile health check** (AB-01) — containers won't start in orchestrators
2. **Sanitize upload filenames** (AB-02) — path traversal vulnerability
3. **Add graceful shutdown** (AB-03) — request drops on every deploy
4. **Fix Cloud Run deploy script** (AB-06) — deployments are broken
5. **Add workflow engine tests** (AB-11) — critical business logic is untested
