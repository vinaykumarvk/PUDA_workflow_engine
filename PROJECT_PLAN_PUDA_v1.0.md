# PUDA Workflow Engine — Project Plan v1.0
**Date:** 2026-02-04

## Table of Contents
1. Executive Summary
2. Fortnightly UAT Cadence (Fixed)
3. High‑Level Timeline
4. Phase 0 — Core Engine & Platform Foundations (Weeks 1–6)
5. Phase 1 — UAT‑1 Delivery (Week 8)
6. Phase 2 — UAT‑2 Delivery (Week 10)
7. Phase 3 — UAT‑3 Delivery (Week 12)
8. Phase 4 — UAT‑4 Delivery (Week 14)
9. Phase 5 — UAT‑5 Delivery (Week 16)
10. Cross‑Phase Sequencing Rules
11. Fortnightly UAT Delivery Checklist (Applies to Each Wave)
12. Appendix — Service Inventory (Reference)

## Executive Summary
- Deliver a configurable workflow engine and portals aligned to `ARCHITECTURE_AND_DESIGN_v2.0.md` and BRDs.
- Ship to UAT every two weeks from Week 8 to Week 16.
- Group services by shared dependencies to minimize risk and maximize reuse.

## Fortnightly UAT Cadence (Fixed)
| UAT Wave | Target Week | Theme | Primary Capability Gate |
|---|---:|---|---|
| **UAT‑1** | Week 8 | Basic services (no payments/inspections) | Core engine + base UI + basic outputs |
| **UAT‑2** | Week 10 | Online payments | Fee engine + gateway integration |
| **UAT‑3** | Week 12 | Offline instruments | DD/BG/Challan verification |
| **UAT‑4** | Week 14 | Inspections | Mobile/PWA inspection + geo/photo |
| **UAT‑5** | Week 16 | Complex property workflows | Property master integration + eSign/QR |

## High‑Level Timeline
| Weeks | Phase | Outcome |
|---|---|---|
| **1–6** | Phase 0 — Core Engine & Platform Foundations | Core services stable and reusable for UAT waves |
| **7–8** | Phase 1 — UAT‑1 Delivery | Basic services live in UAT |
| **9–10** | Phase 2 — UAT‑2 Delivery | Payment services live in UAT |
| **11–12** | Phase 3 — UAT‑3 Delivery | DD/BG services live in UAT |
| **13–14** | Phase 4 — UAT‑4 Delivery | Inspection services live in UAT |
| **15–16** | Phase 5 — UAT‑5 Delivery | Complex property services live in UAT |

---

# Phase 0 — Core Engine & Platform Foundations (Weeks 1–6)
**Scope**
- Platform baseline: auth, config registry, core data model, workflow engine skeleton, base UI shells.
- Foundational services required for all UAT waves.

**Key Deliverables**
- Database schema and migrations for core entities.
- Auth/entitlement service and role mapping.
- Config registry with schema validation and versioning.
- Workflow engine with state transitions, guards, audit logging.
- Document service baseline with versioning and checksum.
- Initial citizen/officer UI shells and API integration scaffolding.

**Main Tasks**
- Implement application, task, query, document, audit services.
- Implement JSONLogic rules engine and transition orchestration.
- Implement basic notification stubs (SMS/email placeholders).
- Build minimal form renderer and document upload components.

**Dependencies**
- Dev infrastructure, CI/CD, baseline environments.

**Milestones**
- End‑to‑end API flow for a sample service in dev.
- Service pack can be published and executed with base workflow.

**Risks**
- Schema changes rippling through services.
- Role mapping ambiguities across authorities.

**Sequential vs Parallel**
- Sequential: database schema before workflow and task services.
- Parallel: auth/entitlement and config registry can progress in parallel.

**Testing Approach**
- Unit: workflow transitions, rule evaluation, entitlement computation.
- Integration: create/update/submit API flows, document upload.
- System: single service flow through approve/reject.
- UAT: not applicable.

---

# Phase 1 — UAT‑1 Delivery (Week 8)
**Theme:** Basic Services (no payments/inspections)

**Service Group (UAT‑1)**
- `registration_of_architect`
- `no_due_certificate`
- `sanction_of_water_supply`
- `sanction_of_sewerage_connection`

**Key Deliverables**
- Citizen portal: service catalog, dynamic forms, document upload, submission.
- Officer workbench: inbox, review, forward/query/reject/approve.
- Output generation: basic PDF templates (unsigned) and downloads.
- BRD traceability and UAT test cases for UAT‑1 services.

