# Endpoint Matrix Recheck + Delta Report

Date: 2026-02-21
Scope: `apps/api/src/app.ts` + all route modules in `apps/api/src/routes/*.ts`
Baseline compared against:
- `AUTHZ_OFFICER_SCOPE_MATRIX.md`
- `FIX_PLAN.md`
- `API_SERVER_SIDE_GUARDS_VALIDATION.md`

## 1) Recheck Method

1. Enumerated all registered endpoints from code (method + path + file + line).
2. Re-read route handlers and shared access helpers:
   - `apps/api/src/app.ts`
   - `apps/api/src/route-access.ts`
   - `apps/api/src/policy.ts`
   - `apps/api/src/tasks.ts`
   - `apps/api/src/inspections.ts`
   - `apps/api/src/notification-log.ts`
   - `apps/api/src/properties.ts`
3. Re-ran verification commands:
   - `npm --workspace apps/api run build` (pass)
   - `npm --workspace apps/api run test -- src/policy.test.ts src/route-access.test.ts src/auth.otp.test.ts` (policy/route-access pass; OTP tests skipped due DB unavailable)
   - `npm --workspace apps/api run test -- src/authz.integration.test.ts` (all skipped due DB unavailable)

## 2) System-Level Guard Posture (Current)

1. Global mutation strict-schema guard is active in `buildApp`:
   - `apps/api/src/app.ts:123`
   - Rejects mutation routes missing strict body schema unless explicit opt-out.
2. Global GET strict param/query guard is active in `buildApp`:
   - `apps/api/src/app.ts:145`
   - Strict params required for GET routes with `:` or `*` path params.
   - Strict query enforced for listed endpoints via `GET_ROUTES_REQUIRING_STRICT_QUERY_SCHEMA` (`apps/api/src/app.ts:58`).
3. Shared authz helper usage remains broad in routes:
   - `requireApplicationReadAccess`: 31 call sites
   - `requireApplicationStaffMutationAccess`: 14 call sites
   - `requireCitizenOwnedApplicationAccess`: 4 call sites
   - `requireAuthorityStaffAccess`: 9 call sites
   - `requireValidAuthorityId`: 10 call sites

## 3) Full Endpoint Matrix (81 Endpoints)

Summary counts:
- Total: 81
- `GET`: 50
- `POST`: 19
- `PUT`: 2
- `PATCH`: 9
- `DELETE`: 1
- Public (no auth required): 9
- Authenticated: 72

### Public Endpoints (9)

- `GET /health` (`apps/api/src/app.ts:198`)
- `GET /api/v1/config/services` (`apps/api/src/app.ts:201`)
- `GET /api/v1/config/services/:serviceKey` (`apps/api/src/app.ts:206`)
- `POST /api/v1/auth/login` (`apps/api/src/routes/auth.routes.ts:91`)
- `POST /api/v1/auth/register` (`apps/api/src/routes/auth.routes.ts:102`)
- `POST /api/v1/auth/aadhar/send-otp` (`apps/api/src/routes/auth.routes.ts:121`)
- `POST /api/v1/auth/aadhar/verify-otp` (`apps/api/src/routes/auth.routes.ts:132`)
- `POST /api/v1/auth/forgot-password` (`apps/api/src/routes/auth.routes.ts:147`)
- `POST /api/v1/auth/reset-password` (`apps/api/src/routes/auth.routes.ts:156`)

### Authenticated Endpoints (72)

#### Auth/Profile
- `GET /api/v1/auth/me/postings` (`apps/api/src/routes/auth.routes.ts:163`)
- `GET /api/v1/profile/me` (`apps/api/src/routes/profile.routes.ts:6`)

