# Changelog

All notable changes to the PUDA Workflow Engine are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Terraform Infrastructure as Code module (`ops/iac/terraform/`)
- GitHub Actions deployment workflow for Cloud Run (`deploy-cloudrun.yml`)
- Advanced SAST pipeline with Semgrep + CodeQL SARIF upload (`security.yml`)
- Runtime adapter preflight check to block stub providers in production
- Local DAST smoke gate (`scripts/run-local-dast-smoke.sh`)
- IaC validation CI job
- Architecture Decision Records (`docs/adr/`)
- Per-app README files for api, citizen, officer
- Service pack documentation (`service-packs/README.md`)
- Shared package documentation (`packages/shared/README.md`)
- `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`

### Changed
- README.md expanded with project overview, prerequisites, test commands, deployment guide, and troubleshooting

## [0.1.0] — UAT-1

### Added

#### Core Platform
- Monorepo structure with npm workspaces (`apps/api`, `apps/citizen`, `apps/officer`, `packages/shared`)
- Declarative service pack configuration system (`service-packs/`)
- Dynamic form renderer driven by service pack `form.json`
- Shared UI component library (`@puda/shared`) — Button, Alert, Field, Modal, Breadcrumb, ProgressBar, SkeletonBlock
- Shared constants, utilities, and Zod-based master data model

#### API Server
- Fastify 5 REST API with OpenAPI 3.1 specification and Swagger UI
- JWT authentication with Argon2 password hashing
- Aadhaar OTP-based citizen authentication
- Role-based access control (RBAC) scoped by authority
- Dual JWT revocation — per-token denylist and user-wide cutoff timestamp
- MFA step-up for officer decision actions (SMS/email delivery)
- Workflow engine with pessimistic locking (`SELECT ... FOR UPDATE`, 5s lock timeout) and optimistic concurrency (`row_version`)
- Tamper-evident audit chain (SHA-256 hash linking)
- Fee calculation engine with service-pack-driven schedules
- Payment gateway abstraction with stub and Razorpay adapters
- Document upload, storage, and metadata management
- Physical inspection recording
- SLA checker background job with breach detection
- Notification engine with email (Nodemailer) and SMS transports
- Output document generation (PDFKit + QR codes)
- Feature flag engine with local and Redis-backed distributed caching
- PII redaction in structured JSON logs

#### Citizen Portal
- React 18 SPA with Vite build
- Apply for services, save drafts, submit, track status
- Document upload with real-time progress tracking
- i18n support — English, Punjabi, Hindi
- Dark/light theme with responsive design
- Toast notifications, skeleton loaders, breadcrumb navigation
- Form progress indicator, on-blur validation
- Unsaved changes guard (`beforeunload`)
- React lazy loading with Suspense for code splitting
- Error boundary with Sentry integration

#### Officer Portal
- React 18 SPA with Vite build
- Task inbox with filtering by role and authority
- Application review, approve/reject/query/forward
- Search by ARN, applicant name, status
- Toast notifications, skeleton loaders, code splitting
- Error boundary with Sentry integration

#### Observability
- Prometheus metrics endpoint (`/metrics`) — HTTP latency, DB pool, workflow backlog
- OpenTelemetry tracing with OTLP export
- Structured JSON logging with request ID and trace correlation
- Health probes — `/health` (liveness), `/ready` (readiness)
- SLO definitions with PromQL queries and alert-to-runbook mapping
- Prometheus burn-rate alert rules
- Grafana dashboard
- Incident runbooks (auth outage, DB degradation, workflow stuck, canary rollback)

#### Security
- Hardened Nginx security headers (CSP, HSTS, COOP, COEP)
- Rate limiting on all API endpoints
- OpenAPI contract quality checks (security scheme coverage)
- SAST scanning (Semgrep + CodeQL)
- DAST scanning (OWASP ZAP baseline + local smoke)
- Dependency audit in CI
- Non-root Docker containers

#### CI/CD
- GitHub Actions CI with 18 jobs — build, typecheck, test, lint, OpenAPI, security, performance budgets, E2E, DAST, IaC
- Frontend bundle size budget tracking with regression detection
- E2E test job with Playwright (accessibility + resilience)
- Cloud Run deployment workflow with canary support

#### Infrastructure
- Docker Compose for local full-stack development
- Dockerfiles for API, citizen portal, officer portal
- Nginx reverse proxy configuration with security headers
- Cloud Run deployment scripts with Secret Manager integration
- Canary deployment helper script

#### Database
- PostgreSQL 15 with 20 sequential migration files
- Complete schema: applications, users, tasks, documents, fees, payments, inspections, decisions, audit events, feature flags, MFA challenges, JWT denylist, OTP lockouts
