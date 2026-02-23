# BRD vs Code — Comprehensive Review Report

**Date:** 2026-02-04  
**Reviewer:** Senior Software Architect (AI-Assisted)  
**Scope:** All 4 UAT-1 Services  
**Status:** Complete

---

## Step 1 — Understand the Requirements

### BRD Summary

Four UAT-1 services are in scope, all sharing a common platform architecture for PUDA (Punjab Urban Development Authority):

| Service | SLA | Workflow Roles | Documents | Property-Linked |
|---------|-----|---------------|-----------|-----------------|
| Registration of Architect | 4 days | Clerk → Draftsman | 5 mandatory | No |
| No Due Certificate (NDC) | 5 days | Clerk → Sr. Asst (Accounts) → Account Officer | 1 conditional | Yes (UPN) |
| Sanction of Water Supply | 7 days | Clerk → Junior Engineer → SDE | 7 (6 mandatory, 1 conditional) | Yes (UPN) |
| Sanction of Sewerage Connection | 7 days | Clerk → Junior Engineer → SDO (PH) | 4 mandatory | Yes (UPN) |

### Functional Requirements (Common Across All 4 BRDs)

| ID | Requirement | Priority |
|----|------------|----------|
| FR-01 | Authority selection and service initiation | Must |
| FR-02 | Online application form with all published fields | Must |
| FR-03 | Save Draft and Resume | Must |
| FR-04 | Document upload with metadata and versioning | Must |
| FR-05 | Mandatory data/document validation before submission | Must |
| FR-06 | ARN generation and acknowledgement | Must |
| FR-07 | Applicant dashboard with status tracking | Must |
| FR-08 | Role-based workflow routing | Must |
| FR-09 | Officer inbox with view/remarks/actions | Must |
| FR-10 | Query and rework loop | Must |
| FR-11 | Service-specific verification (CoA validity / physical verification) | Should |
| FR-12 | Fee/payment capture (TBD for UAT-1) | Should |
| FR-13 | SLA tracking with stage-wise due dates | Should |
| FR-14 | Output generation (certificate/order) with unique number | Must |
| FR-15 | Notifications for key events | Must |
| FR-16 | Internal search by ARN, name, UPN, status | Must |
| FR-17 | Admin configuration without code changes | Should |
| FR-18 | Export functionality for MIS | Could |

### Non-Functional Requirements (Common)

| ID | Requirement | Priority |
|----|------------|----------|
| NFR-01 | Availability ≥ 99.5% monthly | Should |
| NFR-02 | Pages load ≤ 3 seconds on 4G | Should |
| NFR-03 | Horizontal scalability | Should |
| NFR-04 | Role-based access control (RBAC) | Must |
| NFR-05 | Encryption in transit (TLS) and at rest for PII/documents | Must |
| NFR-06 | Accessibility (WCAG 2.1 AA) and mobile responsiveness | Should |
| NFR-07 | Security event logging and monitoring | Should |
| NFR-08 | Backup, restore, disaster recovery | Should |
| NFR-09 | Document integrity via checksums and version control | Must |
| NFR-10 | Localisation (English/Punjabi) | Could |

### Assumptions and Ambiguities

1. **Fee/Payment (FR-12):** BRDs state "TBD" or "no fee" — treated as out-of-scope for UAT-1.
2. **Digital Signature/QR on outputs (FR-14):** BRDs recommend but don't mandate specific implementation — assumed not required for UAT-1.
3. **SMS/Email integration (FR-15):** BRDs require notifications but don't specify gateway — in-app notifications assumed sufficient for UAT-1.
4. **Admin configuration UI (FR-17):** BRDs say "Should" — assumed out-of-scope for UAT-1 (JSON config files serve this purpose).
5. **Escalation matrix:** Not defined in any BRD, marked as TBD — not implemented.
6. **Working day calendar for SLA:** BRDs specify SLA in working days per authority calendar — implementation uses calendar days.
7. **SDE vs SDO naming:** Water Supply BRD uses "SDE" role, Sewerage uses "SDO (PH)" — naming inconsistency exists in workflow configs.

