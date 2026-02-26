# Workflow Test Case Suite

**Date:** 2026-02-26
**Version:** 1.1
**Scope:** Workflow lifecycle coverage across all 30 service packs (API, engine, integration, UI)

## 1) Service Categorization

### A. PROPERTY_SERVICES (14)
- `change_of_ownership`
- `change_of_ownership_death_all_heirs`
- `change_of_ownership_death_registered_will`
- `change_of_ownership_death_unregistered_will`
- `conveyance_deed`
- `conveyance_deed_extended_area`
- `copies_of_documents`
- `no_due_certificate`
- `permission_for_sale_gift_transfer`
- `permission_to_mortgage`
- `permitting_professional_consultancy_services`
- `reallotment_letter`
- `transfer_of_letter_of_intent`
- `transfer_permission_before_cd`

### B. ENGINEERING_SERVICES (9)
- `completion_certificate_above_1000`
- `completion_certificate_above_1000_private_property`
- `completion_certificate_up_to_1000`
- `completion_certificate_up_to_1000_private_property`
- `demarcation_of_plot`
- `dpc_certificate`
- `dpc_certificate_private_property`
- `sanction_of_building_plans_self_cert`
- `sanction_of_building_plans_self_cert_private_property`

### C. WATER_SEWERAGE_SERVICES (4)
- `regularisation_of_water_connection`
- `sanction_of_sewerage_connection`
- `sanction_of_water_supply`
- `temporary_sewerage_connection_construction`

### D. REGISTRATION/DEVELOPER (3)
- `registration_of_architect`
- `certificate_of_registration_as_estate_agent`
- `certificate_of_registration_as_promoter`

## 2) Complexity Tiers (Execution Intensity)

### Tier T1: 12 transitions / 2 task states (4 services)
- `demarcation_of_plot`
- `dpc_certificate_private_property`
- `registration_of_architect`
- `regularisation_of_water_connection`

### Tier T2: 15 transitions / 3 task states (16 services)
- `certificate_of_registration_as_estate_agent`
- `certificate_of_registration_as_promoter`
- `change_of_ownership`
- `change_of_ownership_death_all_heirs`
- `change_of_ownership_death_registered_will`
- `change_of_ownership_death_unregistered_will`
- `copies_of_documents`
- `dpc_certificate`
- `no_due_certificate`
- `permission_for_sale_gift_transfer`
- `permission_to_mortgage`
- `permitting_professional_consultancy_services`
- `reallotment_letter`
- `sanction_of_sewerage_connection`
- `sanction_of_water_supply`
- `temporary_sewerage_connection_construction`

### Tier T3: 18 transitions / 4 task states (7 services)
- `completion_certificate_up_to_1000`
- `completion_certificate_up_to_1000_private_property`
- `conveyance_deed`
- `sanction_of_building_plans_self_cert`
- `sanction_of_building_plans_self_cert_private_property`
- `transfer_of_letter_of_intent`
- `transfer_permission_before_cd`

### Tier T4: 21 transitions / 5 task states (3 services)
- `completion_certificate_above_1000`
- `completion_certificate_above_1000_private_property`
- `conveyance_deed_extended_area`

## 3) Universal Workflow Cases (Apply to All 30 Services)

### WF-CORE-001: Draft submit enters workflow
- Priority: `P0`
- Preconditions: Draft exists for service under test.
- Steps:
1. Submit draft as citizen.
2. Poll application state and task list.
- Expected:
1. State transitions `DRAFT -> SUBMITTED -> first TASK state`.
2. Exactly one open task created for first system role.

### WF-CORE-002: Invalid transition from wrong source state is rejected
- Priority: `P0`
- Steps:
1. Attempt `SUBMIT` again on non-draft application.
- Expected:
1. Transition fails with invalid-state error.
2. No side effects (no extra task, decision, notice, output).

