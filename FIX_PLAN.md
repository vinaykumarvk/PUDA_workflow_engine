# Fix Plan — PUDA Workflow Engine

**Based on:** BRD_CODE_REVIEW_REPORT.md  
**Date:** 2026-02-04  
**Goal:** Move from ~80% BRD alignment to UAT-ready, then production-ready

---

## Phasing Strategy

The fixes are organized into **3 sprints** based on deployment gates:

| Sprint | Duration | Gate | Focus |
|--------|----------|------|-------|
| **Sprint A** | 2–3 days | Must complete before UAT | Security, data integrity, correctness bugs |
| **Sprint B** | 3–4 days | Must complete before production | Quality, robustness, BRD compliance |
| **Sprint C** | Ongoing | Post-UAT backlog | Scale, accessibility, new features |

---

## Sprint A — Pre-UAT Blockers (2–3 days)

These are items that would cause UAT rejection or represent unacceptable risk.

### A1. JWT Authentication Middleware
**Fixes:** H1 (No auth), H3 (Officer hardcoded user)  
**Effort:** 4–6 hours  
**Files:** `apps/api/src/app.ts`, `apps/api/src/auth.ts`, `apps/officer/src/App.tsx`

**Plan:**
1. Add a `jsonwebtoken` dependency
2. Create `apps/api/src/middleware/auth.ts`:
   - `authenticate()` hook — verifies JWT from `Authorization: Bearer <token>` header
   - Attaches `request.user = { userId, userType, roles }` to the request
   - Whitelist public routes: `/health`, `/api/v1/auth/login`, `/api/v1/auth/register`, `/api/v1/auth/aadhar/*`, `/api/v1/auth/forgot-password`, `/api/v1/auth/reset-password`
3. Modify `/api/v1/auth/login` to return a JWT token in response
4. Modify all route handlers to use `request.user.userId` instead of body/query `userId`
5. Add officer login screen in `apps/officer/src/App.tsx` (reuse citizen login component pattern)
6. Update citizen and officer frontends to store JWT in localStorage and send in `Authorization` header
7. Update tests to include auth headers

**Acceptance:** All routes except auth endpoints return 401 without valid JWT. Officer workbench requires login.

---

### A2. ARN Collision-Safe Generation
**Fixes:** H4 (ARN collision)  
**Effort:** 1–2 hours  
**Files:** `apps/api/migrations/004_arn_sequence.sql`, `apps/api/src/applications.ts`

**Plan:**
1. Create migration `004_arn_sequence.sql`:
   ```sql
   CREATE SEQUENCE IF NOT EXISTS arn_seq START 1;
   ```
2. Modify `createApplication()`:
   ```typescript
   const seqResult = await query("SELECT nextval('arn_seq') as seq");
   const seq = seqResult.rows[0].seq;
   const arn = `${authorityId}/${year}/DFT/${seq}`;
   ```
3. Modify `submitApplication()`:
   ```typescript
   const seqResult = await client.query("SELECT nextval('arn_seq') as seq");
   const submittedArn = `${app.authority_id}/${year}/${seqResult.rows[0].seq}`;
   ```
4. Run migration

**Acceptance:** No duplicate ARNs under concurrent requests. ARNs are monotonically increasing.

---

### A3. Fix Output Number Generation
**Fixes:** H5 (Output always says "NDC")  
**Effort:** 1 hour  
**Files:** `apps/api/src/outputs.ts`

**Plan:**
1. Create a service-to-prefix map:
   ```typescript
   const SERVICE_OUTPUT_PREFIX: Record<string, string> = {
     no_due_certificate: "NDC",
     registration_of_architect: "ARCH",
     sanction_of_water_supply: "WSS",
     sanction_of_sewerage_connection: "SWR",
   };
   ```
2. Modify `getOutputNumber()` to accept `serviceKey` parameter and use the map
3. Use DB sequence (from A2) for the number suffix instead of `Date.now().toString(36)`

**Acceptance:** Each service type produces correctly prefixed output numbers.

---