---

## Step 2 — Map Requirements to Code

### Registration of Architect

| Requirement | Status | Implementation | Notes |
|------------|--------|---------------|-------|
| FR-01: Authority selection | ✅ Fully | `service-packs/registration_of_architect/form.json` field `authority_id` with PUDA/GMADA/GLADA/BDA options | |
| FR-02: Application form | ✅ Fully | `form.json` — 5 pages (Application, Personal, CoA, Address, Documents) | All BRD fields present: salutation, full name, father's name, gender, marital status, DOB, Aadhaar, email, mobile, CoA cert number, valid from/till, permanent/official addresses |
| FR-03: Save Draft | ✅ Fully | `apps/api/src/applications.ts:createApplication()`, citizen UI "Save Draft" button | Backend creates DRAFT state; UI has explicit save button |
| FR-04: Document upload | ✅ Fully | `apps/api/src/documents.ts:uploadDocument()`, `documents.json` lists 5 documents | All 5 BRD documents present: DOC_COA_CERT, DOC_ARCH_DEGREE, DOC_ADDRESS_PROOF, DOC_AADHAAR, DOC_PAN |
| FR-05: Mandatory validation | ✅ Fully | `applications.ts:validateRequiredDocuments()` + `form.json` required flags | Submission blocked if mandatory fields/documents missing |
| FR-06: ARN generation | ✅ Fully | `applications.ts:submitApplication()` generates `{authority}/{year}/{timestamp}` | ARN displayed; notification created |
| FR-07: Applicant dashboard | ✅ Fully | `apps/citizen/src/Dashboard.tsx` + `ApplicationDetail.tsx` | Stats, status tracking, document list, timeline, output download |
| FR-08: Workflow routing | ✅ Fully | `workflow.json` — DRAFT→SUBMITTED→PENDING_AT_CLERK→PENDING_AT_DRAFTSMAN→APPROVED/REJECTED→CLOSED | Matches BRD 2-stage workflow (Clerk 2d, Draftsman 2d) |
| FR-09: Officer inbox | ✅ Fully | `apps/api/src/tasks.ts:getInboxTasks()` + `apps/officer/src/App.tsx` | Forward/Query/Approve/Reject actions available |
| FR-10: Query/rework | ✅ Fully | `applications.ts:respondToQuery()` + `workflow.ts:executeTransition()` | Query raises, citizen responds, app returns to originating stage |
| FR-11: CoA validity check | ⚠️ Partial | `form.json` captures Valid From/Valid Till dates; no automated validation | Officer must manually verify; no system check that `valid_till >= today` |
| FR-12: Fee/payment | ❌ Not impl. | `payment` table exists but no code references it | Out of scope for UAT-1 per BRD "TBD" |
| FR-13: SLA tracking | ⚠️ Partial | `workflow.json` defines `slaDays` per state; `sla_due_at` computed | SLA displayed in officer inbox; **no escalation, no working-day calendar** |
| FR-14: Output generation | ✅ Fully | `apps/api/src/outputs.ts:generateOutput()` generates PDF | Plain-text PDF (no HTML rendering); **no digital signature/QR** |
| FR-15: Notifications | ⚠️ Partial | `apps/api/src/notifications.ts:notify()` — in-app only | No SMS/email gateway; notifications stubbed |
| FR-16: Search | ✅ Fully | `applications.ts:searchApplications()` + officer UI search | Search by ARN, name, UPN, plot, scheme, status |
| FR-17: Admin config | ⚠️ Partial | JSON service packs are configuration-driven | No admin UI; changes require file edits and redeployment |
| FR-18: Export | ✅ Fully | `applications.ts:exportApplicationsToCSV()` + officer UI export button | CSV export with configurable fields |

