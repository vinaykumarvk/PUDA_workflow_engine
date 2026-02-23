# PUDA Workflow Engine

A configurable workflow engine for Punjab Urban Development Authority (PUDA) and allied bodies (GMADA, GLADA, BDA). It powers citizen-facing permit/certificate applications, officer task processing, fee/payment handling, document management, and end-to-end lifecycle tracking — from submission through inspection and approval to output generation.

## Architecture Overview

```
┌──────────────┐   ┌──────────────┐
│ Citizen Portal│   │Officer Portal│   React 18 + Vite SPAs
│  (port 5173) │   │  (port 5174) │   i18n (EN/PA/HI), dark/light theme
└──────┬───────┘   └──────┬───────┘
       │                  │
       └──────┬───────────┘
              ▼
     ┌────────────────┐
     │   Fastify API   │   REST + OpenAPI 3.1 + Swagger UI
     │   (port 3001)   │   JWT auth, RBAC, MFA step-up
     └───────┬─────────┘
             │
    ┌────────┴────────┐
    ▼                 ▼
┌────────┐    ┌──────────────┐
│Postgres│    │Service Packs │  YAML/JSON config per service type
│  (5433)│    │ (file system)│  (form, workflow, fees, docs, rules)
└────────┘    └──────────────┘
```

The system is a **monorepo** managed via npm workspaces:

| Workspace | Purpose |
|-----------|---------|
| `apps/api` | Fastify REST API — workflow engine, auth, payments, notifications |
| `apps/citizen` | Citizen-facing React SPA — apply, track, upload, pay |
| `apps/officer` | Officer/admin React SPA — inbox, review, approve/reject |
| `packages/shared` | Shared TypeScript types, UI components, form renderer, constants |
| `service-packs/` | Declarative per-service configuration (forms, workflows, fees) |

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Node.js** | 20 LTS+ | Required for all workspaces |
| **npm** | 10+ | Ships with Node 20; workspace support needed |
| **Docker** | 24+ | For PostgreSQL (and optional full-stack compose) |
| **Docker Compose** | v2+ | `docker compose` (v2 CLI) |
| **PostgreSQL client** | 15+ | `psql` for running migrations manually |

Optional: `terraform` CLI for IaC validation, `semgrep` for SAST scans, `playwright` for E2E tests.

## Quick Start

### 1. Clone and install

```bash
git clone <repo-url>
cd PUDA_workflow_engine
npm install
```

### 2. Start PostgreSQL

```bash
docker compose up -d
```

This starts Postgres on **host port 5433** (container 5432) with database `puda`.

### 3. Configure environment

```bash
cp .env.example .env
```