### A4. Re-enable OTP Validation with Dev Bypass
**Fixes:** H2 (OTP disabled)  
**Effort:** 30 minutes  
**Files:** `apps/api/src/auth.ts`, `.env`

**Plan:**
1. Add env variable `SKIP_OTP_VALIDATION=true` to `.env`
2. Modify `verifyAadharOTP()`:
   ```typescript
   if (process.env.SKIP_OTP_VALIDATION !== "true" && stored.otp !== otp) {
     return null;
   }
   ```
3. Remove the unconditional OTP acceptance

**Acceptance:** OTP validation works in production; dev bypass controlled by env flag.

---

### A5. Fix React Hooks Ordering
**Fixes:** M7 (Hooks after conditional return)  
**Effort:** 30 minutes  
**Files:** `apps/citizen/src/ApplicationDetail.tsx`

**Plan:**
1. Move all `useMemo` and `useCallback` hooks above any conditional `return` statements
2. Replace early returns with conditional rendering inside the JSX

**Acceptance:** No React hooks warnings in console; component renders correctly in all states.

---

### A6. Fix Double Notifications
**Fixes:** M4 (Duplicate notifications)  
**Effort:** 1 hour  
**Files:** `apps/api/src/app.ts`, `apps/api/src/workflow.ts`

**Plan:**
1. Remove notification calls from the task action handler in `app.ts` (lines where `notifyApproved`/`notifyRejected` are called after `takeActionOnTask`)
2. Keep notification dispatch only inside `workflow.ts:executeTransition()` where it belongs
3. Verify single notification per event in tests

**Acceptance:** Each workflow event produces exactly one notification.

---

### A7. Fix Search Result Action Crash
**Fixes:** M10 (Fake task from search)  
**Effort:** 30 minutes  
**Files:** `apps/officer/src/App.tsx`

**Plan:**
1. Add a `viewMode` state: `"inbox" | "search-result"`
2. When clicking a search result, set `viewMode = "search-result"`
3. Hide the action panel (Forward/Query/Approve/Reject buttons) when `viewMode === "search-result"`
4. Show a "Go to Inbox to take action" message instead

**Acceptance:** Officers can view search results without action buttons; no crash on click.

---

### Sprint A Summary

| Task | Effort | Dependencies | Fixes |
|------|--------|-------------|-------|
| A1. JWT Auth Middleware | 4–6h | None | H1, H3 |
| A2. ARN Sequence | 1–2h | None | H4 |
| A3. Output Number Prefix | 1h | A2 (for sequence) | H5 |
| A4. OTP Validation Flag | 30m | None | H2 |
| A5. React Hooks Fix | 30m | None | M7 |
| A6. Fix Double Notifications | 1h | None | M4 |
| A7. Fix Search Result Crash | 30m | None | M10 |
| **Total** | **~10 hours** | | **7 issues fixed** |

**After Sprint A:** All High-priority issues resolved. Application is secure enough for UAT with real users.

---

## Sprint B — Pre-Production Quality (3–4 days)

These items improve BRD compliance, robustness, and user experience.

### B1. Verification Checklist Gate
**Fixes:** M1 (Advisory checklist)  
**Effort:** 3–4 hours  
**Files:** `apps/api/src/tasks.ts`, `apps/api/src/workflow.ts`, `apps/officer/src/App.tsx`

**Plan:**
1. Add a `verification_data` JSONB column to the `task` table
2. Modify officer UI to send checklist data as a structured `verificationData` field in the action payload (not embedded in remarks)
3. In `takeActionOnTask()`, when action is `APPROVE` and service is `sanction_of_water_supply` or `sanction_of_sewerage_connection`:
   - Check that `verificationData` contains all required checklist items marked as complete
   - Return error if incomplete
4. Store `verificationData` in the task record for audit

**Acceptance:** Officers cannot approve water/sewerage applications without completing all checklist items.

---

### B2. Proper PDF Output Generation
**Fixes:** M2 (Plain text PDF)  
**Effort:** 6–8 hours  
**Files:** `apps/api/src/outputs.ts`, `service-packs/*/templates/*.html`