**Main Tasks**
- Complete form, document, and workflow configs for UAT‑1 services.
- Implement query/resubmission UI and SLA tracking in UI.
- Configure notifications for submit/query/approve/reject.

**Dependencies**
- Phase 0 complete; minimal output generation available.

**Milestones**
- UAT‑1 sign‑off for all UAT‑1 services in Week 8.

**Risks**
- UI and backend validation mismatches.
- BRD gaps on outputs and notifications.

**Sequential vs Parallel**
- Sequential: output generation before final approval in UAT.
- Parallel: service pack authoring for UAT‑2 can start once schemas are stable.

**Testing Approach**
- Unit: form validations, rule checks.
- Integration: submission + officer processing + output download.
- System: full UAT‑1 service flows.
- UAT: formal UAT‑1 execution and defect closure.

**UAT‑1 Implementation Notes (Confirmed)**
- **Physical verification:** No inspection module in UAT‑1. For water/sewerage services, capture **manual checklist + remarks** at officer stages (configurable fields in workflow UI).
- **Outputs:** Unsigned PDFs acceptable for UAT‑1.
- **Integrations:** Use **manual entry / stub lookups** for property master and ledger data.
- **Payments (NDC):** Use **stubbed payment status**. Conditional document rule: require receipt **only when payment details are not updated** (flag-driven).

---

# Phase 2 — UAT‑2 Delivery (Week 10)
**Theme:** Online Payments and Fee Engine

**Service Group (UAT‑2)**
- `permission_for_sale_gift_transfer`
- `permission_to_mortgage`
- `transfer_permission_before_cd`
- `transfer_of_letter_of_intent`

**Key Deliverables**
- Fee engine with escalation and fee breakdown.
- Payment gateway integration and callback handling.
- Payment UI and payment status transitions.
- Receipts and payment audit trail.

**Main Tasks**
- Implement fee configs and payment workflows per service.
- Ensure payment success triggers workflow progression.
- Add finance reporting views (basic).

**Dependencies**
- Phase 1 UAT stability.
- Payment gateway sandbox credentials.

**Milestones**
- UAT‑2 sign‑off in Week 10 for all payment services.

**Risks**
- Gateway integration instability.
- Incorrect fee escalation or rounding.

**Sequential vs Parallel**
- Sequential: fee engine before payment UI.
- Parallel: service pack authoring for UAT‑3 can run concurrently.

**Testing Approach**
- Unit: fee calculations, payment verification.
- Integration: payment lifecycle from initiate to success/failure.
- System: end‑to‑end payment service flows.
- UAT: finance and business validation of fees and receipts.

---

# Phase 3 — UAT‑3 Delivery (Week 12)
**Theme:** Offline Instruments and Registration Services

**Service Group (UAT‑3)**
- `certificate_of_registration_as_estate_agent`
- `certificate_of_registration_as_promoter`
- `permitting_professional_consultancy_services`

**Key Deliverables**
- Offline instrument capture and verification workflow.
- Finance officer inbox for DD/BG verification.
- BG tracking and expiry alerts.

**Main Tasks**
- Implement offline instrument state and task assignment.
- Configure DD/BG document types and validations.
- Add finance‑specific UI for verification actions.

**Dependencies**
- Fee engine and payment framework from Phase 2.

**Milestones**
- UAT‑3 sign‑off in Week 12 for all DD/BG services.

**Risks**
- Verification flow mismatches with finance SOPs.

**Sequential vs Parallel**
- Sequential: offline instrument module before UAT‑3 services.
- Parallel: inspection module build for UAT‑4 can proceed.

**Testing Approach**
- Unit: offline instrument validations.
- Integration: DD/BG verification leading to workflow progression.
- System: complete DD/BG service flow to output generation.
- UAT: finance team sign‑off.

---

# Phase 4 — UAT‑4 Delivery (Week 14)
**Theme:** Inspection‑Driven Services

**Service Group (UAT‑4)**
- `sanction_of_building_plans_self_cert`
- `sanction_of_building_plans_self_cert_private_property`
- `issue_of_dpc_certificate`
- `issue_of_dpc_certificate_private_properties`
- `completion_certificate_occupation_up_to_1000`
- `completion_certificate_occupation_above_1000`
- `completion_certificate_occupation_up_to_1000_private_property`
- `completion_certificate_occupation_above_1000_private_property`
- `demarcation_of_plot`
- `reallotment_letter`
- `issuance_of_temporary_sewerage_connection_for_construction_purpose`