#### Applications/Notifications
- `POST /api/v1/applications` (`apps/api/src/routes/application.routes.ts:299`)
- `GET /api/v1/applications` (`apps/api/src/routes/application.routes.ts:323`)
- `GET /api/v1/applications/stats` (`apps/api/src/routes/application.routes.ts:333`)
- `GET /api/v1/applications/pending-actions` (`apps/api/src/routes/application.routes.ts:339`)
- `GET /api/v1/applications/search` (`apps/api/src/routes/application.routes.ts:345`)
- `GET /api/v1/applications/export` (`apps/api/src/routes/application.routes.ts:364`)
- `GET /api/v1/notifications` (`apps/api/src/routes/application.routes.ts:389`)
- `PUT /api/v1/notifications/:notificationId/read` (`apps/api/src/routes/application.routes.ts:404`)
- `PUT /api/v1/applications/*` (`apps/api/src/routes/application.routes.ts:420`)
- `POST /api/v1/applications/*` (`apps/api/src/routes/application.routes.ts:458`)
- `GET /api/v1/applications/*` (`apps/api/src/routes/application.routes.ts:521`)

#### Tasks
- `GET /api/v1/tasks/inbox` (`apps/api/src/routes/task.routes.ts:84`)
- `POST /api/v1/tasks/:taskId/assign` (`apps/api/src/routes/task.routes.ts:120`)
- `POST /api/v1/tasks/:taskId/actions` (`apps/api/src/routes/task.routes.ts:137`)

#### Property
- `GET /api/v1/properties/search` (`apps/api/src/routes/property.routes.ts:77`)
- `GET /api/v1/properties/by-upn` (`apps/api/src/routes/property.routes.ts:112`)
- `GET /api/v1/properties/:propertyId` (`apps/api/src/routes/property.routes.ts:139`)
- `GET /api/v1/properties/:propertyId/applications` (`apps/api/src/routes/property.routes.ts:160`)
- `GET /api/v1/application-property/*` (`apps/api/src/routes/property.routes.ts:187`)

#### Documents
- `POST /api/v1/documents/upload` (`apps/api/src/routes/document.routes.ts:26`)
- `GET /api/v1/documents/:docId` (`apps/api/src/routes/document.routes.ts:89`)
- `GET /api/v1/documents/:docId/download` (`apps/api/src/routes/document.routes.ts:105`)

#### Inspections
- `GET /api/v1/inspections/my-queue` (`apps/api/src/routes/inspection.routes.ts:142`)
- `GET /api/v1/inspections/for-application/*` (`apps/api/src/routes/inspection.routes.ts:196`)
- `GET /api/v1/inspections/for-task/:taskId` (`apps/api/src/routes/inspection.routes.ts:220`)
- `GET /api/v1/inspections/:inspectionId` (`apps/api/src/routes/inspection.routes.ts:239`)
- `POST /api/v1/inspections` (`apps/api/src/routes/inspection.routes.ts:259`)
- `PATCH /api/v1/inspections/:inspectionId/assign` (`apps/api/src/routes/inspection.routes.ts:299`)
- `PATCH /api/v1/inspections/:inspectionId/complete` (`apps/api/src/routes/inspection.routes.ts:344`)
- `PATCH /api/v1/inspections/:inspectionId/cancel` (`apps/api/src/routes/inspection.routes.ts:394`)