**Plan:**
1. Replace PDFKit plain-text approach with Puppeteer (headless Chrome):
   ```bash
   npm install puppeteer-core @sparticuz/chromium
   ```
2. Load HTML template, fill placeholders, render to PDF with full CSS support
3. Add QR code with verification URL using `qrcode` npm package:
   ```typescript
   const qrDataUrl = await QRCode.toDataURL(`https://puda.gov.in/verify/${outputNumber}`);
   ```
4. Create proper HTML templates with:
   - Authority logo placeholder
   - Formatted applicant/property data tables
   - Output number and date
   - QR code image
   - Signature placeholder
5. Create templates for all 4 services (approval + rejection = 8 templates)

**Acceptance:** Professional-looking A4 PDFs with formatting, QR code, and proper output numbers.

---

### B3. Password Hashing Upgrade
**Fixes:** M3 (Weak hashing)  
**Effort:** 1–2 hours  
**Files:** `apps/api/src/auth.ts`, `apps/api/package.json`

**Plan:**
1. Install `argon2`: `npm install argon2`
2. Create new `hashPasswordArgon2()` and `verifyPasswordArgon2()` functions
3. Modify `authenticate()` to detect hash format and use appropriate verifier:
   - If hash starts with `$argon2` → use argon2
   - Otherwise → use PBKDF2 (backward compatible)
4. Modify `hashPassword()` to use argon2 for new passwords
5. Existing users seamlessly upgraded on next login

**Acceptance:** New passwords use argon2. Existing PBKDF2 hashes still work.

---

### B4. Rate Limiting
**Fixes:** M6 (No rate limit)  
**Effort:** 1 hour  
**Files:** `apps/api/src/app.ts`, `apps/api/package.json`

**Plan:**
1. Install `@fastify/rate-limit`
2. Apply global rate limit: 100 req/min per IP
3. Apply stricter limits on auth routes:
   - `/api/v1/auth/login`: 10 req/min per IP
   - `/api/v1/auth/aadhar/*`: 5 req/min per IP
   - `/api/v1/auth/forgot-password`: 3 req/min per IP

**Acceptance:** Brute force attacks throttled; normal usage unaffected.

---

### B5. Officer Application Data Display
**Fixes:** M5 (Raw JSON display)  
**Effort:** 3–4 hours  
**Files:** `apps/officer/src/App.tsx`, shared form renderer

**Plan:**
1. Import the shared `FormRenderer` component into the officer app
2. Load service config for the application being reviewed
3. Render `FormRenderer` in read-only mode (`readOnly={true}`) with application data
4. Remove the `JSON.stringify` pre-formatted display
5. Add section headers matching form config pages

**Acceptance:** Officers see labeled, structured application data instead of raw JSON.

---

### B6. Working-Day SLA Calendar
**Fixes:** M8 (Calendar vs working days)  
**Effort:** 4–6 hours  
**Files:** `apps/api/src/workflow.ts`, new `apps/api/src/sla.ts`, DB migration

**Plan:**
1. Create `authority_holiday` table:
   ```sql
   CREATE TABLE authority_holiday (
     authority_id TEXT REFERENCES authority(authority_id),
     holiday_date DATE NOT NULL,
     description TEXT,
     PRIMARY KEY (authority_id, holiday_date)
   );
   ```
2. Create `calculateSLADueDate(startDate, workingDays, authorityId)` function:
   - Skip Saturdays, Sundays, and authority-specific holidays
   - Return the due date in working days
3. Modify `workflow.ts` ASSIGN_NEXT_TASK action to use this function
4. Seed initial holidays (national holidays, state holidays)
5. Add admin endpoint to manage holidays

**Acceptance:** SLA due dates account for weekends and holidays per authority.

---

### B7. Move OTP/Token Store to Database
**Fixes:** M9 (In-memory stores)  
**Effort:** 2–3 hours  
**Files:** `apps/api/src/auth.ts`, DB migration

**Plan:**
1. Create `otp_store` table:
   ```sql
   CREATE TABLE otp_store (
     identifier TEXT PRIMARY KEY,
     otp TEXT NOT NULL,
     expires_at TIMESTAMPTZ NOT NULL,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   CREATE TABLE password_reset_token (
     token TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES "user"(user_id),
     expires_at TIMESTAMPTZ NOT NULL,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```
2. Replace `Map` stores with DB insert/select/delete operations
3. Add cleanup cron (or TTL-based deletion) for expired entries

**Acceptance:** OTP and reset tokens persist across restarts; work with multiple instances.

---

### B8. File MIME Type Validation
**Fixes:** L4 (No file type check)  
**Effort:** 1 hour  
**Files:** `apps/api/src/app.ts` (document upload handler)

**Plan:**
1. When uploading, load document config for the service
2. Check `allowedMimeTypes` from `documents.json`
3. Also validate file extension against a safe list
4. Return 400 with clear error if disallowed

**Acceptance:** Only PDF, JPEG, PNG files accepted (as per BRD BR-09).

---

### B9. CORS Restriction
**Fixes:** Security best practice  
**Effort:** 30 minutes  
**Files:** `apps/api/src/app.ts`, `.env`

**Plan:**
1. Add `ALLOWED_ORIGINS` to `.env`: `http://localhost:5173,http://localhost:5174`
2. Modify CORS config:
   ```typescript
   await app.register(cors, {
     origin: process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:5173"]
   });
   ```

**Acceptance:** Only known frontend origins allowed; no open CORS.

---

### B10. Input Validation with Fastify Schemas
**Fixes:** Code quality (no runtime validation)  
**Effort:** 3–4 hours  
**Files:** `apps/api/src/app.ts` (all route definitions)

**Plan:**
1. Define JSON schemas for all request payloads using Fastify's built-in schema validation
2. Key schemas:
   - Login: `{ login: string, password: string }`
   - Create application: `{ authorityId: string, serviceKey: string, applicantUserId?: string, data?: object }`
   - Task action: `{ action: enum[FORWARD,QUERY,APPROVE,REJECT], userId: string, remarks?: string }`
3. Register schemas on route definitions
4. Remove manual `as` type assertions

**Acceptance:** Invalid payloads rejected with 400 before reaching business logic.

---

### Sprint B Summary

| Task | Effort | Dependencies | Fixes |
|------|--------|-------------|-------|
| B1. Verification Gate | 3–4h | A1 (auth) | M1 |
| B2. PDF Output | 6–8h | A3 (output numbers) | M2 |
| B3. Password Hashing | 1–2h | None | M3 |
| B4. Rate Limiting | 1h | None | M6 |
| B5. Officer Data Display | 3–4h | None | M5 |
| B6. Working-Day SLA | 4–6h | None | M8 |
| B7. OTP/Token to DB | 2–3h | None | M9 |
| B8. MIME Validation | 1h | None | L4 |
| B9. CORS Restriction | 30m | None | Security |
| B10. Input Validation | 3–4h | None | Code quality |
| **Total** | **~28 hours** | | **10 issues fixed** |

**After Sprint B:** Application meets all Must-priority BRD requirements. Secure enough for production.

---

## Sprint C — Post-UAT Backlog

These items improve maintainability, scale, and add non-critical BRD features.

| Task | Effort | Fixes | Notes |
|------|--------|-------|-------|
| C1. Split `app.ts` into route modules | 4h | L2 | `auth.routes.ts`, `application.routes.ts`, `task.routes.ts`, `document.routes.ts` |
| C2. Extract shared UI utilities | 2h | L1 | `packages/shared/src/utils.ts` with formatDate, statusBadge, etc. |
| C3. Pagination for inbox/search | 2h | L3 | Add limit/offset to task inbox and search |
| C4. SMS/Email notifications | 8h | FR-15 | Integrate SMS gateway (MSG91/Twilio) and email (SES/SMTP) |
| C5. Localisation (English/Punjabi) | 8h | L7/NFR-10 | Add react-i18next framework |
| C6. WCAG 2.1 AA audit | 8h | L6/NFR-06 | ARIA labels, keyboard nav, color contrast |
| C7. E2E test suite (Playwright) | 8h | Testing | Citizen and officer flows |
| C8. Admin configuration UI | 16h | L10/FR-17 | Service pack editor, holiday calendar, user management |
| C9. Document storage to S3 | 4h | Scalability | Replace local filesystem with S3-compatible storage |
| C10. Payment/fee integration | 16h | FR-12 | UAT-2 scope |
| C11. Streaming CSV export | 2h | L8 | Use PostgreSQL COPY or Node.js streams |
| C12. SDE/SDO naming alignment | 30m | L5 | Rename in workflow.json |
| C13. Fix deprecated onKeyPress | 15m | L9 | Replace with onKeyDown |

---

## Dependency Graph

```
Sprint A (Parallel tracks):
  Track 1: A1 (JWT Auth) ──> A4 (OTP Flag)
  Track 2: A2 (ARN Seq) ──> A3 (Output Prefix)
  Track 3: A5 (Hooks Fix) + A6 (Double Notif) + A7 (Search Fix)

Sprint B (After Sprint A):
  Track 1: B1 (Verification Gate) ──> B5 (Officer Display)
  Track 2: B2 (PDF Output)
  Track 3: B3 (Password) + B4 (Rate Limit) + B8 (MIME) + B9 (CORS)
  Track 4: B6 (SLA Calendar) + B7 (OTP to DB)
  Track 5: B10 (Input Validation)

Sprint C (After Sprint B, independent items):
  All items can be worked in parallel
```

---

## Effort Summary

| Sprint | Effort | Issues Fixed | Outcome |
|--------|--------|-------------|---------|
| **A** | ~10 hours (2 days) | 7 (5 High + 2 Medium) | UAT-ready |
| **B** | ~28 hours (4 days) | 10 Medium + Low | Production-ready |
| **C** | ~78 hours (backlog) | 13 Low + enhancements | Full BRD compliance |
| **Total** | ~116 hours | 30 issues | Complete |

---

## Recommended Execution Order

**Day 1:** A1 (JWT Auth — biggest item), A2 (ARN Sequence), A4 (OTP Flag)  
**Day 2:** A1 continued (officer login UI), A3 (Output Prefix), A5+A6+A7 (quick fixes)  
**Day 3:** B4 (Rate Limit), B8 (MIME), B9 (CORS), B3 (Password) — security hardening  
**Day 4:** B1 (Verification Gate), B6 (Working-Day SLA)  
**Day 5:** B2 (PDF Output — biggest Sprint B item)  
**Day 6:** B5 (Officer Display), B7 (OTP to DB), B10 (Input Validation)

**After Day 2:** UAT can begin  
**After Day 6:** Production deployment possible

---

## Success Criteria

### UAT Gate (After Sprint A)
- [ ] All API routes require JWT authentication
- [ ] Officer workbench has login screen
- [ ] ARN generation is collision-safe
- [ ] Output numbers use correct service prefix
- [ ] OTP validation works (with dev bypass flag)
- [ ] No React console errors
- [ ] No duplicate notifications
- [ ] Search results are view-only (no action crash)
- [ ] All existing tests pass
- [ ] New auth tests pass

### Production Gate (After Sprint B)
- [ ] Verification checklist enforced for water/sewerage approval
- [ ] Professional PDF certificates with QR codes
- [ ] Password hashing meets OWASP standards
- [ ] Rate limiting on auth endpoints
- [ ] Officer sees structured application data
- [ ] SLA uses working days per authority calendar
- [ ] OTP/tokens persist across restarts
- [ ] File upload validates MIME types
- [ ] CORS restricted to known origins
- [ ] All request payloads validated with schemas

---

**Plan Created:** 2026-02-04  
**Estimated Total Duration:** 6 working days to production-ready  
**Risk:** Low — all fixes are well-scoped with clear implementations