### No Due Certificate

| Requirement | Status | Implementation | Notes |
|------------|--------|---------------|-------|
| FR-01: Service initiation | ✅ Fully | `service-packs/no_due_certificate/form.json` | Authority selection present |
| FR-02: Form fields | ✅ Fully | `form.json` — Applicant (full name, remark) + Property (UPN, area, plot no, property type, scheme name, payment flag) | All BRD fields present |
| FR-03: Document upload (conditional) | ✅ Fully | `documents.json` — DOC_PAYMENT_RECEIPT with conditional rule | `requiredWhenRuleId: "RECEIPT_REQUIRED_WHEN_PAYMENT_NOT_UPDATED"` matches BRD |
| FR-04–06: Validation, ARN | ✅ Fully | Same as Architect | |
| FR-07: Role dashboards | ✅ Fully | `workflow.json` — 3 stages: Clerk (1d), Sr Asst Accounts (3d), Account Officer (1d) | Matches BRD |
| FR-08–10: Workflow, query | ✅ Fully | `workflow.json` with all transitions | |
| FR-11: Verification before approval | ⚠️ Partial | Verification checklist in workflow config | Not enforced as a gate — officer can approve without completing checklist |
| FR-14: NDC output | ✅ Fully | `outputs.ts` generates certificate | |
| FR-16: Search by UPN/Plot | ✅ Fully | ILIKE search on `property.upn`, `property.plot_no`, `property.scheme_name` | |
| FR-17: Assisted submission | ⚠️ Partial | `submission_channel` and `assisted_by_user_id` columns exist | No Sewa Kendra UI; API supports it but no frontend |

### Sanction of Water Supply

| Requirement | Status | Implementation | Notes |
|------------|--------|---------------|-------|
| FR-01–02: Form | ✅ Fully | `form.json` — 5 pages: Property, Applicant, Building/Construction, Water Connection, Documents | All BRD fields present including technical details (pipe length, tap size, ferrule cock) |
| FR-04: Documents | ✅ Fully | `documents.json` — 7 documents matching BRD | DOC_GPA marked optional (`mandatory: false`) |
| FR-08: Workflow | ✅ Fully | Clerk → Junior Engineer → SDE | **Minor issue:** BRD says "SDE" but `systemRoleId` is `"SDO"` in workflow.json |
| FR-11: Physical verification | ⚠️ Partial | Verification checklist in JE and SDE states via `taskUi.checklist` | Checklist is advisory only, not a blocking gate |
| FR-12: Fee/payment | ❌ Not impl. | | Out of scope |

### Sanction of Sewerage Connection

| Requirement | Status | Implementation | Notes |
|------------|--------|---------------|-------|
| FR-01–02: Form | ✅ Fully | `form.json` — 5 pages: Property, Applicant, Building/Occupancy, Plumber/Installation, Documents | All BRD fields present including plumber details, hot water fitting |
| FR-04: Documents | ✅ Fully | `documents.json` — 4 mandatory documents matching BRD | |
| FR-08: Workflow | ✅ Fully | Clerk → Junior Engineer → SDO (PH) | Correct role naming for this service |
| FR-11: Penalty workflow | ❌ Not impl. | No penalty/demand note functionality | BRD notes "rules TBD" — reasonable to defer |

### Undocumented Functionality (Not in BRDs)

| Feature | Location | Risk |
|---------|----------|------|
| Aadhar OTP login | `auth.ts`, citizen UI | Low — enhances accessibility; **OTP validation is bypassed** |
| User registration endpoint | `auth.ts:createUser()`, `/api/v1/auth/register` | Low — standard feature |
| Forgot/Reset password | `auth.ts`, citizen UI | Low — standard feature |
| Assisted submission fields | `applications.ts`, `application` table | Low — anticipates FR-17 (NDC) |
| Notification auto-refresh (30s poll) | `Dashboard.tsx` | Low — UX enhancement |

---

