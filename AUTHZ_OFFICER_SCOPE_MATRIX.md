# Officer Scope Authorization Matrix

Date: 2026-02-21
Scope: Officer-facing list/search/read aggregation endpoints in `apps/api/src/routes`.

## Matrix

| Endpoint | Guard Path | Authority Scope Behavior | Test Coverage | Status |
|---|---|---|---|---|
| `GET /api/v1/tasks/inbox` | `apps/api/src/routes/task.routes.ts` + `apps/api/src/tasks.ts` | Officer must supply `authorityId` when posted to multiple authorities; single-posting officers default to their posting. Data layer also constrains by posted authorities. | `apps/api/src/authz.integration.test.ts` (`does not leak cross-authority tasks...`, `denies ... inbox filter`, `requires authorityId for multi-posted officer list endpoints`) | Closed |
| `GET /api/v1/inspections/my-queue` | `apps/api/src/routes/inspection.routes.ts` + `apps/api/src/inspections.ts` | Officer must supply `authorityId` when posted to multiple authorities; otherwise scoped to posting authority set. | `apps/api/src/authz.integration.test.ts` (`does not leak cross-authority inspections...`, `denies ... inspection queue filter`, `requires authorityId for multi-posted officer list endpoints`) | Closed |
| `GET /api/v1/notification-logs/my-logs` | `apps/api/src/routes/communication.routes.ts` + `apps/api/src/notification-log.ts` | Officer must supply `authorityId` when posted to multiple authorities; query remains authority-constrained via application join. | `apps/api/src/authz.integration.test.ts` (`denies ... my-logs filter`, `does not leak ... my-logs`, `requires authorityId for multi-posted officer list endpoints`) | Closed |
| `GET /api/v1/notification-logs/for-application/*` | `requireApplicationReadAccess` | Application-level auth gates authority and ownership. | `apps/api/src/authz.integration.test.ts` (`denies cross-authority officer notification logs for application`) | Closed |
| `GET /api/v1/notification-logs/stats/*` | `requireApplicationReadAccess` | Application-level auth gates authority and ownership. | `apps/api/src/authz.integration.test.ts` (`denies cross-authority officer notification stats for application`) | Closed |
| `GET /api/v1/applications/search` | `resolveBackofficeAuthorityScope` in `application.routes.ts` + shared `requireValidAuthorityId` | Officer restricted to posted authority, with default single-authority fallback. Invalid/unknown `authorityId` rejected with `400 INVALID_AUTHORITY_ID`. | `apps/api/src/authz.integration.test.ts` (`scopes officer search...`, `denies ... search when authorityId is provided`, `rejects admin application search for unknown authorityId`, `rejects admin application search for invalid authorityId format`) | Closed |
| `GET /api/v1/applications/export` | `resolveBackofficeAuthorityScope` in `application.routes.ts` + shared `requireValidAuthorityId` | Officer export constrained to posted authority. Invalid/unknown `authorityId` rejected with `400 INVALID_AUTHORITY_ID`. | `apps/api/src/authz.integration.test.ts` (`scopes officer export...`, `rejects admin application export for unknown authorityId`, `rejects admin application export for invalid authorityId format`) | Closed |
| `GET /api/v1/properties/search` | `requireAuthorityStaffAccess` + shared `requireValidAuthorityId` | Requires explicit authority and posting match; invalid/unknown `authorityId` rejected with `400 INVALID_AUTHORITY_ID`. | `apps/api/src/authz.integration.test.ts` (`denies cross-authority officer property search`, `rejects officer property search for unknown authorityId`, `rejects officer property search for invalid authorityId format`) | Closed |
| `GET /api/v1/properties/by-upn` | `requireAuthorityStaffAccess` + shared `requireValidAuthorityId` | Requires explicit authority and posting match; invalid/unknown `authorityId` rejected with `400 INVALID_AUTHORITY_ID`. | `apps/api/src/authz.integration.test.ts` (`denies cross-authority officer property by-upn lookup`, `rejects officer property by-upn lookup for unknown authorityId`, `rejects officer property by-upn lookup for invalid authorityId format`) | Closed |
| `GET /api/v1/admin/holidays` | Officer scope helper in `admin.routes.ts` | Officer reads scoped to posted authority / validated `authorityId`. Admin `authorityId` filter rejects unknown authority with `400 INVALID_AUTHORITY_ID`. | `apps/api/src/authz.integration.test.ts` (`denies officer admin holidays read for cross-authority filter`, `rejects admin holidays read for unknown authorityId`) | Closed |
| `GET /api/v1/admin/users` | Officer branch in `admin.routes.ts` | Officer can list only `OFFICER` users, and must provide `authorityId` when multi-posted. Admin can optionally filter by `authorityId`; invalid or unknown authority is rejected with `400 INVALID_AUTHORITY_ID`. | `apps/api/src/authz.integration.test.ts` (`denies officer listing citizen users...`, `scopes officer admin users listing...`, `requires authorityId for multi-posted officer list endpoints`, `applies authorityId filter for admin user listing`, `rejects admin user listing for unknown authorityId`, `rejects admin user listing for invalid authorityId format`) | Closed |
| `GET /api/v1/admin/users/:userId/postings` | Officer authority filter in `admin.routes.ts` | Officer sees postings only in requested/derived authority, must provide `authorityId` when multi-posted, and gets `403` if target user has postings entirely outside scope. | `apps/api/src/authz.integration.test.ts` (`scopes officer admin postings lookup...`, `denies officer admin postings lookup for out-of-scope target users`, `requires authorityId for multi-posted officer list endpoints`) | Closed |
| `GET /api/v1/admin/stats` | Officer branch in `admin.routes.ts` | Officer stats scoped to one authority context; `authorityId` required for multi-posted officers. Admin can optionally filter by `authorityId`; invalid or unknown authority is rejected with `400 INVALID_AUTHORITY_ID`. | `apps/api/src/authz.integration.test.ts` (`scopes officer admin stats to authority context`, `requires authorityId for multi-posted officer list endpoints`, `applies authorityId filter for admin stats`, `rejects admin stats for unknown authorityId`, `rejects admin stats for invalid authorityId format`) | Closed |
| `GET /api/v1/admin/designations` | Officer scope helper in `admin.routes.ts` | Officer reads scoped to posted authority / validated `authorityId`. Admin `authorityId` filter rejects unknown authority with `400 INVALID_AUTHORITY_ID`. | `apps/api/src/authz.integration.test.ts` (`denies ... cross-authority filter`, `scopes ... when authorityId omitted`, `rejects admin designations read for unknown authorityId`) | Closed |