### WF-CORE-003: Role guard enforcement
- Priority: `P0`
- Steps:
1. Attempt officer action from role not in `allowedSystemRoleIds`.
- Expected:
1. Unauthorized-role error.
2. Task status and state unchanged.

### WF-CORE-004: Task assignment and ownership gate
- Priority: `P0`
- Steps:
1. Assign task to officer A.
2. Attempt action by officer B.
- Expected:
1. Officer B cannot act.
2. Task remains with officer A.

### WF-CORE-005: Query lifecycle correctness
- Priority: `P0`
- Steps:
1. Raise query at active officer state with `queryMessage`, `unlockedFields`, `unlockedDocuments`.
2. Respond as citizen with updated data and docs.
- Expected:
1. Query row created with `status=PENDING`, unlocked field keys, unlocked doc type IDs, `response_due_at`.
2. Application enters `QUERY_PENDING`, `query_count` incremented.
3. Citizen response deep-merges `updatedData` into `data_jsonb`; query marked `RESPONDED`.
4. System transitions: `QUERY_PENDING -> RESUBMITTED -> PENDING_AT_CLERK` (first review state).
5. New clerk task created for re-review.

### WF-CORE-005a: Query field unlock enforcement
- Priority: `P0`
- Steps:
1. Raise query with specific `unlockedFields` (e.g. `["property.upn"]`).
2. Citizen attempts to modify a field NOT in `unlockedFields`.
- Expected:
1. Response rejected — only fields in `unlocked_field_keys` may be modified.
2. Applicant-level fields (name, address, etc.) remain read-only during query response.

### WF-CORE-006: SLA pause/resume on query
- Priority: `P1`
- Steps:
1. Raise query.
2. Respond and route back.
- Expected:
1. `sla_paused_at` set on query raise.
2. `sla_paused_at` cleared on citizen response (before routing back), not on re-entry to review state.
3. New task in review state gets fresh `sla_due_at` based on working-day calculation.

### WF-CORE-007: Decision artifacts on APPROVE
- Priority: `P0`
- Steps:
1. Execute full approve path.
- Expected:
1. Decision record exists with correct type and actor.
2. Approval notice exists.

### WF-CORE-008: Decision artifacts on REJECT
- Priority: `P0`
- Steps:
1. Execute reject path at each officer level (tier-appropriate).
- Expected:
1. Rejection decision and notice created.
2. Workflow closes correctly.

### WF-CORE-009: Close transition output action resolution
- Priority: `P0`
- Steps:
1. Reach `APPROVED` and `REJECTED`.
2. Execute close transition.
- Expected:
1. Close transition includes `GENERATE_OUTPUT_*`.
2. Template ID resolves to existing `service-packs/<service>/templates/*.html`.

### WF-CORE-010: Output generation and retrieval
- Priority: `P0`
- Steps:
1. Complete decision and close.
2. Fetch output metadata and download.
- Expected:
1. Output row inserted with artifact type and storage key.
2. Download returns PDF, locker entry issued to citizen.

### WF-CORE-011: Audit chain integrity for workflow path
- Priority: `P0`
- Steps:
1. Execute full path (submit -> close).
2. Verify audit events and chain.
- Expected:
1. `STATE_CHANGED` events exist for each transition.
2. Chain verification passes.

### WF-CORE-012: No dangling tasks after CLOSED
- Priority: `P0`
- Steps:
1. Reach closed state.
2. Query all tasks for ARN.
- Expected:
1. No `PENDING`/`IN_PROGRESS` tasks remain.

### WF-CORE-013: Cross-authority isolation
- Priority: `P0`
- Steps:
1. Create applications in multiple authorities.
2. Query inbox/inspection/task APIs by officer authority scope.
- Expected:
1. No cross-authority task leakage.

### WF-CORE-014: Concurrency and idempotency on actions
- Priority: `P0`
- Steps:
1. Fire concurrent approval/rejection requests on same task.
2. Replay same action request.
- Expected:
1. Single winning transition.
2. No duplicate decisions, outputs, or close transitions.