## Step 3 — Completeness and Correctness

### Flow: Citizen Application Lifecycle

- **Completeness:** ✅ Complete
- **Correctness:** ✅ Correct with minor deviations
- **Findings:**
  - ✅ Draft creation → form fill → save → resume → document upload → submit → track status → receive output
  - ✅ Form validation prevents submission without mandatory fields
  - ✅ Document validation prevents submission without mandatory documents
  - ⚠️ ARN format uses `Date.now()` — not collision-safe under concurrent load; should use DB sequence
  - ⚠️ No email verification for citizen registration
  - ⚠️ Aadhar OTP validation is disabled (accepts any OTP)
- **Suggestions:**
  - Use a database sequence or UUID for ARN uniqueness
  - Re-enable OTP validation with proper Aadhar integration or maintain the dev bypass behind a feature flag

### Flow: Officer Review and Processing

- **Completeness:** ⚠️ Partial
- **Correctness:** ⚠️ Deviates
- **Findings:**
  - ✅ Task inbox, application review, forward/query/approve/reject all work
  - ❌ **Officer workbench has hardcoded `test-officer-1` user** — no login/authentication
  - ❌ Application data shown as raw JSON (`JSON.stringify(data_jsonb)`) instead of structured display
  - ❌ Search results create fake Task objects — actions on search results will fail
  - ⚠️ Verification checklist is advisory only; officer can approve without completing it
  - ⚠️ Checklist data appended to remarks as JSON string instead of structured payload
- **Suggestions:**
  - Add officer login screen (reuse citizen auth flow)
  - Use FormRenderer in read-only mode for application data display
  - Disable action buttons when viewing from search (no active task)
  - Make verification checklist completion a prerequisite for approval in water/sewerage services

### Flow: Query and Resubmission

- **Completeness:** ✅ Complete
- **Correctness:** ✅ Correct
- **Findings:**
  - ✅ Officer raises query with unlock fields/documents
  - ✅ Citizen sees query with editable unlocked fields
  - ✅ Citizen can re-upload unlocked document types
  - ✅ Resubmission returns to originating stage
  - ✅ SLA pauses during query period (sla_paused_at set)
  - ⚠️ Query response deadline hardcoded to 15 days — should be configurable per service
- **Suggestions:**
  - Make query response deadline configurable in `service.yaml`

### Flow: Output Generation

- **Completeness:** ⚠️ Partial
- **Correctness:** ⚠️ Deviates
- **Findings:**
  - ✅ PDF output generated on approval/rejection
  - ❌ PDF is plain-text rendered — no HTML formatting, no tables, no logo, no styling
  - ❌ Output number always contains "NDC" regardless of service type
  - ❌ No digital signature or QR code (BRD recommends)
  - ⚠️ HTML template loaded but stripped to plain text via `htmlToText`
- **Suggestions:**
  - Use a proper HTML-to-PDF library (Puppeteer, wkhtmltopdf) for styled output
  - Generate output number with service-specific prefix
  - Add QR code with verification URL for tamper evidence

### Flow: Search and Export

- **Completeness:** ✅ Complete
- **Correctness:** ✅ Correct
- **Findings:**
  - ✅ Search by ARN, applicant name, UPN, plot, scheme, status
  - ✅ CSV export with all key fields
  - ⚠️ No pagination in search results
  - ⚠️ Export loads up to 10,000 rows into memory
  - ⚠️ No field masking based on role (BRD requires for sensitive fields)
- **Suggestions:**
  - Add pagination to search
  - Stream CSV export for large datasets
  - Implement role-based field masking

---

## Step 4 — Code Quality Review

### 1. Architecture and Structure

**Evaluation:** Good foundation, some concerns

**Strengths:**
- Configuration-driven architecture with service packs (form.json, workflow.json, documents.json) enables adding services without code changes
- Clear separation: API (apps/api), Citizen UI (apps/citizen), Officer UI (apps/officer), Shared (packages/shared)
- State machine workflow engine is well-designed with transition guards, role checks, and action handlers
- Database schema is well-normalized with proper indexes

