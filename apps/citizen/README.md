# @puda/citizen — Citizen Portal

The public-facing React single-page application for citizens to apply for PUDA services, track application status, upload documents, and make payments.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 |
| Build | Vite 6 |
| Language | TypeScript 5.7 |
| i18n | i18next + react-i18next |
| Shared UI | `@puda/shared` (form renderer, UI components) |
| Error reporting | Sentry (optional, via `VITE_SENTRY_DSN`) |

## Features

### Application Lifecycle

- **Create application**: Select a service type, fill in the dynamic form (driven by service-pack config), upload required documents, and submit.
- **Save draft**: Partial applications can be saved and resumed later.
- **Track status**: View submitted applications with real-time status, timeline, and assigned officer.
- **Respond to queries**: When an officer raises a query, citizens can respond with additional information or documents.
- **Payment**: Initiate fee payment and track payment status.

### UX Enhancements

- **Toast notifications**: Non-blocking feedback for actions (submit, save, upload).
- **Skeleton loaders**: Loading states that mirror content layout instead of spinners.
- **Breadcrumb navigation**: Contextual wayfinding across views.
- **Form progress indicator**: Multi-page forms show completion percentage.
- **On-blur validation**: Fields validate immediately when focus leaves, before form submission.
- **Upload progress**: Real-time progress bar during document upload.
- **Unsaved changes guard**: Browser `beforeunload` warning when navigating away from dirty forms.
- **Relative timestamps**: "2 hours ago" format with full date on hover.
- **Code splitting**: React lazy loading with Suspense for route-level components.
- **Error boundary**: Catches and reports runtime errors with a user-friendly fallback.

### Internationalization (i18n)

Three languages are supported out of the box:

| Code | Language |
|------|----------|
| `en` | English |
| `pa` | Punjabi (ਪੰਜਾਬੀ) |
| `hi` | Hindi (हिन्दी) |

Language can be switched at runtime via the language selector. All UI strings are externalized in `src/i18n.ts`.

### Theming

- Dark and light mode support via CSS custom properties.
- Responsive design for mobile, tablet, and desktop.
- Reduced-motion preference is respected.

## Directory Structure

```
apps/citizen/
├── src/
│   ├── main.tsx              # Entry point (ErrorBoundary, ToastProvider, AuthProvider)
│   ├── App.tsx               # Root component, routing, view switching
│   ├── AuthContext.tsx        # JWT authentication context
│   ├── ApplicationDetail.tsx  # Application detail view with timeline
│   ├── ErrorBoundary.tsx      # React error boundary
│   ├── i18n.ts               # i18next setup with EN/PA/HI translations
│   ├── app.css               # Global styles, form progress
│   ├── design-system.css     # Shared component styles (toasts, breadcrumbs, etc.)
│   └── application-detail.css
├── index.html
├── vite.config.ts
└── package.json
```

## Running Locally

```bash
# From repo root
npm run dev:citizen    # Starts on http://localhost:5173

# Or directly
cd apps/citizen
npx vite
```

The portal expects the API to be running on `http://localhost:3001` (default Vite proxy config).

## Building for Production

```bash
cd apps/citizen
npx vite build
```

Output goes to `dist/`. Served via Nginx in production (see `Dockerfile.citizen` and `nginx.citizen.conf` at the repo root).

## Testing

```bash
npm run test:citizen:unit    # Vitest unit tests
```

E2E tests (accessibility and resilience) are in the `e2e/` directory at the repo root.

## Environment Variables (Build-Time)

| Variable | Purpose |
|----------|---------|
| `VITE_API_BASE_URL` | API server URL (default: inferred from Vite dev server proxy) |
| `VITE_SENTRY_DSN` | Sentry error reporting DSN (optional) |

## Adding a New Translation Key

1. Add the English key in `src/i18n.ts` under the `en` object.
2. Add the corresponding Punjabi translation in the `pa` object.
3. Add the corresponding Hindi translation in the `hi` object.
4. Use it in components: `const { t } = useTranslation(); t('your_key')`.