### WF-CORE-015: Submission snapshot preservation
- Priority: `P0`
- Steps:
1. Submit draft application.
2. Later, raise query and citizen responds with modified data.
3. Compare `submission_snapshot_jsonb` to current `data_jsonb`.
- Expected:
1. `submission_snapshot_jsonb` is set at submit time and never modified.
2. Post-query `data_jsonb` reflects updates; snapshot retains original submission data.

### WF-CORE-016: Document locker issuance on output generation
- Priority: `P0`
- Steps:
1. Complete full approve path to CLOSED.
2. Query citizen's document locker.
- Expected:
1. Output PDF issued to `citizen_document` table with `origin=issued` and `source_arn` linking to application.
2. `valid_from` and `valid_to` dates set per service rules.
3. Citizen can download issued document from locker endpoint.

### WF-CORE-017: Optimistic row version conflict detection
- Priority: `P0`
- Steps:
1. Read application with `row_version = N`.
2. Concurrently update application data from two requests using same `row_version`.
- Expected:
1. First writer succeeds, `row_version` incremented to `N+1`.
2. Second writer receives CONFLICT error (version mismatch).
3. No partial data corruption.

### WF-CORE-018: MFA stepup on sensitive officer actions
- Priority: `P1`
- Steps:
1. Configure authority to require MFA for approvals.
2. Attempt APPROVE without MFA challenge.
3. Complete MFA challenge, then APPROVE.
- Expected:
1. Approve without MFA returns stepup-required error.
2. After valid MFA verification, approve proceeds normally.

### WF-CORE-019: Working-day SLA calculation accuracy
- Priority: `P1`
- Steps:
1. Create task on a Friday with `slaDays=3`.
2. Verify `sla_due_at` skips weekend days.
3. Add authority holiday on Monday; verify SLA extends further.
- Expected:
1. `sla_due_at` excludes Saturdays and Sundays.
2. `sla_due_at` excludes authority-specific holidays from holiday calendar.
3. Fallback to calendar days if SLA calculation fails.

### WF-CORE-020: Status history canonical audit trail
- Priority: `P1`
- Steps:
1. Execute full workflow path (submit -> approve -> close).
2. Read `data_jsonb.application.statusHistory`.
- Expected:
1. Array contains one entry per state transition with `from`, `to`, `changedAt`, `changedBy`, `changedByRole`.
2. Entries are append-only and match audit_event STATE_CHANGED records.

## 4) Category-Specific Suites

## 4.1 PROPERTY_SERVICES

### WF-PROP-001: Legal-variant document completeness gates
- Priority: `P0`
- Applies to: all `change_of_ownership*`, `conveyance*`, `transfer*`, `permission_*`, `reallotment_letter`.
- Expected:
1. Mandatory document absence blocks submit.
2. Required variant-specific docs enforced correctly.

### WF-PROP-002: Property linkage enforcement
- Priority: `P0`
- Applies to: all property services with `propertyRequired=true`.
- Expected:
1. Missing/invalid property blocks submit.
2. Valid linked property allows transition.

### WF-PROP-003: Long-chain forward/reject branch consistency
- Priority: `P0`
- Applies to T3/T4 property services.
- Expected:
1. Rejection at every officer stage closes correctly.
2. Forward chain maintains correct assignee role progression.

### WF-PROP-004: Notice correctness for legal decisions
- Priority: `P1`
- Expected:
1. Notice type (`APPROVAL`/`REJECTION`/`QUERY`) matches transition taken.
2. Decision-linked metadata is present.

### WF-PROP-005: Public ARN and draft ARN resolution
- Priority: `P1`
- Expected:
1. Draft ARN redirects/resolves to submitted/public ARN as expected.
2. Retrieval APIs remain consistent post-submission.