#### Fees/Payments/Refunds
- `POST /api/v1/fees/assess` (`apps/api/src/routes/fee.routes.ts:222`)
- `GET /api/v1/fees/line-items/*` (`apps/api/src/routes/fee.routes.ts:261`)
- `POST /api/v1/fees/demands` (`apps/api/src/routes/fee.routes.ts:283`)
- `GET /api/v1/fees/demands/for-application/*` (`apps/api/src/routes/fee.routes.ts:316`)
- `GET /api/v1/fees/demands/pending/*` (`apps/api/src/routes/fee.routes.ts:334`)
- `GET /api/v1/fees/demands/:demandId` (`apps/api/src/routes/fee.routes.ts:352`)
- `PATCH /api/v1/fees/demands/:demandId/waive` (`apps/api/src/routes/fee.routes.ts:367`)
- `PATCH /api/v1/fees/demands/:demandId/cancel` (`apps/api/src/routes/fee.routes.ts:391`)
- `POST /api/v1/payments` (`apps/api/src/routes/fee.routes.ts:419`)
- `GET /api/v1/payments/for-application/*` (`apps/api/src/routes/fee.routes.ts:459`)
- `GET /api/v1/payments/for-demand/:demandId` (`apps/api/src/routes/fee.routes.ts:477`)
- `GET /api/v1/payments/:paymentId` (`apps/api/src/routes/fee.routes.ts:493`)
- `POST /api/v1/payments/:paymentId/verify` (`apps/api/src/routes/fee.routes.ts:508`)
- `POST /api/v1/refunds` (`apps/api/src/routes/fee.routes.ts:557`)
- `GET /api/v1/refunds/for-application/*` (`apps/api/src/routes/fee.routes.ts:592`)
- `PATCH /api/v1/refunds/:refundId/approve` (`apps/api/src/routes/fee.routes.ts:610`)
- `PATCH /api/v1/refunds/:refundId/reject` (`apps/api/src/routes/fee.routes.ts:634`)
- `PATCH /api/v1/refunds/:refundId/process` (`apps/api/src/routes/fee.routes.ts:658`)

#### Decisions/Outputs
- `GET /api/v1/decisions/for-application/*` (`apps/api/src/routes/decision.routes.ts:32`)
- `GET /api/v1/decisions/latest/*` (`apps/api/src/routes/decision.routes.ts:50`)
- `GET /api/v1/outputs/for-application/*` (`apps/api/src/routes/decision.routes.ts:75`)
- `GET /api/v1/outputs/latest/*` (`apps/api/src/routes/decision.routes.ts:93`)

#### Communication
- `GET /api/v1/notification-logs/for-application/*` (`apps/api/src/routes/communication.routes.ts:172`)
- `GET /api/v1/notification-logs/my-logs` (`apps/api/src/routes/communication.routes.ts:199`)
- `GET /api/v1/notification-logs/stats/*` (`apps/api/src/routes/communication.routes.ts:254`)
- `GET /api/v1/notices/for-application/*` (`apps/api/src/routes/communication.routes.ts:283`)
- `GET /api/v1/notices/:noticeId` (`apps/api/src/routes/communication.routes.ts:310`)
- `GET /api/v1/notices/for-query/:queryId` (`apps/api/src/routes/communication.routes.ts:328`)
- `GET /api/v1/notices/for-decision/:decisionId` (`apps/api/src/routes/communication.routes.ts:348`)
- `POST /api/v1/notices` (`apps/api/src/routes/communication.routes.ts:368`)
- `PATCH /api/v1/notices/:noticeId/dispatch` (`apps/api/src/routes/communication.routes.ts:411`)
- `GET /api/v1/queries/for-application/*` (`apps/api/src/routes/communication.routes.ts:445`)
- `GET /api/v1/queries/:queryId` (`apps/api/src/routes/communication.routes.ts:496`)

#### Admin
- `GET /api/v1/admin/holidays` (`apps/api/src/routes/admin.routes.ts:248`)
- `POST /api/v1/admin/holidays` (`apps/api/src/routes/admin.routes.ts:272`)
- `DELETE /api/v1/admin/holidays` (`apps/api/src/routes/admin.routes.ts:289`)
- `GET /api/v1/admin/users` (`apps/api/src/routes/admin.routes.ts:306`)
- `GET /api/v1/admin/users/:userId/postings` (`apps/api/src/routes/admin.routes.ts:374`)
- `GET /api/v1/admin/stats` (`apps/api/src/routes/admin.routes.ts:418`)
- `GET /api/v1/admin/designations` (`apps/api/src/routes/admin.routes.ts:482`)

## 4) Delta vs Earlier Architecture Backlog

### A) Closed / Still Holding (No Regression)