## Residual Gaps

1. No known authority-scope gap remains in the officer/admin list/search endpoints covered by this matrix; continue monitoring when adding new endpoints.

## Recommended Next Hardening

1. Keep `requireValidAuthorityId` as the single validation path for authority existence/format and require it for any new endpoint that accepts `authorityId`.
2. Apply the same strict `querystring`/`params` schema pattern to any newly introduced read/list route before merge.

## Mutation Audit Snapshot

1. `POST /api/v1/applications` validates `authorityId` via `requireValidAuthorityId` before create.
2. `POST /api/v1/admin/holidays` validates payload shape via schema and validates `authorityId` via `requireValidAuthorityId`.
3. `DELETE /api/v1/admin/holidays` validates payload shape via schema and validates `authorityId` via `requireValidAuthorityId`.
4. No other current `POST`/`PUT`/`DELETE` route in `apps/api/src/routes` accepts `authorityId` as input.
5. `registerAdminRoutes` enforces strict schema shape on any future admin mutation route at startup (`onRoute` hook).
6. Non-admin mutation routes hardened with strict body schemas:
   `POST /api/v1/fees/assess`, `POST /api/v1/fees/demands`, `POST /api/v1/payments`,
   `POST /api/v1/payments/:paymentId/verify`, `POST /api/v1/refunds`,
   `PATCH /api/v1/fees/demands/:demandId/waive`, `PATCH /api/v1/fees/demands/:demandId/cancel`,
   `PATCH /api/v1/refunds/:refundId/approve`, `PATCH /api/v1/refunds/:refundId/reject`,
   `PATCH /api/v1/refunds/:refundId/process`,
   `POST /api/v1/applications/*`, `PUT /api/v1/notifications/:notificationId/read`,
   `POST /api/v1/inspections`, `PATCH /api/v1/inspections/:inspectionId/assign`,
   `PATCH /api/v1/inspections/:inspectionId/complete`, `PATCH /api/v1/inspections/:inspectionId/cancel`,
   `POST /api/v1/notices`, `PATCH /api/v1/notices/:noticeId/dispatch`,
   `POST /api/v1/tasks/:taskId/assign`, `POST /api/v1/tasks/:taskId/actions`.
7. Auth mutation routes now enforce strict payload shape:
   `POST /api/v1/auth/login`, `POST /api/v1/auth/register`,
   `POST /api/v1/auth/aadhar/send-otp`, `POST /api/v1/auth/aadhar/verify-otp`,
   `POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/reset-password`.
8. `POST /api/v1/applications` now rejects unknown request fields (`additionalProperties: false`).
9. `PUT /api/v1/applications/*` enforces strict body schema (`data` required, unknown keys rejected).
10. `POST /api/v1/applications/*` now enforces strict payload shape for submit/query-response
    (unknown keys rejected; query-response required fields validated in route handler).
11. Global startup guard in `buildApp` now rejects any mutation route missing strict body schema
    unless explicitly opted out via `config.skipStrictMutationBodySchema`.
12. `POST /api/v1/documents/upload` explicitly opts out of JSON body-schema guard
    and enforces multipart field whitelist (`arn`, `docTypeId`, `userId`, file field) server-side.

## Read Contract Hardening Snapshot

1. Strict query schemas now enforce allowed keys and pagination format on key list/search routes:
   `GET /api/v1/tasks/inbox`, `GET /api/v1/applications`, `GET /api/v1/applications/search`,
   `GET /api/v1/applications/export`, `GET /api/v1/notifications`,
   `GET /api/v1/properties/search`, `GET /api/v1/properties/by-upn`,
   `GET /api/v1/notification-logs/my-logs`, `GET /api/v1/notification-logs/for-application/*`,
   `GET /api/v1/notices/for-application/*`,
   `GET /api/v1/inspections/my-queue`,
   `GET /api/v1/admin/holidays`, `GET /api/v1/admin/users`,
   `GET /api/v1/admin/users/:userId/postings`, `GET /api/v1/admin/stats`,
   `GET /api/v1/admin/designations`,
   `GET /api/v1/auth/me/postings`.
2. Strict params schemas now enforce required route identifiers on read/mutation routes using IDs/wildcards
   (applications wildcard, tasks `:taskId`, inspections `:inspectionId`, notices/query/decision IDs,
   documents `:docId`, fee/payment/refund IDs and wildcard ARN endpoints, decisions/outputs wildcard routes).
3. Added integration coverage in `apps/api/src/authz.integration.test.ts` for query contract rejection:
   unknown query filters on inbox/search/admin/properties routes, non-numeric and negative pagination rejection.