### WF-PROP-006: Conveyance extended-area deep path reliability
- Priority: `P0`
- Applies to: `conveyance_deed_extended_area`.
- Expected:
1. All 5 task-state hops reachable.
2. No skipped or duplicated stage transitions.

## 4.2 ENGINEERING_SERVICES

### WF-ENG-001: Checklist enforcement before technical approval
- Priority: `P0`
- Expected:
1. Approval blocked when required checklist items missing.
2. Approval allowed when checklist complete.

### WF-ENG-002: Inspection-task coupling
- Priority: `P0`
- Expected:
1. Inspection auto-created for relevant states.
2. Inspection completion tied to officer decision path.

### WF-ENG-003: Private vs non-private parity
- Priority: `P1`
- Pairs:
1. `completion_certificate_above_1000` vs `_private_property`
2. `completion_certificate_up_to_1000` vs `_private_property`
3. `sanction_of_building_plans_self_cert` vs `_private_property`
- Expected:
1. Workflow graph and transition semantics stay equivalent except intended config deltas.

### WF-ENG-004: Deep-chain rejection distribution
- Priority: `P0`
- Applies to T3/T4 engineering services.
- Expected:
1. Rejection at each stage yields consistent closure and notice behavior.

### WF-ENG-005: Technical timeline integrity
- Priority: `P1`
- Expected:
1. Stage timeline reflects completed/current/upcoming states accurately.

### WF-ENG-006: Property-optional engineering service submission
- Priority: `P0`
- Applies to: `dpc_certificate_private_property` (and any other engineering services with optional property).
- Expected:
1. Submit succeeds without property linkage where service config marks property optional.
2. Workflow proceeds normally through all officer stages without property data.

## 4.3 WATER_SEWERAGE_SERVICES

### WF-WAT-001: Fee demand lifecycle alongside workflow
- Priority: `P0`
- Note: Payments are decoupled from the workflow state machine — officers can APPROVE/REJECT regardless of payment status. Fee demands are administrative, not blocking gates.
- Steps:
1. Create fee demand for water/sewerage application.
2. Record payment (COUNTER or GATEWAY).
3. Complete workflow (approve path).
- Expected:
1. Fee demand transitions: `PENDING -> PARTIALLY_PAID -> PAID`.
2. Officer can approve even when demand is unpaid (no workflow gate).
3. Demand marked `CANCELLED` if application is rejected.
4. Output generation succeeds independent of payment status.

### WF-WAT-002: Gateway callback replay/idempotency
- Priority: `P0`
- Expected:
1. Replayed verify/callback does not double-credit demand.
2. Payment and demand statuses remain consistent.

### WF-WAT-003: Concurrent payment verification safety
- Priority: `P0`
- Expected:
1. Concurrent verifies cannot over-credit demand.
2. Single source of truth for paid amount.

### WF-WAT-004: Query + payment mixed lifecycle
- Priority: `P1`
- Expected:
1. Query loop and payment lifecycle can both complete without deadlock.

### WF-WAT-005: SLA pressure and backlog behavior
- Priority: `P1`
- Expected:
1. Overdue backlog metric increments correctly under delayed tasks.
2. Recovery path clears backlog after processing.

### WF-WAT-006: Refund lifecycle on rejected application
- Priority: `P1`
- Steps:
1. Record payment against fee demand.
2. Reject application (demand marked CANCELLED).
3. Create refund request against verified payment.
4. Officer approves refund.
- Expected:
1. Refund request created with status `REQUESTED`.
2. Approved refund transitions to `APPROVED` then `PROCESSED`.
3. Refund amount does not exceed original payment amount.

### WF-WAT-007: Multiple payment modes on same demand
- Priority: `P1`
- Steps:
1. Create fee demand.
2. Make partial COUNTER payment.
3. Pay remaining via GATEWAY.
- Expected:
1. Demand transitions: `PENDING -> PARTIALLY_PAID -> PAID`.
2. Both payment records linked to same `demand_id`.
3. Total paid amount matches demand total.