**Issues:**
- `app.ts` is a 530-line monolith acting as controller, middleware, and partial service layer
- Wildcard route matching (`/api/v1/applications/*`) with manual suffix parsing (`.endsWith("/submit")`) instead of parameterized routes — fragile and order-dependent
- Inline SQL queries in route handlers (lines 507-518 of `app.ts`) bypass the service layer
- `toClientApplication` does ARN swapping in the controller — presentation concern leaking into API layer
- Output generation triggered from `app.ts` task handler duplicates what should happen in `workflow.ts`

**Improvements:**
- Split `app.ts` into route modules (`auth.routes.ts`, `application.routes.ts`, `task.routes.ts`, etc.)
- Use proper Fastify route parameters instead of wildcard parsing
- Move all DB queries out of route handlers into service modules
- Centralize output generation in the workflow engine

### 2. Readability and Maintainability

**Evaluation:** Moderate — functional but inconsistent

**Findings:**
- Function naming is generally clear (`createApplication`, `submitApplication`, `takeActionOnTask`)
- Heavy code duplication across citizen UI: `getStatusBadgeClass`, `getStatusLabel`, `formatDate`, `getServiceDisplayName` repeated in 3 files
- `App.tsx` (citizen) is ~500 lines managing 4 views — should be split into separate view components
- Officer `App.tsx` has hardcoded service display names alongside API-provided names
- Comments are sparse — business logic in `validateRequiredDocuments` and `respondToQuery` deserves explanation
- Magic strings throughout (`"DRAFT"`, `"SUBMITTED"`, `"PENDING"`, `"CLERK"`, etc.)

**Improvements:**
- Extract shared utility functions into `packages/shared/src/utils.ts`
- Split citizen `App.tsx` into `CatalogView`, `CreateView`, `TrackView`, `ApplicationsView`
- Define state and role constants as enums or const objects
- Add JSDoc comments to core business logic functions

### 3. Style and Best Practices

**Evaluation:** Acceptable with gaps

**Findings:**
- Consistent use of async/await
- Parameterized SQL queries (no injection risk)
- Proper try/catch patterns with error propagation
- TypeScript types used but often with `any` casts (`as any`, `request.body as {...}`)
- No runtime input validation framework (no Zod, Ajv, or Fastify schema validation)
- `getUserApplicationStats` fires 4 separate COUNT queries instead of one aggregate
- `deepMerge` utility doesn't handle arrays properly (overwrites instead of merging)

**Improvements:**
- Add Fastify JSON Schema validation for all route payloads
- Replace `any` types with proper interfaces
- Consolidate stats into a single SQL query with CASE/WHEN
- Add a shared `constants.ts` for state IDs, role IDs, event types

### 4. Correctness and Robustness

**Evaluation:** Mostly correct, some risks

**Findings:**
- ✅ Transaction safety in `submitApplication` and `respondToQuery` (BEGIN/COMMIT/ROLLBACK)
- ✅ Pessimistic locking with `FOR UPDATE` in workflow engine
- ✅ Optimistic locking with `row_version` on applications
- ✅ Document versioning with `is_current` flag
- ⚠️ ARN collision risk: `Date.now()` is not unique under concurrent requests
- ⚠️ React hooks violation in `ApplicationDetail.tsx`: `useMemo` called after conditional return
- ⚠️ Transition resolution by suffix matching (`endsWith("FORWARD")`) is fragile
- ⚠️ Notification deduplication: both `workflow.ts` and `app.ts` trigger notifications for APPROVE/REJECT — potential double notifications
- ⚠️ CSV export loads up to 10,000 rows into memory

**Improvements:**
- Use DB sequence or UUID v7 for ARN generation
- Fix React hooks ordering in ApplicationDetail.tsx
- Use exact transition ID matching instead of suffix matching
- Centralize notification dispatch in workflow engine only

