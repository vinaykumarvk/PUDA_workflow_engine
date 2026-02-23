# Contributing to PUDA Workflow Engine

Thank you for contributing. This guide covers the development workflow, code conventions, and pull-request process.

## Prerequisites

Before you begin, ensure you have the tools listed in [README.md — Prerequisites](README.md#prerequisites).

## Getting Started

```bash
git clone <repo-url>
cd PUDA_workflow_engine
npm install
cp .env.example .env
docker compose up -d
```

Run migrations and seed data as described in the [Quick Start](README.md#quick-start).

## Development Workflow

### Branching Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready code. Protected — requires PR review. |
| `feature/<name>` | New features (e.g., `feature/razorpay-integration`) |
| `fix/<name>` | Bug fixes (e.g., `fix/workflow-deadlock`) |
| `chore/<name>` | Maintenance tasks (e.g., `chore/upgrade-fastify`) |

Always branch from `main`:

```bash
git checkout main && git pull
git checkout -b feature/your-feature-name
```

### Making Changes

1. **One concern per PR** — keep changes focused and reviewable.
2. **Write tests** for new API routes, workflow transitions, and bug fixes.
3. **Run the quality gates** locally before pushing (see below).
4. **Update documentation** if your change affects public APIs, env vars, or service-pack schemas.

### Local Quality Checks

Run these before opening a PR:

```bash
# Type-check
npx tsc --noEmit -p apps/api/tsconfig.json

# API tests
npm run test:api

# OpenAPI contract
npm --workspace apps/api run check:openapi
npm --workspace apps/api run check:openapi:contracts

# Frontend builds + bundle budgets
npm run build:citizen && npm run build:officer && npm run check:frontend-budgets

# Security audit
npm audit --omit=dev --audit-level=high
```

## Code Style

### TypeScript

- **Strict mode** enabled (`strict: true` in tsconfig).
- Prefer `const` over `let`; never use `var`.
- Use explicit return types on exported functions.
- Use `type` imports when importing only types: `import type { Foo } from "./foo"`.
- Prefer named exports over default exports (except for React page components).

### File Naming

| Type | Convention | Example |
|------|-----------|---------|
| Source files | `kebab-case.ts` | `feature-flags.ts` |
| Test files | `<name>.test.ts` | `feature-flags.integration.test.ts` |
| React components | `PascalCase.tsx` | `ApplicationDetail.tsx` |
| Migrations | `NNN_description.sql` | `015_jwt_revocation.sql` |
| Service pack files | `snake_case/` | `no_due_certificate/` |

### API Routes

- All routes are prefixed with `/api/v1/`.
- Use `operationId` in OpenAPI decorations.
- Every protected route must specify required roles.
- Return consistent error shapes via the shared error handler.

### Commit Messages

Use conventional-style messages:

```
feat: add Razorpay payment gateway adapter
fix: prevent workflow deadlock on concurrent transitions
chore: upgrade Fastify to 5.7.4
docs: add service-pack configuration guide
test: add MFA step-up integration tests
```

Keep the subject line under 72 characters. Add a body for non-trivial changes explaining *why*, not *what*.

## Pull Request Process

1. **Create a PR** against `main` with a clear title and description.
2. **Fill in the PR template** — summarize changes, link related issues, and describe how to test.
3. **CI must pass** — all quality gates, tests, and security scans run automatically.
4. **Request review** from at least one team member.
5. **Address feedback** — push fixup commits, then squash on merge.
6. **Merge** via "Squash and merge" to keep `main` history clean.

## Adding a New Service Pack

See [service-packs/README.md](service-packs/README.md) for the schema and step-by-step guide.

## Adding a New API Route

1. Add the route handler in `apps/api/src/`.
2. Register it in `apps/api/src/app.ts`.
3. Add OpenAPI schema decorations.
4. Write integration tests.
5. Run `npm --workspace apps/api run check:openapi -- --update` to update the baseline.
6. Run `npm --workspace apps/api run check:openapi:contracts` to verify contract quality.

## Database Migrations

Migrations live in `apps/api/migrations/` and are numbered sequentially:

```
001_init.sql
002_complete_schema.sql
...
020_audit_chain_linearized_insert_order.sql
```

To add a migration:

1. Create `NNN_description.sql` with the next available number.
2. Write idempotent SQL where possible (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
3. Test locally: `psql $DATABASE_URL -f apps/api/migrations/NNN_description.sql`.
4. Update the seed script if new reference data is needed.

## Questions?

Open an issue or reach out to the project maintainers.