Defaults work for local development. See [Environment Variables](#environment-variables) for production settings.

### 4. Run database migrations

```bash
psql postgres://puda:puda@localhost:5433/puda -f apps/api/migrations/001_init.sql
psql postgres://puda:puda@localhost:5433/puda -f apps/api/migrations/002_complete_schema.sql
psql postgres://puda:puda@localhost:5433/puda -f apps/api/migrations/003_add_public_arn.sql
```

Or run all at once:

```bash
for f in apps/api/migrations/*.sql; do psql postgres://puda:puda@localhost:5433/puda -f "$f"; done
```

### 5. Seed test data

```bash
npm --workspace apps/api run seed
```

Creates test users: **citizen1** / **officer1** with password **password123**.
Officer has CLERK, SENIOR_ASSISTANT, and ACCOUNT_OFFICER roles for PUDA.

### 6. Start development servers

```bash
npm run dev:api       # API on http://localhost:3001
npm run dev:citizen   # Citizen portal on http://localhost:5173
npm run dev:officer   # Officer portal on http://localhost:5174
```

### 7. Explore the API

- OpenAPI JSON: http://localhost:3001/api/v1/openapi.json
- Swagger UI: http://localhost:3001/docs

## Running Tests

```bash
# API unit + integration tests
npm run test:api

# Critical-path tests (workflow + payments)
npm --workspace apps/api run test:critical

# Feature-flag integration tests
npm --workspace apps/api run test:feature-flags

# Authorization matrix tests
npm --workspace apps/api run test:authz

# BRD acceptance tests
npm --workspace apps/api run test:brd

# Citizen portal unit tests
npm run test:citizen:unit

# API load smoke test
npm run test:api:load

# E2E tests (requires Playwright browsers)
npx playwright install --with-deps chromium
npm run test:e2e:a11y
npm run test:e2e:resilience
```

## Quality Gates

These gates run in CI and can be executed locally:

```bash
# OpenAPI drift + contract quality
npm --workspace apps/api run check:openapi
npm --workspace apps/api run check:openapi:contracts

# Runtime adapter preflight (stub safety for production)
npm --workspace apps/api run preflight:runtime-adapters

# Frontend bundle size budgets
npm run build:citizen && npm run build:officer && npm run check:frontend-budgets

# Observability artifact validation (SLOs, alerts, dashboards, runbooks)
npm run check:observability

# SLO burn-rate alert rule tests
npm run check:slo-alerts

# IaC validation (Terraform)
npm run check:iac

# Security: dependency audit
npm audit --omit=dev --audit-level=high

# Security: SAST (Semgrep)
semgrep --config p/owasp-top-ten --config p/nodejs --config p/secrets --error

# Security: local DAST smoke
npm run test:api:dast:local
```

## Docker Compose (Full Stack)

Run all services in containers:

```bash
docker compose up --build
```

| Service | Host Port | Description |
|---------|-----------|-------------|
| `postgres` | 5433 | PostgreSQL 15 |
| `api` | 3001 | Fastify API server |
| `citizen` | 3002 | Citizen portal (Nginx) |
| `officer` | 3003 | Officer portal (Nginx) |

## Deployment

### Cloud Run (Production)

The project includes Terraform IaC in `ops/iac/terraform/` and a GitHub Actions deployment workflow at `.github/workflows/deploy-cloudrun.yml`.

Manual canary deployment:

```bash
./scripts/deploy-cloudrun-canary.sh puda-api gcr.io/<project>/puda-api:<tag> <project> asia-south1 10
```

Fast rollback steps are documented in `ops/runbooks/canary-rollback.md`.

### Environment Variables

Copy `.env.example` and configure for your environment. Key variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | (see .env.example) | PostgreSQL connection string |
| `JWT_SECRET` | Yes (prod) | dev placeholder | HMAC secret for JWT signing |
| `ALLOWED_ORIGINS` | Yes (prod) | localhost | CORS allowed origins |
| `PAYMENT_GATEWAY_PROVIDER` | No | `stub` | `stub` or `razorpay` |
| `EMAIL_PROVIDER` | No | `stub` | `stub` or `smtp` |
| `SMS_PROVIDER` | No | `stub` | `stub` (extensible) |
| `OTEL_ENABLED` | No | `true` | OpenTelemetry tracing toggle |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | — | OTLP collector URL |

See `.env.example` for the complete list with descriptions.

## Observability

- **Prometheus metrics**: `GET /metrics` — HTTP latency, DB pool, workflow backlog gauges
- **OpenTelemetry traces**: OTLP export when `OTEL_EXPORTER_OTLP_ENDPOINT` is set
- **Structured JSON logs**: request IDs, trace/span correlation, PII redaction
- **Health probes**: `GET /health` (liveness), `GET /ready` (readiness — checks DB)

Operational artifacts:

| Artifact | Path |
|----------|------|
| SLO definitions | `ops/observability/SLOs.md` |
| Prometheus alert rules | `ops/observability/prometheus-alerts.yml` |
| Grafana dashboard | `ops/observability/grafana-dashboard.puda-api.json` |
| Runbook: auth outage | `ops/runbooks/auth-outage.md` |
| Runbook: DB degradation | `ops/runbooks/db-degradation.md` |
| Runbook: workflow stuck | `ops/runbooks/workflow-stuck-states.md` |
| Runbook: canary rollback | `ops/runbooks/canary-rollback.md` |

## Security

- JWT authentication with per-token denylist and user-wide cutoff revocation
- MFA step-up for officer decision actions (configurable)
- Tamper-evident audit chain (SHA-256 hash linking)
- RBAC with authority-scoped officer roles
- Hardened CSP, HSTS, COOP/COEP headers (Nginx)
- Runtime adapter preflight prevents stub providers in production
- SAST (Semgrep + CodeQL) and DAST (OWASP ZAP) in CI

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Service Packs

Each service type (building permission, no-due certificate, etc.) is defined by a declarative configuration pack under `service-packs/`. See [service-packs/README.md](service-packs/README.md) for the full specification.

## Project Structure

```
PUDA_workflow_engine/
├── apps/
│   ├── api/            # Fastify REST API
│   ├── citizen/        # Citizen React SPA
│   └── officer/        # Officer React SPA
├── packages/
│   └── shared/         # Shared types, UI, form renderer
├── service-packs/      # Declarative service configs
├── e2e/                # Playwright E2E tests
├── ops/
│   ├── iac/terraform/  # Infrastructure as Code
│   ├── observability/  # SLOs, alerts, dashboards
│   └── runbooks/       # Incident response runbooks
├── scripts/            # Build, check, deploy scripts
├── .github/workflows/  # CI/CD pipelines
├── docker-compose.yml  # Local full-stack environment
└── docs/adr/           # Architecture Decision Records
```

## Troubleshooting

**Port 5433 already in use**: Stop any local Postgres or change the port mapping in `docker-compose.yml`.

**Migration fails with "relation already exists"**: Migrations are not idempotent by default. If re-running, drop and recreate the database: `docker compose down -v && docker compose up -d`.

**`Cannot find module '@puda/shared'`**: Run `npm install` from the repo root to link workspaces.

**Vite build fails with "Could not resolve entry module"**: Run build commands from within the app directory (`cd apps/citizen && npx vite build`), not from the repo root.

**TypeScript errors with `import.meta`**: These are expected when running `tsc --noEmit` from the root; Vite handles these at build time.

**Tests hang on DB connection**: Ensure Postgres is running (`docker compose ps`) and `DATABASE_URL` is set correctly.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, code style, and PR guidelines.

## License

This project is proprietary to PUDA. See project governance for usage terms.