## 4.4 REGISTRATION/DEVELOPER

### WF-REG-001: Property-optional submission behavior
- Priority: `P0`
- Applies to: `registration_of_architect`, `certificate_of_registration_as_estate_agent`, `certificate_of_registration_as_promoter`.
- Note: `dpc_certificate_private_property` is an ENGINEERING service (not registration) — test its property-optional behavior under WF-ENG-006.
- Expected:
1. Submit succeeds without property linkage where config marks optional.

### WF-REG-002: Credential validity windows
- Priority: `P1`
- Expected:
1. Expired/invalid credential dates are rejected.
2. Valid windows pass.

### WF-REG-003: Certificate output metadata correctness
- Priority: `P1`
- Expected:
1. Output validity dates and artifact type align with service rules.

### WF-REG-004: Role-specific final authority decision
- Priority: `P0`
- Expected:
1. Final approving role is strictly enforced.

## 5) Non-Functional Workflow Reliability Cases

### WF-NF-001: Lock contention under concurrent transitions
- Priority: `P0`
- Expected:
1. Loser requests fail gracefully (timeout/conflict).
2. No duplicate side effects.

### WF-NF-002: Retry safety after transient DB failures
- Priority: `P1`
- Expected:
1. Retries do not produce duplicate tasks/decisions/outputs.

### WF-NF-003: Observability correctness for workflow metrics
- Priority: `P1`
- Expected:
1. Metrics expose backlog/open/overdue accurately.

### WF-NF-004: Alert-to-runbook coverage drill
- Priority: `P2`
- Expected:
1. Workflow overdue alert maps to runbook with actionable diagnosis.

### WF-NF-005: End-to-end latency budget on critical transitions
- Priority: `P1`
- Expected:
1. Transition p95 within agreed budget in load-smoke profile.

### WF-NF-006: Accessibility and resilience smoke for workflow UI
- Priority: `P2`
- Expected:
1. Core workflow screens maintain a11y and degraded offline behavior.

## 6) Execution Cadence

### PR (mandatory)
- `WF-CORE-001` to `WF-CORE-005a`
- `WF-CORE-007` to `WF-CORE-010`
- `WF-CORE-012` to `WF-CORE-017`
- `WF-PROP-001`
- `WF-ENG-001`
- `WF-WAT-002`
- `WF-REG-001`
- `WF-NF-001`

### Nightly
- Full `WF-CORE-*` suite for all 30 services.
- Full category suites (`WF-PROP-*`, `WF-ENG-*`, `WF-WAT-*`, `WF-REG-*`).
- `WF-NF-002` to `WF-NF-006`.

### Pre-release/UAT
- All above plus manual sign-off on high-risk legal/inspection/payment journeys.

## 7) Exit Criteria

- 100% services pass universal core cases (WF-CORE-001 through WF-CORE-020).
- 100% services pass their category-specific mandatory (`P0`) cases.
- No unresolved `P0` failures.
- No flaky test with >2% failure rate over 14-day rolling window.
- Output close-transition parity check passes for all 30 service packs (60 templates).
- Concurrency cases (WF-CORE-014, WF-CORE-017, WF-NF-001) pass with zero duplicate side effects.
- Document locker issuance verified for all approve paths (WF-CORE-016).

## 8) Mapping to Existing Automation

### Existing test files and case coverage:

| Test File | Lines | Cases Covered |
|-----------|-------|---------------|
| `workflow.path-walker.integration.test.ts` | 584 | WF-CORE-001, 007, 008, 009, 012; walks all 30 service packs |
| `workflow.engine.integration.test.ts` | 318 | WF-CORE-002, 003, 011, 014 |
| `workflow.output-template-parity.test.ts` | 86 | WF-CORE-009 (template resolution for all 30 services) |
| `api.test.ts` | 834 | WF-CORE-001, 004, 005, 007, 008, 010 (end-to-end HTTP) |
| `brd-test-cases.test.ts` | 1165 | Full lifecycle for UAT-1 services (architect, NDC, water, sewerage) |
| `authz.integration.test.ts` | 1976 | WF-CORE-003, 013 (cross-user + cross-authority isolation) |
| `payments.lifecycle.integration.test.ts` | 629 | WF-WAT-001, 002, 003, 006, 007 |
| `payments.callback.integration.test.ts` | 265 | WF-WAT-002 (HTTP callback endpoint) |
| `audit.chain.integration.test.ts` | 65 | WF-CORE-011 (hash chain integrity) |
| `mfa.stepup.integration.test.ts` | 151 | WF-CORE-018 |
| `submission.validation.integration.test.ts` | 200 | WF-PROP-001, WF-REG-001 (document gates) |
| `service-pack-forms.test.ts` | 526 | Form structure validation for all 30 services |
| `service-pack-preflight.test.ts` | 102 | Service pack JSON structure + field reference validation |
| `auth.otp.test.ts` | 130 | Auth: OTP generation, expiry, rate limiting |
| `auth.revocation.integration.test.ts` | 162 | Auth: JWT revocation |
| `feature-flags.integration.test.ts` | 299 | Feature flag lifecycle |
| `observability.metrics.integration.test.ts` | 30 | WF-NF-003 (partial — endpoint availability) |

### Coverage gaps (by case ID):

| Case ID | Status | Gap |
|---------|--------|-----|
| WF-CORE-004 | Partial | Task ownership gate tested in `api.test.ts` but not as dedicated concurrent-user scenario |
| WF-CORE-005a | **Missing** | Query field unlock enforcement not tested |
| WF-CORE-006 | **Missing** | SLA pause/resume timing not explicitly asserted |
| WF-CORE-012 | Partial | Path walker checks tasks but no explicit "no dangling" assertion |
| WF-CORE-015 | **Missing** | Submission snapshot preservation not tested |
| WF-CORE-016 | **Missing** | Document locker issuance on output not tested |
| WF-CORE-017 | **Missing** | Optimistic row_version conflict not tested |
| WF-CORE-019 | **Missing** | Working-day SLA with holidays not tested |
| WF-CORE-020 | Partial | statusHistory written but not cross-checked against audit_event |
| WF-PROP-002 | **Missing** | Property linkage enforcement not tested |
| WF-PROP-003 | Partial | Path walker covers forward chains; rejection at every stage not individually asserted |
| WF-ENG-002 | **Missing** | Inspection auto-creation and completion lifecycle not tested |
| WF-ENG-006 | **Missing** | Property-optional engineering submission not tested |
| WF-WAT-004 | **Missing** | Query + payment mixed lifecycle not tested |
| WF-NF-002 | **Missing** | Retry safety after transient DB failures not tested |
| WF-NF-005 | **Missing** | Latency budget testing not implemented |

### Recommended next additions (priority order):

1. **`workflow.concurrency.integration.test.ts`** — WF-CORE-014, WF-CORE-017, WF-NF-001 (row locking + optimistic version conflicts)
2. **`workflow.query-lifecycle.integration.test.ts`** — WF-CORE-005a, WF-CORE-006 (field unlock enforcement, SLA timing)
3. **`workflow.document-locker.integration.test.ts`** — WF-CORE-016 (issuance on output, download gating)
4. **`workflow.sla.integration.test.ts`** — WF-CORE-019 (working-day calculation with holidays)
5. **`workflow.inspection.integration.test.ts`** — WF-ENG-002 (auto-creation, checklist, completion)
6. Category-specific suites: `workflow.property.integration.test.ts`, `workflow.engineering.integration.test.ts`, `workflow.water.integration.test.ts`, `workflow.registration.integration.test.ts`