### 5. Security

**Evaluation:** ❌ Critical gaps

**Findings:**
- ❌ **No authentication middleware**: No JWT, session, or any token verification on any route. `userId` is trusted from request body/query parameters. Any HTTP client can impersonate any user.
- ❌ **OTP validation disabled**: Aadhar OTP verification is commented out — all OTPs accepted.
- ❌ **Officer workbench has no login**: Hardcoded `test-officer-1` user ID.
- ⚠️ **Weak password hashing**: PBKDF2 with 10,000 iterations; OWASP recommends 600,000+ for SHA-512.
- ⚠️ **In-memory OTP/reset token stores**: Won't survive restarts, won't work multi-instance.
- ⚠️ **No rate limiting**: Login, OTP, password reset unprotected against brute force.
- ⚠️ **Default DB credentials hardcoded**: `puda:puda@localhost:5432/puda` in db.ts.
- ⚠️ **Full SQL text logged**: Potential data exposure in production logs.
- ⚠️ **No file type validation**: Document upload accepts any MIME type.
- ⚠️ **No CORS restriction**: `origin: true` allows all origins.

**Improvements:**
- Implement JWT-based authentication middleware on all `/api/v1/*` routes
- Add rate limiting (fastify-rate-limit) on auth endpoints
- Increase PBKDF2 iterations to 600,000 or switch to bcrypt/argon2
- Use Redis for OTP and reset token storage
- Validate file MIME types against allowed list from `documents.json`
- Restrict CORS to known frontend origins
- Remove hardcoded DB credentials

### 6. Performance

**Evaluation:** Acceptable for UAT, concerns for production

**Findings:**
- ⚠️ `getUserApplicationStats` fires 4 separate COUNT queries (N+1 pattern)
- ⚠️ CSV export loads up to 10,000 full rows with JSONB into memory
- ⚠️ No database connection pooling tuning (max 20 connections may be low for production)
- ⚠️ No query timeout configured
- ⚠️ Dashboard polls every 30 seconds — not efficient at scale (should use WebSockets or SSE)
- ⚠️ Service config loaded from DB on every request — should be cached
- ✅ Proper indexes on all key query paths
- ✅ Row-level locking prevents contention issues

**Improvements:**
- Consolidate stats into single aggregate query
- Stream CSV export or use COPY TO
- Add service config caching with TTL
- Consider WebSocket for real-time notifications
- Add query timeout to prevent runaway queries

### 7. Testing

**Evaluation:** Good coverage for UAT, gaps in edge cases

**Findings:**
- ✅ 52 automated tests across 2 test files (api.test.ts + brd-test-cases.test.ts)
- ✅ Tests cover: auth, config, application lifecycle, task actions, query flow, approve/reject, document upload, search, export, error cases
- ✅ Tests use Fastify's `inject()` for fast HTTP-level testing
- ⚠️ 2 tests failing (minor issues with ARN resolution and hook timeout)
- ⚠️ No unit tests for business logic functions (evaluateLogic, validateRequiredDocuments, deepMerge)
- ⚠️ No frontend tests (no React testing, no E2E)
- ⚠️ Tests depend on live database — not isolated
- ⚠️ No test for concurrent submission (ARN collision scenario)

**Improvements:**
- Add unit tests for core business logic functions
- Add React component tests (React Testing Library)
- Add E2E tests with Playwright
- Use test database with transaction rollback for isolation
- Add concurrency tests for ARN generation

---

## Step 5 — Risk Assessment and Prioritized Fix List

### 🔴 High Priority (Must Fix Before Release)