**Key Deliverables**
- Inspection service with geo‑tagging, photo capture, checklists.
- Mobile/PWA inspection interface with offline sync.
- Inspection‑based guard conditions in workflow.

**Main Tasks**
- Implement inspection scheduling and task routing.
- Configure inspection checklists and outcomes per service.
- Integrate inspection outcome into approval guards.

**Dependencies**
- Core workflow engine, document service, and output generation.

**Milestones**
- UAT‑4 sign‑off in Week 14 for inspection services.

**Risks**
- Offline sync conflicts on mobile.
- Field device compatibility issues.

**Sequential vs Parallel**
- Sequential: inspection module before inspection services.
- Parallel: property transfer service configs for UAT‑5 can be authored in parallel.

**Testing Approach**
- Unit: inspection rule evaluation.
- Integration: inspection completion updates application state.
- System: end‑to‑end flow including inspection and output.
- UAT: field officer pilot validation.

---

# Phase 5 — UAT‑5 Delivery (Week 16)
**Theme:** Complex Property Transfers and Conveyance

**Service Group (UAT‑5)**
- `change_of_ownership`
- `change_of_ownership_death_case_all_legal_heirs`
- `change_of_ownership_death_case_registered_will`
- `change_of_ownership_death_case_unregistered_will`
- `conveyance_deed`
- `issuance_of_conveyance_deed_for_extended_area`
- `regularisation_of_water_connection`
- `copies_of_documents`

**Key Deliverables**
- Expanded property master integration (lookup, owner verification).
- Complex form flows with multi‑party document sets.
- eSign and QR verification enabled for final outputs.

**Main Tasks**
- Configure multi‑actor forms and document rules.
- Implement property master integration and validation rules.
- Add eSign and QR to final output templates.

**Dependencies**
- Inspection module, payment module, and output engine stabilized.

**Milestones**
- UAT‑5 sign‑off in Week 16 for all remaining services.

**Risks**
- BRD ambiguities on ownership variants.
- High data complexity and validation edge cases.

**Sequential vs Parallel**
- Sequential: property master integration before ownership services.
- Parallel: eSign integration can be validated while configs are authored.

**Testing Approach**
- Unit: complex rule evaluations and conditional validations.
- Integration: property lookup, verification, and audit events.
- System: full end‑to‑end flow with eSign and QR verification.
- UAT: business sign‑off for all ownership/conveyance variants.

---

# Cross‑Phase Sequencing Rules
**Critical Dependencies**
- Output generation must exist before any UAT wave can close approvals.
- Fee engine precedes payment‑enabled services.
- Inspection module precedes inspection‑dependent services.
- Property master integration precedes ownership/conveyance services.

**Parallelizable Workstreams**
- Service pack authoring can run 1–2 waves ahead once schemas stabilize.
- UAT defect fixing for Wave N can run in parallel with build for Wave N+1.
- Template design and data bindings can be prepared ahead of integration work.

---

# Fortnightly UAT Delivery Checklist (Applies to Each Wave)
- All service packs validated and published in UAT environment.
- UAT test cases mapped to BRD references and executed.
- Defects triaged with fix plan and retest window.
- UAT sign‑off recorded with scope and known limitations.

---

## Appendix — Service Inventory (Reference)
**Property and Land Services**
- Change of Ownership.
- Change of Ownership (Death Case — All Legal Heirs).
- Change of Ownership (Death Case — Registered Will).
- Change of Ownership (Death Case — Unregistered Will).
- Conveyance Deed.
- Issuance of Conveyance Deed for Extended Area.
- Permission for Sale/Gift/Transfer.
- Permission to Mortgage.
- Transfer of Letter of Intent.
- Transfer Permission Before CD.
- Re‑allotment Letter.
- Demarcation of Plot.
- Copies of Documents.
- No Due Certificate.

**Building and Construction Services**
- Sanction of Building Plans (Self Cert).
- Sanction of Building Plans (Self Cert — Private Property).
- Issue of DPC Certificate.
- Issue of DPC Certificate (Private Properties).
- Completion Certificate (Occupation up to 1000).
- Completion Certificate (Occupation above 1000).
- Completion Certificate (Private Property up to 1000).
- Completion Certificate (Private Property above 1000).
- Permitting Professional Consultancy Services.

**Utility Services**
- Sanction of Water Supply.
- Sanction of Sewerage Connection.
- Regularisation of Water Connection.
- Temporary Sewerage Connection for Construction Purpose.

**Registration Services**
- Registration of Architect.
- Certificate of Registration as Estate Agent.
- Certificate of Registration as Promoter.
