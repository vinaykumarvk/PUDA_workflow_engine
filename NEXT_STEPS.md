# PUDA Workflow Engine — Next Steps

**Current state:** Seed script, output generation, notifications, SLA in UI, and document upload in citizen flow are implemented. The app is runnable end-to-end once you run migrations and seed.

---

## ✅ Done

- **Seed script** (`apps/api/scripts/seed.ts`): Run `npm run seed` from `apps/api` (or from repo root: `npm --workspace apps/api run seed`). Seeds service versions from service-packs, test users (citizen1, officer1 / password: password123), and officer postings (CLERK, SENIOR_ASSISTANT, ACCOUNT_OFFICER for PUDA).
- **Basic output generation**: On approve/reject, HTML certificate/order is generated from service-pack templates and stored; download via `GET /api/v1/applications/:arn/output/download`. Citizen and officer UIs show "Download Certificate/Order" when disposed.
- **Notification stubs**: `notifications.notify()` (and notifySubmitted, notifyQueryResponded, notify on approve/reject) log to console; replace with SMS/email later.
- **SLA in officer UI**: Inbox and application review show SLA due date and "(Overdue)" when past due.
- **Document upload in citizen flow**: In application status (track) view, document types from service config are shown and user can upload files; list of uploaded documents is displayed.

---

## Recommended Next Step: **Make UAT-1 Runnable End-to-End**

**Goal:** Get the current build running with PostgreSQL so you can demo and test the full flow: citizen applies → officer processes → application approved/rejected.

### 1. Seed script for database (priority)

The API expects:

- **`service_version`** rows (published configs) so `POST /api/v1/applications` can resolve a version. Right now only `service` is seeded, so application creation fails.

**Action:** Add a seed script that:

- Reads each service pack under `service-packs/` (e.g. `no_due_certificate`, `registration_of_architect`, …).
- For each pack: insert/update `service_version` with `status = 'published'`, `config_jsonb` containing `{ form, workflow, documents }` from the pack, and a version (e.g. `1.0.0`).

**Optional:** Same script (or a second one) can insert:

- Test users (e.g. one citizen, one officer).
- One `user_posting` for the officer with a designation that maps (via `designation_role_map`) to `CLERK`, `SENIOR_ASSISTANT`, `ACCOUNT_OFFICER` (or whatever roles your UAT-1 workflows use).

**Outcome:** After running migrations + seed:

- Citizen can create and submit an application.
- Workflow creates tasks; officer sees tasks in inbox and can forward/query/approve/reject.

---

## After That: **UAT-1 Gate — Basic Output Generation**

**From project plan (Phase 1, Week 8):**  
*“Output generation: basic PDF templates (unsigned) and downloads.”*

**Action:**

- When an application is **approved** or **rejected**, generate a PDF from the existing HTML templates in `service-packs/<service>/templates/` (e.g. `ndc_approval.html`, `ndc_rejection.html`).
- Store the file (e.g. in `output` table + local/MinIO path), and add an API like `GET /api/v1/applications/:arn/output` (or `/outputs/:arn`) that returns metadata and a download URL or stream.
- In the citizen portal, show a “Download certificate/order” (or “Download order”) button when the application is closed with an output.

**Outcome:** UAT-1 can demonstrate full cycle including “download approval/rejection letter”.

---

## Then (in order of value for UAT)

| Step | What | Why |
|------|------|-----|
| **3** | **Notifications (stubs or real)** | Notify citizen on submit/query/approve/reject (SMS/email or log-only). Aligns with BRDs and UAT-1 checklist. |
| **4** | **SLA in UI** | Show “Due by &lt;date&gt;” and “Overdue” in officer inbox and on application view. Uses existing `sla_due_at`; no new backend logic required for a first version. |
| **5** | **Document upload in citizen flow** | Wire “Upload document” in the application form to `POST /api/v1/documents/upload` and show uploaded docs in officer review. Backend exists; UI wiring is the gap. |

---

## Summary: What to Do Now

1. **Next step:** Implement a **DB seed script** that:
   - Publishes **service versions** from service-packs (so application creation works).
   - Optionally seeds **test users and officer postings** (so inbox and actions work).
2. **Then:** Add **basic output generation** (PDF from templates + download API + citizen “Download” button) to meet UAT-1.
3. **Then:** Notifications, SLA in UI, and document upload in citizen flow as above.

If you want, the next concrete task can be: **“Add seed script for service_version and test users/postings”** (with exact table names and sample rows matching your schema).