| # | Issue | Location | Impact | Fix |
|---|-------|----------|--------|-----|
| H1 | **No authentication middleware** — any caller can impersonate any user | `app.ts` (all routes) | Complete bypass of access control; any user data accessible | Implement JWT auth middleware; validate token on all `/api/v1/*` routes |
| H2 | **OTP validation disabled** — Aadhar login accepts any OTP | `auth.ts:164-165` | Anyone can login as any Aadhar-linked user | Re-enable OTP validation; use feature flag for dev bypass |
| H3 | **Officer workbench has no login** — hardcoded user ID | `apps/officer/src/App.tsx` | Any browser user has full officer access | Add officer login screen; remove hardcoded user ID |
| H4 | **ARN collision risk** — `Date.now()` is not unique under load | `applications.ts:202,329` | Duplicate ARN creation → data corruption | Use DB sequence (`nextval()`) or UUID v7 |
| H5 | **Output number always says "NDC"** regardless of service | `outputs.ts:getOutputNumber()` | Incorrect certificate numbers for non-NDC services | Use service-specific prefix from config |

### 🟡 Medium Priority

| # | Issue | Location | Impact | Fix |
|---|-------|----------|--------|-----|
| M1 | **Verification checklist is advisory** — officer can approve without completing | `apps/officer/src/App.tsx` | BRD requires verification before approval for water/sewerage | Add server-side guard: check checklist completion before allowing APPROVE transition |
| M2 | **PDF output is plain text** — no formatting, no logo | `outputs.ts:generateOutput()` | Unprofessional-looking certificates | Use proper HTML-to-PDF library (Puppeteer/wkhtmltopdf) |
| M3 | **Weak password hashing** — PBKDF2 with 10,000 iterations | `auth.ts:hashPassword()` | Vulnerable to brute-force password cracking | Increase to 600,000 iterations or use argon2 |
| M4 | **Double notification on approve/reject** | `workflow.ts` + `app.ts` task handler | Citizens receive duplicate notifications | Remove notification from `app.ts`; keep only in workflow engine |
| M5 | **Application data shown as raw JSON** in officer review | `apps/officer/src/App.tsx:212` | Poor UX for officers; hard to review applications | Use FormRenderer in read-only mode |
| M6 | **No rate limiting** on auth endpoints | `app.ts` auth routes | Brute force attacks on login/OTP/reset | Add `@fastify/rate-limit` |
| M7 | **React hooks violation** — useMemo after conditional return | `ApplicationDetail.tsx:86` | Potential React crashes in edge cases | Move hooks above early returns |
| M8 | **SLA uses calendar days** — BRD specifies working days | `workflow.ts` SLA calculation | SLA tracking inaccurate on weekends/holidays | Add authority-specific working day calendar |
| M9 | **In-memory OTP/token stores** | `auth.ts` (Map objects) | Lost on restart; fails multi-instance | Move to Redis/database storage |
| M10 | **Search results action failure** — fake Task with empty ID | `apps/officer/src/App.tsx:438-445` | Runtime error when officer tries action on search result | Hide action panel when viewing from search |

### 🟢 Low Priority

| # | Issue | Location | Impact | Fix |
|---|-------|----------|--------|-----|
| L1 | Duplicated utility functions across citizen UI files | `App.tsx`, `Dashboard.tsx`, `ApplicationDetail.tsx` | Maintenance burden | Extract to shared utils module |
| L2 | `app.ts` is a 530-line monolith | `app.ts` | Hard to maintain | Split into route modules |
| L3 | No pagination on officer search/inbox | `tasks.ts`, `applications.ts` | Performance at scale | Add limit/offset pagination |
| L4 | File MIME type not validated on upload | `app.ts` document upload handler | Malicious file upload risk | Validate against allowed types from `documents.json` |
| L5 | SDE/SDO naming inconsistency | `sanction_of_water_supply/workflow.json` | Confusing for maintainers | Align role IDs with BRD role names |
| L6 | No WCAG 2.1 AA compliance | All frontend files | Accessibility gap | Add ARIA labels, keyboard navigation, focus management |
| L7 | No localisation support | All frontend files | English only; BRD says English/Punjabi | Add i18n framework |
| L8 | CSV export loads 10K rows into memory | `applications.ts:exportApplicationsToCSV()` | Memory pressure at scale | Use streaming or PostgreSQL COPY |
| L9 | `onKeyPress` deprecated | `apps/officer/src/App.tsx` | Console warnings | Replace with `onKeyDown` |
| L10 | No admin UI for configuration | N/A | Config changes require code deployment | Build admin UI (could be deferred to post-UAT) |

