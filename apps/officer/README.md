# @puda/officer — Officer Workbench

The internal React single-page application for PUDA officers to process citizen applications. Officers use this portal to manage their task inbox, review applications, approve/reject/query, record inspections, and track workload.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 |
| Build | Vite 6 |
| Language | TypeScript 5.7 |
| Shared UI | `@puda/shared` (form renderer, UI components) |
| Error reporting | Sentry (optional, via `VITE_SENTRY_DSN`) |

## Features

### Task Management

- **Inbox**: Filterable list of pending tasks assigned to the officer's role and authority.
- **Task detail**: Full application view with form data, documents, timeline, and fee status.
- **Claim task**: Officer claims a pending task from the pool to begin processing.
- **Search**: Search applications by ARN (Application Reference Number), applicant name, or status.

### Decision Actions

- **Approve**: Advance application to the next workflow stage.
- **Reject**: Reject with mandatory remarks.
- **Raise query**: Send a query back to the citizen with specific questions.
- **Forward**: Route to the next officer in the workflow chain.

### MFA Step-Up

When `OFFICER_MFA_REQUIRED_ON_DECISION` is enabled, approve/reject actions require a one-time MFA verification code delivered via SMS or email. This prevents unauthorized decisions even if a session is compromised.

### Role Model

Officers are assigned one or more roles scoped to an authority:

| Role | Responsibility |
|------|---------------|
| `CLERK` | Initial scrutiny, document verification |
| `PUDA_SR_ASST` | Senior assistant — accounts review |
| `ACCOUNT_OFFICER` | Fee verification and financial approval |
| `JUNIOR_ENGINEER` | Technical site inspection |
| `SDO` | Sub-divisional officer — technical approval |
| `DRAFTSMAN` | Drawing/plan verification |
| `ADMIN` | System administration, feature flags, user management |

Task routing is determined by the workflow definition in each service pack. The officer only sees tasks matching their roles and authority.

### UX

- **Toast notifications**: Feedback for claim, approve, reject, query actions.
- **Skeleton loaders**: Content-shaped loading states.
- **Code splitting**: React lazy loading for inbox, task detail, and search panels.
- **Error boundary**: Catches and reports runtime errors.

## Directory Structure

```
apps/officer/
├── src/
│   ├── main.tsx           # Entry point (ErrorBoundary, ToastProvider)
│   ├── App.tsx            # Root component, inbox/detail/search views
│   ├── ErrorBoundary.tsx  # React error boundary
│   ├── design-system.css  # Shared component styles
│   └── app.css
├── index.html
├── vite.config.ts
└── package.json
```

## Running Locally

```bash
# From repo root
npm run dev:officer    # Starts on http://localhost:5174

# Or directly
cd apps/officer
npx vite
```

The portal expects the API on `http://localhost:3001`.

## Building for Production

```bash
cd apps/officer
npx vite build
```

Output goes to `dist/`. Served via Nginx in production (see `Dockerfile.officer` and `nginx.officer.conf`).

## Environment Variables (Build-Time)

| Variable | Purpose |
|----------|---------|
| `VITE_API_BASE_URL` | API server URL |
| `VITE_SENTRY_DSN` | Sentry error reporting DSN (optional) |