1. Officer authority scoping for list/search endpoints remains enforced and test-backed.
   - Evidence: `apps/api/src/routes/task.routes.ts:89`, `apps/api/src/routes/inspection.routes.ts:153`, `apps/api/src/routes/communication.routes.ts:211`, `apps/api/src/routes/application.routes.ts:224`, `apps/api/src/routes/admin.routes.ts:147`
   - Backing SQL scoping also present:
     - `apps/api/src/tasks.ts:26`
     - `apps/api/src/inspections.ts:233`
     - `apps/api/src/notification-log.ts:147`
2. Admin `authorityId` validation behavior is now standardized to `400 INVALID_AUTHORITY_ID` for invalid/unknown values on users/stats paths.
   - `apps/api/src/routes/admin.routes.ts:344`
   - `apps/api/src/routes/admin.routes.ts:427`
   - validator implementation: `apps/api/src/route-access.ts:94`
3. Strict schema hardening for mutation payloads remains active globally.
   - `apps/api/src/app.ts:123`
   - Admin-specific startup assertion also active: `apps/api/src/routes/admin.routes.ts:218`
4. Key read-list query contracts remain strict and centrally guarded.
   - `apps/api/src/app.ts:58`
   - `apps/api/src/app.ts:163`

### B) Gap Status Update

1. `GET /api/v1/profile/me` strict schema gap is now resolved.
   - Route schema added: `apps/api/src/routes/profile.routes.ts:5`
   - Central strict-query guard set updated: `apps/api/src/app.ts:58`
   - Runtime verification test added: `apps/api/src/profile.read-schema.test.ts:1`
2. `GET /api/v1/config/services` still has no schema (public endpoint).
   - `apps/api/src/app.ts:201`
   - Risk: minor contract looseness only (no direct authz leak found).
   - Recommended fix: optional `querystring` strict empty object schema for consistency.

### C) Verification Gaps (Environment)

1. DB-backed authorization suite re-run completed successfully (no skip fallback).
   - Command: `DATABASE_URL=postgres://puda:puda@localhost:5432/puda npm --workspace apps/api run test -- src/authz.integration.test.ts`
   - Result: `96/96` passed.
2. DB-backed OTP hardening suite re-run completed successfully (no skip fallback).
   - Command: `DATABASE_URL=postgres://puda:puda@localhost:5432/puda npm --workspace apps/api run test -- src/auth.otp.test.ts`
   - Result: `3/3` passed.
3. Optional full API suite run completed with unrelated pre-existing failures.
   - Command: `DATABASE_URL=postgres://puda:puda@localhost:5432/puda npm --workspace apps/api run test`
   - Result: `181` passed, `7` failed.
   - Failures located in `src/api.test.ts` (approve/output flow assertions) and `src/brd-test-cases.test.ts` (form-field expectations with `undefined` key access).

## 5) Delta Assessment Against Baseline Matrix

Compared to `AUTHZ_OFFICER_SCOPE_MATRIX.md`:

1. All previously marked `Closed` officer/admin list-scope endpoints remain closed by code inspection.
2. No new cross-authority leakage path was identified in route-level or SQL-level checks for:
   - `/api/v1/tasks/inbox`
   - `/api/v1/inspections/my-queue`
   - `/api/v1/notification-logs/my-logs`
   - `/api/v1/applications/search`
   - `/api/v1/applications/export`
   - `/api/v1/properties/search`
   - `/api/v1/properties/by-upn`
   - `/api/v1/admin/*` listed read endpoints
3. No authority-scope regression identified in this recheck.

## 6) Recommended Next Actions (Priority)

1. Optionally add strict empty query schema to `GET /api/v1/config/services` for contract consistency.
2. Triage remaining full-suite failures in `src/api.test.ts` and `src/brd-test-cases.test.ts` (non-authz matrix scope, but currently red in full regression run).
3. Keep endpoint matrix checks automated in CI (route inventory diff + strict-schema assertions) to detect future drift.