---

## Step 6 — Final Summary

### Overall BRD Alignment

**~80% of core UAT-1 features are implemented correctly.** The platform's configuration-driven architecture is well-designed and faithfully implements the BRD-specified workflows, forms, document lists, and state models for all 4 services. The major gaps are in security infrastructure, output quality, and officer workbench maturity.

### Top 5 Gaps vs BRD

1. **No authentication/authorization infrastructure** — The most critical gap. All API endpoints trust client-provided user IDs with no verification. This violates NFR-04 (RBAC) and NFR-05 (security) across all BRDs.

2. **Output generation produces plain-text PDFs** — BRD FR-14 requires professional output documents with unique numbers and digital signatures/QR codes. Current implementation strips HTML formatting and uses a generic "NDC" prefix for all service types.

3. **Verification checklist not enforced as a gate** — BRD FR-11 for water supply and sewerage requires verification completion before approval. Current implementation allows officers to approve without completing the checklist.

4. **SLA tracking uses calendar days instead of working days** — All 4 BRDs specify SLA in working days per authority calendar. The system calculates SLA in calendar days, which will cause inaccurate breach tracking.

5. **Notifications are in-app only** — BRD FR-15 requires SMS and email notifications. Current implementation only creates in-app notifications with no external gateway integration.

### Top 5 Code Quality / Architecture Issues

1. **No authentication middleware** — Single most critical security issue. Must be fixed before any real user testing.

2. **`app.ts` is a 530-line monolith** — Combines routing, middleware logic, inline SQL, and presentation concerns. Should be split into modular route files.

3. **Duplicate notification paths** — Both workflow engine and route handler trigger notifications for the same events, causing double notifications.

4. **ARN generation is not collision-safe** — Uses `Date.now()` which can produce duplicates under concurrent load. Must use DB sequences.

5. **Heavy code duplication in citizen UI** — Helper functions repeated across 3 files; no shared component library for status badges, date formatting, service names.

### Recommended Next Steps to Production-Ready State

1. **Immediate (before UAT):**
   - Add JWT authentication middleware to all API routes
   - Add officer login screen (remove hardcoded user ID)
   - Fix ARN generation to use DB sequences
   - Fix output number generation to use service-specific prefixes
   - Re-enable OTP validation (with dev bypass feature flag)
   - Fix React hooks ordering in ApplicationDetail.tsx

2. **Before production:**
   - Implement proper HTML-to-PDF output generation with styling and QR codes
   - Add rate limiting on auth endpoints
   - Migrate OTP/token stores to Redis
   - Upgrade password hashing (argon2 or 600K+ PBKDF2 iterations)
   - Add server-side verification checklist gate for water/sewerage approval
   - Implement working-day SLA calendar
   - Add file MIME type validation on upload
   - Split `app.ts` into route modules
   - Add Fastify JSON Schema validation for request payloads
   - Restrict CORS origins

3. **Post-UAT enhancements:**
   - SMS/email notification integration
   - Admin configuration UI
   - E2E test suite with Playwright
   - Localisation framework (English/Punjabi)
   - WCAG 2.1 AA accessibility audit
   - Payment/fee integration (UAT-2)
   - Horizontal scaling preparation (S3 for document storage, Redis for sessions)

---

**Report Generated:** 2026-02-04  
**Confidence Level:** High — based on complete BRD review and full codebase analysis  
**Methodology:** Automated code analysis + BRD requirement mapping + architecture review
