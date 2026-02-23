# @puda/api — REST API Server

The backend API for the PUDA Workflow Engine, built with [Fastify](https://fastify.dev/) and TypeScript. It manages the full application lifecycle: authentication, service-pack loading, form submission, workflow transitions, fee/payment processing, document management, inspections, notifications, and output generation.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20, TypeScript 5.7 |
| Framework | Fastify 5 |
| Database | PostgreSQL 15 (via `pg`) |
| Auth | JWT (jsonwebtoken), Argon2 password hashing |
| Observability | OpenTelemetry (traces), prom-client (Prometheus metrics) |
| Caching | Redis (optional, for distributed feature-flag cache) |
| File storage | Local filesystem (configurable path) |
| PDF generation | PDFKit + QR codes |
| Email | Nodemailer (stub/SMTP adapters) |

## Directory Structure

```
apps/api/
├── src/
│   ├── index.ts              # Server entry point, graceful shutdown
│   ├── app.ts                # Fastify app setup, plugin registration
│   ├── db.ts                 # PostgreSQL connection pool
│   ├── routes/               # Route handlers (one file per domain)
│   │   ├── auth.routes.ts    # Login, logout, OTP, MFA
│   │   ├── application.routes.ts
│   │   ├── task.routes.ts
│   │   ├── decision.routes.ts
│   │   ├── document.routes.ts
│   │   ├── fee.routes.ts
│   │   ├── inspection.routes.ts
│   │   ├── communication.routes.ts
│   │   ├── property.routes.ts
│   │   ├── profile.routes.ts
│   │   ├── admin.routes.ts   # Feature flags, user management
│   │   └── telemetry.routes.ts
│   ├── middleware/            # Auth guards, RBAC, rate limiting
│   ├── workflow.ts            # State machine engine (pessimistic + optimistic locking)
│   ├── token-security.ts      # JWT denylist + cutoff revocation
│   ├── mfa-stepup.ts          # Officer MFA challenge/verify
│   ├── audit-chain.ts         # Tamper-evident SHA-256 audit chain
│   ├── feature-flags.ts       # Feature flag engine (local + distributed cache)
│   ├── logger.ts              # Structured JSON logger with PII redaction
│   ├── service-packs.ts       # Service pack YAML/JSON loader
│   ├── observability/
│   │   ├── metrics.ts         # Prometheus histograms and gauges
│   │   └── tracing.ts         # OpenTelemetry SDK setup
│   ├── providers/
│   │   ├── payment-gateway.ts # Payment abstraction (stub + Razorpay)
│   │   └── redis-cache.ts     # Redis distributed cache adapter
│   └── transports/
│       ├── email.ts           # Email transport (stub + SMTP)
│       └── sms.ts             # SMS transport (stub + extensible)
├── migrations/                # Sequential SQL migration files (001–020)
├── scripts/
│   ├── migrate.ts             # Migration runner
│   ├── seed.ts                # Test data seeder
│   ├── check-openapi.ts       # OpenAPI drift checker
│   ├── check-openapi-contract.ts
│   ├── check-endpoint-matrix.ts
│   ├── load-smoke.ts          # Autocannon load test
│   ├── verify-audit-chain.ts
│   └── preflight-runtime-adapters.ts
└── vitest.config.ts / vitest.critical.config.ts
```

## Running Locally

```bash
# From repo root
npm run dev:api          # Watch mode (tsx watch)

# Or directly
cd apps/api
npx tsx watch src/index.ts
```

The server starts on `http://localhost:3001` (configurable via `API_PORT`).

## API Endpoints

### Public (no auth)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/login` | Authenticate (returns JWT) |
| POST | `/api/v1/auth/otp/request` | Request Aadhaar OTP |
| POST | `/api/v1/auth/otp/verify` | Verify OTP and login |
| GET | `/api/v1/services` | List available service types |
| GET | `/health` | Liveness probe |
| GET | `/ready` | Readiness probe (checks DB) |
| GET | `/metrics` | Prometheus metrics |

### Citizen (requires JWT)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/applications` | Create new application |
| GET | `/api/v1/applications` | List my applications |
| GET | `/api/v1/applications/:id` | Get application detail |
| PUT | `/api/v1/applications/:id` | Update draft application |
| POST | `/api/v1/applications/:id/submit` | Submit application |
| POST | `/api/v1/applications/:id/documents` | Upload document |
| POST | `/api/v1/applications/:id/fees/pay` | Initiate payment |
| POST | `/api/v1/applications/:id/query-response` | Respond to query |

### Officer (requires JWT + role)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/tasks` | Officer task inbox |
| GET | `/api/v1/tasks/:id` | Task detail |
| POST | `/api/v1/tasks/:id/claim` | Claim a task |
| POST | `/api/v1/decisions` | Record decision (approve/reject/query) |
| POST | `/api/v1/inspections` | Record inspection result |

### Admin

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/admin/feature-flags` | List feature flags |
| PUT | `/api/v1/admin/feature-flags/:key` | Update feature flag |
| POST | `/api/v1/admin/users/:userId/force-logout` | Force logout user |

Full specification is available at `http://localhost:3001/docs` (Swagger UI) when `ENABLE_API_DOCS` is enabled.

## Testing

```bash
npm test                     # All tests (vitest run)
npm run test:critical        # Workflow + payments critical path
npm run test:authz           # Authorization matrix
npm run test:brd             # BRD acceptance tests
npm run test:feature-flags   # Feature flag integration
npm run test:load            # Autocannon load smoke
npm run test:watch           # Watch mode
```

## Database Migrations

Migrations are applied sequentially via `psql`:

```bash
npm run migrate
```

Or manually:

```bash
psql $DATABASE_URL -f migrations/001_init.sql
```

Current migrations: `001_init.sql` through `020_audit_chain_linearized_insert_order.sql`.

## Key Design Decisions

- **Pessimistic locking**: Workflow transitions use `SELECT ... FOR UPDATE` with `lock_timeout = 5s` to prevent concurrent mutations on the same application.
- **Optimistic concurrency**: All application updates carry a `row_version` column to detect stale writes.
- **Provider abstraction**: Payment, email, and SMS integrations use a provider interface with stub implementations for development. The runtime adapter preflight blocks stubs in production.
- **Service-pack-driven**: Forms, workflows, fees, document requirements, and notification templates are loaded from declarative YAML/JSON files — no code changes needed to add a new service type.

See [`docs/adr/`](../../docs/adr/) for detailed Architecture Decision Records.
