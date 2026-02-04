# Developer Guide: Configurable Workflow Engine for Urban Development Authorities

## 1\. Purpose of This Document

This document serves as a **developer and architecture guide** for building a **scalable, configurable, and regulation-resilient workflow engine** for Urban Development Authorities (UDAs). The goal is to enable multiple citizen services (40–50+) to be onboarded **without rewriting code**, while allowing frequent policy, rule, and organizational changes.

---

## 2\. Design Principles

### 2.1 Configuration Over Code

* No hardcoding of workflows, roles, rules, or validations

* All service behavior must be data-driven

* Changes should be possible without redeployment

### 2.2 Separation of Concerns

* Workflow execution ≠ authorization ≠ document validation

* Each capability should evolve independently

### 2.3 Auditability & Transparency

* Every decision, transition, and override must be traceable

* AI-assisted steps must be explainable

### 2.4 Government-Ready

* Supports hierarchy-based approvals

* Handles heavy documentation

* Adapts across municipalities, departments, and authorities

---

## 3\. High-Level Architecture

Citizen UI / Officer UI  
        |  
        v  
Workflow Orchestrator  
        |  
 \---------------------------------------------------  
 | State Machine | Rules Engine | Action Executor |  
 \---------------------------------------------------  
        |  
 Authorization / Entitlement Service  
        |  
 Document AI \+ Validation Layer  
        |  
 Master Data Systems (Land, Property, Tax, etc.)

---

## 4\. Core Components of the Workflow Engine

### 4.1 State Machine

The **state machine** defines *where* an application is in its lifecycle.

#### *Examples of States*

* Draft

* Submitted

* Document Verification

* Field Inspection

* Approval Pending

* Approved

* Rejected

Each service defines its own valid states **via configuration**.

---

### 4.2 Transitions

Transitions define *how* an application moves from one state to another.

Each transition includes: \- From State \- To State \- Trigger (manual / system / AI) \- Preconditions (rules) \- Allowed Roles \- Actions to execute

Example:

{  
  "from": "Document Verification",  
  "to": "Approval Pending",  
  "allowedRoles": \["JUNIOR\_ENGINEER"\],  
  "conditions": \["ALL\_DOCS\_VERIFIED"\],  
  "actions": \["NOTIFY\_APPROVER"\]  
}

---

### 4.3 Rules Engine

The **rules engine** evaluates conditions dynamically.

Rules are expressed as **declarative logic**, not code.

#### *Types of Rules*

* Validation rules (document completeness)

* Eligibility rules (land use, zoning)

* Authorization rules (who can act)

* Transition guards

Rules can be: \- Boolean \- Scoring-based \- AI-assisted

---

### 4.4 Action Executor

Actions are **side effects** triggered during transitions.

Examples: \- Send SMS/email \- Assign next officer \- Generate inspection order \- Lock/unlock application \- Trigger AI validation

Actions should be: \- Idempotent \- Asynchronous where possible \- Logged

---

### 4.5 Workflow Orchestrator (4th Component)

The orchestrator: \- Drives the lifecycle \- Invokes rules at the right time \- Calls authorization before transitions \- Executes actions \- Persists audit logs

This is the **brain** of the engine.

---

## 5\. Authorization & Entitlement Model

### 5.1 Why Authorization Is Separate

Authorization changes frequently due to: \- Transfers \- Promotions \- Inter-department differences

Hence it must NOT be embedded in workflow logic.

---

### 5.2 Role & Designation Abstraction

#### *Key Insight*

**System roles are stable. Human designations are not.**

---

### 5.3 Authorization Mapping Layers

User ID  
  ↓  
Designation \+ Development Authority  
  ↓  
System Role  
  ↓  
(Service Type \+ State)

---

### 5.4 Example

* Designation: “Assistant Town Planner”

* Authority: “Municipal Corp A”

* Maps to System Role: TECHNICAL\_SCRUTINY\_OFFICER

* Allowed on:

  * Building Permit

  * State: “Technical Review”

---

### 5.5 Task Visibility (Pre-Filtering)

Users should **only see applications they can act on**.

Implementation: \- At login, compute allowed (service, state) combinations \- Query only matching applications

This avoids failed actions and improves UX.

---

## 6\. Admin & Governance Model

### 6.1 Admin Responsibilities

Admin users (not developers) manage: \- User ↔ Designation mapping \- Designation ↔ System Role mapping \- Authority-specific overrides

### 6.2 Implementation Team Responsibilities

* Define states

* Define transitions

* Define rules

* Define actions

This clean split ensures governance and scalability.

---

## 7\. Document-Heavy Workflow Reimagined with AI

### 7.1 Traditional vs Modern Flow

| Traditional | AI-Enabled |
| :---- | :---- |
| Physical documents | Digital upload |
| Manual checking | AI-assisted extraction |
| Subjective | Rule-based & explainable |
| Slow | Near real-time |

---

### 7.2 Document Validation Strategy

Each document type has a **validation checklist**.

Example: Property Document \- Property ID \- Owner Name \- Father’s Name \- Address \- PIN Code \- Tax Number

---

### 7.3 AI-Based Validation Flow

1. Citizen uploads PDF / Image

2. Document sent to Document AI

3. Extract structured fields

4. Compare with master systems

5. Flag missing or mismatched data

6. Produce validation report

---

## 8\. Recommended Document AI Tools

### 8.1 Primary Tools

* Google Document AI

* Amazon Textract

* Azure Form Recognizer

### 8.2 Why Not Vector Store Alone?

* Vector stores are excellent for **retrieval**

* Structured field extraction requires **document parsers**

* Best approach:

  * Document AI → structured data

  * LLM → reasoning, explanation, discrepancy analysis

---

## 9\. Accuracy & Language Support

* Typical accuracy: **90–95%** (higher with tuning)

* Supports Indian languages (Hindi, Tamil, Telugu, etc.)

* English remains strongest

Human-in-the-loop verification is still essential.

---

## 10\. Document Review UI Design

### 10.1 Recommended UI Pattern

**Split View Interface** \- Left: Original document (PDF/Image) \- Right: Extracted fields

### 10.2 Interactive Verification

* Click a field → highlight source location

* Bounding boxes from Document AI

* Officer can accept / correct

This builds trust in AI outputs.

---

## 11\. Workflow Integration

Once document verification completes: 1\. Officer confirms AI results 2\. System evaluates transition rules 3\. Authorization is checked 4\. Transition executed 5\. Actions triggered

All steps logged.

---

## 12\. End-to-End Example

**Service:** Building Permit

1. Citizen submits application

2. AI validates property documents

3. Officer reviews highlighted fields

4. Workflow moves to Technical Scrutiny

5. Only eligible officers see the task

6. Approval triggers next stage

No code changes required.

---

## 13\. Final Recommendations

* Treat workflows as **living configurations**

* Keep authorization external

* Use AI to assist, not replace, officers

* Design for audit, scale, and change

---

## 14\. Next Steps

* Convert configs to JSON/YAML schemas

* Build a Workflow Config UI

* Add simulation & testing for rule changes

* Introduce SLA and analytics layer

---

**End of Developer Guide**

## **1\) Key architectural building blocks**

### **A. Configuration layer (the “product” of your platform)**

**This is the most important part: treat it as a first-class domain with versioning, validation, and tooling.**

**1\) Service Definition (per service)**

* **`serviceId`, `name`, `category`**  
* **`supportedAuthorities` (PUDA/GMADA/GLADA/BDA)**  
* **`enabledChannels` (portal/mobile/assisted if needed)**  
* **`configVersion` and lifecycle (Draft → Published → Deprecated)**  
* **`SLS` (overall) and per-stage SLA, working calendar rules (working days vs calendar days)**

**2\) Form Definition (per service)**

* **Pages/steps \+ layout model**  
* **Field definitions (type, constraints, conditional visibility)**  
* **Validation rules (client \+ server)**  
* **Field masking policy (PII like Aadhaar/PAN)**  
* **“Editability policy” per state, including field-level unlock during query**

**3\) Document Definition (per service)**

* **Document types (DOC-xx)**  
* **Mandatory vs conditional requirements**  
* **Upload constraints (type/size), attestation flags**  
* **Document versioning rules (re-upload creates new version, keep old)**  
* **Optional “document AI extraction schema” (later)**

**4\) Workflow Definition (per service)**

* **State machine: states \+ transitions \+ triggers**  
* **Stages/tasks: which system role acts where**  
* **Query/resubmission loop policy (consistent across services)**  
* **Parallel routing \+ joins (AND/OR joins) for multi-wing reports**

**5\) Rules Definition (per service)**

* **Declarative rules for:**  
  * **transition guards (can we move forward?)**  
  * **eligibility checks**  
  * **conditional docs / conditional fields**  
  * **SLA pause/reset logic during query windows**  
* **Implement using a safe expression DSL (details below)**

**6\) Output / Template Definition (per service)**

* **“Issued output” templates: certificate/order/letter**  
* **Data binding map → PDF generation**  
* **Signature policy (digital signature / QR verification recommended)**

---

### **B. Runtime platform (shared code)**

**This is the engine that interprets configs.**

**1\) Workflow Orchestrator**  
**Your guide already outlines the right decomposition: Orchestrator \= State Machine \+ Rules Engine \+ Action Executor, with authorization checked before transitions.**

**2\) Authorization / Entitlement Service**  
**Critical: System roles are stable; human designations vary. So you map:**  
**`User → (Designation + Authority) → System Role → Allowed (Service, State)`**  
**This also supports your requirement that approval levels are same, but officer designations differ per authority.**

**3\) Application Data Service**

* **Stores application instance: payload \+ current state \+ stage history**  
* **Computes “derived fields” for reporting/search (UPN, authority, applicantId, etc.)**  
* **Maintains a submission snapshot (immutable version) per resubmission cycle**

**4\) Document Management Service (DMS)**

* **Upload/download, encryption, checksum, antivirus**  
* **Versioning and access logs (who viewed what)**  
* **Object storage backend (S3-compatible) \+ metadata in DB**

**5\) Notification Service**

* **SMS/email/in-app events on submission/query/disposal**  
* **Idempotent, retryable delivery**

**6\) Payment / Instrument Service**  
**Some services have online payment; some have offline instruments (DD/BG). Config must define:**

* **payment required? when?**  
* **fee computation rules**  
* **blocking transitions until verified (if configured)**

**7\) Output Generation & Signing Service**

* **PDF generation \+ numbering \+ QR verification**  
* **Optional signing workflow, audit logs**

**8\) Audit, Reporting, Observability**

* **Immutable audit log (event-style) for: transitions, field changes, document actions, views/downloads**  
* **SLA metrics and escalations**  
* **Platform NFR targets: e.g., \~3s response for key actions (as a baseline expectation)**

**9\) Admin Console**

* **Authority master**  
* **User management (officers local accounts, per your input)**  
* **Designation ↔ System role mappings**  
* **Config publishing (even if approvals happen outside, the platform needs “publish” mechanics)**

---

## **2\) How these elements interact (to onboard new services via configuration)**

### **The core idea**

**Service onboarding \= add a “Service Pack”**  
**A service pack is a bundle:**

* **`service.yaml`**  
* **`form.json`**  
* **`documents.json`**  
* **`workflow.json`**  
* **`rules.json`**  
* **`templates/*`**

**Your runtime loads the pack, validates it, publishes a version, and new applications reference that version forever (unless migrated intentionally).**

### **End-to-end runtime flow**

#### **A) Citizen starts application**

1. **React loads `serviceId` \+ latest published config version**  
2. **Form renderer builds UI from config**  
3. **User saves draft (payload stored, state \= Draft)**

**This matches the common “Save Draft/Resume” behavior across BRDs.**

#### **B) Submit**

1. **Backend validates (server-side) using the same rules (authoritative)**  
2. **Creates ARN**  
3. **Creates first workflow task and sets SLA due date (working calendar aware)**  
4. **Emits events: acknowledgement \+ notifications**

#### **C) Officer workbench**

1. **Officer logs in**  
2. **Entitlement service returns allowed `(service,state)` combinations for inbox filtering**  
3. **Officer opens application:**  
   * **sees data \+ documents**  
   * **can verify docs, add remarks**  
   * **can forward / query / reject / approve depending on stage config**

#### **D) Query & resubmission (consistent across services)**

**When officer raises a query:**

* **engine transitions to `QUERY_PENDING`**  
* **engine stores the unlock spec:**  
  * **editable field paths (some editable, some locked)**  
  * **editable docs (which doc types can be replaced)**  
* **SLA clock: pause or continue based on policy config**  
* **citizen resubmits → new payload version \+ document versions → returns to the originating stage**

**This directly implements your “some fields editable, some not” requirement and what BRDs recommend.**

#### **E) Parallel approvals / parallel reports**

**Some processes explicitly call out parallel report generation across wings (Engineering \+ Accounts/Dues \+ Planning \+ Legal, etc.).**

**Model this as:**

* **a parallel gateway state that creates N tasks at once (one per wing/role)**  
* **a join policy:**  
  * **AND-join: wait for all required reports**  
  * **OR-join: any one approval is enough (rarer)**  
  * **“fail-fast”: any rejection blocks and routes to reject/rework**

**This lets you handle “two departments in parallel” without per-service code.**

---

## **2.1 A practical configuration model (example)**

**Below is an *illustrative* workflow config structure that supports sequential \+ parallel \+ query unlocks:**

**{**

  **"serviceId": "LEASEHOLD\_TO\_FREEHOLD",**

  **"version": "2026.02.01",**

  **"states": \[**

    **"DRAFT",**

    **"SUBMITTED",**

    **"SCRUTINY\_DA",**

    **"PARALLEL\_REPORTS",**

    **"FINAL\_APPROVAL",**

    **"QUERY\_PENDING",**

    **"APPROVED",**

    **"REJECTED",**

    **"CLOSED"**

  **\],**

  **"transitions": \[**

    **{**

      **"from": "SUBMITTED",**

      **"to": "SCRUTINY\_DA",**

      **"trigger": "SYSTEM",**

      **"actions": \["ASSIGN\_TASK"\],**

      **"params": { "role": "DEALING\_ASSISTANT", "slaDays": 2 }**

    **},**

    **{**

      **"from": "SCRUTINY\_DA",**

      **"to": "PARALLEL\_REPORTS",**

      **"trigger": "USER",**

      **"allowedRoles": \["DEALING\_ASSISTANT"\],**

      **"conditions": \["BASIC\_DOCS\_OK"\],**

      **"actions": \["SPAWN\_PARALLEL\_TASKS"\],**

      **"params": {**

        **"joinType": "AND",**

        **"tasks": \[**

          **{ "role": "ENGINEERING\_WING", "slaDays": 5 },**

          **{ "role": "ESTATE\_ACCOUNTS", "slaDays": 5 },**

          **{ "role": "PLANNING\_WING", "slaDays": 5 },**

          **{ "role": "LEGAL\_WING", "slaDays": 5 }**

        **\]**

      **}**

    **},**

    **{**

      **"from": "SCRUTINY\_DA",**

      **"to": "QUERY\_PENDING",**

      **"trigger": "USER",**

      **"allowedRoles": \["DEALING\_ASSISTANT"\],**

      **"actions": \["RAISE\_QUERY", "SET\_EDIT\_LOCKS"\],**

      **"params": {**

        **"unlock": {**

          **"fields": \["/applicant/address", "/property/upn"\],**

          **"documents": \["DOC\_03\_SALE\_DEED", "DOC\_07\_AFFIDAVIT"\]**

        **},**

        **"slaPolicy": { "pause": true, "maxDaysToRespond": 15 }**

      **}**

    **},**

    **{**

      **"from": "PARALLEL\_REPORTS",**

      **"to": "FINAL\_APPROVAL",**

      **"trigger": "SYSTEM",**

      **"conditions": \["ALL\_PARALLEL\_TASKS\_COMPLETED"\],**

      **"actions": \["ASSIGN\_TASK"\],**

      **"params": { "role": "COMPETENT\_AUTHORITY", "slaDays": 2 }**

    **}**

  **\]**

**}**

**This matches your needs and aligns with your guide’s “states/transitions/rules/actions” model.**

---

## **3\) Step-by-step plan (right sequence) from requirements → MVP → hardening**

### **Phase 0 — Normalize requirements into a “common grammar”**

**Deliverables:**

1. **Service taxonomy: property-linked vs person/license vs infrastructure (water/sewer) etc.**  
2. **Common lifecycle definition (baseline states, baseline actions)**  
3. **Canonical data model: Application, Document, Task, Verification, Payment/Instrument, Output, Audit**

**Why: your “Detailed Approval Workflows” already suggests a standard skeleton; formalize it so configs don’t drift.**

---

### **Phase 1 — Define the configuration schemas (contract-first)**

**Deliverables:**

* **JSON schema (or equivalent) for:**  
  * **forms**  
  * **documents**  
  * **workflows**  
  * **rules**  
  * **templates**  
* **Config validation pipeline (CI): reject invalid configs early**

**Key choice:**

* **Pick one rules DSL early (e.g., JSONLogic-like structure) and standardize it.**

---

### **Phase 2 — Build the MVP platform spine (minimal but real)**

**Target: onboard 2–3 representative services end-to-end.**

**Backend MVP**

* **Application store (draft \+ submit)**  
* **Workflow engine: sequential routing**  
* **Officer inbox (role-based)**  
* **Query/resubmission loop with field/doc unlock**  
* **Audit events (append-only)**  
* **Basic notifications**

**Frontend MVP**

* **Config-driven form renderer (pages \+ validation)**  
* **Citizen dashboard (draft/submitted/query)**  
* **Officer workbench (view \+ act \+ remarks \+ query builder)**

**Pick services that cover:**

* **simple sequential approval**  
* **doc-heavy scrutiny**  
* **query/resubmission**  
* **issuance of PDF output**

**(Your “registration” style services are usually good early candidates because they’re mostly doc \+ scrutiny.)**

---

### **Phase 3 — Add “enterprise workflow” features**

1. **Parallel tasks \+ joins (AND/OR joins)**  
   **Needed for flows with multi-wing reports.**  
2. **SLA engine:**  
   * **working calendar**  
   * **per-stage SLA**  
   * **pause rules during query window**  
3. **Escalations \+ supervisor dashboards**

---

### **Phase 4 — Documents & verification maturity**

1. **Strong DMS:**  
   * **checksum, encryption, retention categories**  
   * **access logs (views/downloads)**  
2. **Document verification UI for officers**  
3. **Optional: Document AI integration (phased, not day-1)**  
   * **Your guide’s split-view verification is a solid best practice.**

---

### **Phase 5 — Physical verification / inspection best practices (recommended design)**

**Since many BRDs leave details open, implement a generic “Inspection Task” capability:**

**Minimum viable inspection (Phase 5a)**

* **Assign inspector (role-based)**  
* **Capture:**  
  * **visit date/time (actual)**  
  * **outcome (pass/fail/needs re-visit)**  
  * **remarks**  
  * **attachments (photos/pdf)**  
* **Gate approval by rule if required (config flag)**

**Best-practice inspection (Phase 5b)**

* **Scheduling (slot selection) when citizen presence/originals required (some BRDs mention appointment scheduling as a possible feature)**  
* **Geo-tagged photos (mobile capture) \+ timestamp**  
* **Checklist templates per service/inspection type**  
* **Offline mode (queue upload when network returns)**

**This avoids per-service inspection code: inspection becomes a capability invoked by workflow config.**

---

### **Phase 6 — Hardening for production / scale**

1. **Security:**  
   * **strict RBAC \+ masking policies**  
   * **encrypted docs at rest \+ TLS**  
   * **admin actions audited**  
2. **Reliability:**  
   * **idempotency (submit/payment callbacks)**  
   * **retries with dead-letter queues for notifications/actions**  
3. **Observability:**  
   * **metrics per state, SLA breach rates**  
   * **structured logs \+ tracing**  
4. **DR:**  
   * **backups, restore drills (RPO/RTO)**  
5. **Performance:**  
   * **index strategy for inbox queries**  
   * **caching for configs \+ master data**

---

## **4\) Design trade-offs, risks, and how to handle them**

### **Trade-off 1 — “Config flexibility” vs “config chaos”**

**Risk: if configs become too expressive, they become a second programming language with runtime failures.**

**Mitigations**

* **Use schema validation \+ “lint rules” for configs in CI**  
* **Provide a workflow simulator (test harness) that runs example payloads through transitions**  
* **Prefer *composable patterns*:**  
  * **`SequentialStage`**  
  * **`ParallelStage(AND/OR)`**  
  * **`QueryLoop`**  
  * **`InspectionStage`**  
  * **`PaymentGate`**

**This keeps “power” but reduces freedom to create untestable graphs.**

---

### **Trade-off 2 — Workflow versioning & in-flight applications**

**Risk: publishing a new workflow/form version can break in-flight apps.**

**Mitigation (recommended default)**

* **Each application stores `serviceConfigVersion` at submission time.**  
* **New versions apply to new applications only.**  
* **Add a controlled “migration tool” later for exceptional cases.**

**This is extremely important for government auditability.**

---

### **Trade-off 3 — Parallel approvals are harder than sequential**

**Risk: joins, partial failures, timeouts, rework loops across branches.**

**Mitigation**

* **Implement parallelism as:**  
  * **spawned child tasks with explicit completion state**  
  * **a parent join rule (`ALL_DONE`, `ANY_APPROVED`, `ANY_REJECTED`)**  
* **Define deterministic behavior:**  
  * **if any branch raises query → does it query citizen or just request internal clarification?**  
  * **if citizen query happens → do you cancel all parallel tasks or keep them?**

**Start with one supported pattern: AND join with fail-fast on reject, and expand only if BRDs require.**

---

### **Trade-off 4 — Data modeling: JSON payloads vs relational columns**

**Risk: fully dynamic JSON is flexible but harder for reporting and inbox filtering.**

**Mitigation**

* **Store `applicationPayload` in JSONB (Postgres), plus a small set of indexed “derived columns”:**  
  * **`authorityId`, `serviceId`, `currentState`, `currentAssigneeRole`, `applicantId`, `upn` etc.**  
* **Maintain those derived columns through workflow actions/events.**

**This keeps configurability without killing performance.**

---

### **Trade-off 5 — Multi-authority support (PUDA/GMADA/GLADA/BDA)**

**You said workflows/SLAs same, but officer designations differ. That matches your guide’s recommended abstraction.**

**Mitigation**

* **Keep workflow roles as stable system roles (e.g., `CLERK`, `JR_ENGINEER`, `ESTATE_OFFICER`)**  
* **Maintain per-authority mapping tables:**  
  * **designation → system role**  
  * **user → designation**

---

### **Risk — Ambiguity in “physical verification”**

**Many BRDs list it but don’t fully define evidence requirements.**

**Mitigation**

* **Make verification a first-class capability with config-driven evidence:**  
  * **`requiredEvidence`: photos, checklist, report pdf, geo-tag required, etc.**  
* **Keep it minimal in MVP; expand after field feedback.**

---

### **Risk — Compliance/audit expectations**

**BRDs emphasize immutable audit trail, document integrity, access logs, and retention categories.**

**Mitigation**

* **Event-based audit log (append-only)**  
* **Store doc checksum \+ version chain**  
* **Separate “operational tables” from “audit tables”**  
* **Ensure audits can reconstruct lifecycle end-to-end**

---

## **A practical “starting architecture” recommendation (Node.js \+ React)**

**To move fast while staying enterprise-grade:**

### **MVP architecture style: modular monolith**

**One Node backend repo (NestJS/Express style), but with clear modules:**

* **Config**  
* **Workflow**  
* **Applications**  
* **Documents**  
* **Auth/Entitlements**  
* **Notifications**  
* **Output generation**  
* **Audit**

**Internally event-driven (outbox pattern), so later you can split into microservices if needed.**

### **Data/storage**

* **PostgreSQL (workflow/tasks/apps/audit metadata)**  
* **S3-compatible object storage (docs/outputs)**  
* **Redis (config cache, session, rate limiting)**  
* **Queue (RabbitMQ/SQS) for async actions (notifications, PDF gen, doc AI)**

**This fits 50–100k apps/year comfortably, as long as inbox queries are indexed and documents are offloaded to object storage.**

## **Artifact 1 — JSON Schema (Platform \+ Service \+ Authority Config)**

**This schema is designed so services can be onboarded/configured “configuration over code” , with workflows modeled as a state machine \+ transitions \+ rules \+ actions , and with authorization kept separate from workflow logic using “designation → system role” mapping . It also bakes in consistent query/resubmission patterns (including “only explicitly unlocked fields/docs editable”) and payment states used by fee-based services (Payment Pending/Failed) .**

**{**

  **"$schema": "https://json-schema.org/draft/2020-12/schema",**

  **"$id": "https://example.gov/puda/config/uda-platform-config.schema.json",**

  **"title": "UDA Platform Config (Services \+ Authorities \+ Workflow \+ Forms) \- v1",**

  **"type": "object",**

  **"required": \["schemaVersion", "expressionLanguage", "authorities", "systemRoles", "services"\],**

  **"additionalProperties": false,**

  **"properties": {**

    **"schemaVersion": { "type": "string", "const": "1.0.0" },**

    **"expressionLanguage": { "type": "string", "enum": \["jsonlogic", "cel"\] },**

    **"authorities": {**

      **"type": "array",**

      **"minItems": 1,**

      **"items": { "$ref": "\#/$defs/AuthorityConfig" }**

    **},**

    **"systemRoles": {**

      **"description": "Stable platform roles (NOT designations). Designations map to these per authority.",**

      **"type": "array",**

      **"minItems": 1,**

      **"items": { "$ref": "\#/$defs/SystemRole" }**

    **},**

    **"services": {**

      **"type": "array",**

      **"minItems": 1,**

      **"items": { "$ref": "\#/$defs/ServiceConfig" }**

    **},**

    **"sharedPolicies": {**

      **"type": "object",**

      **"additionalProperties": false,**

      **"properties": {**

        **"queryPolicy": { "$ref": "\#/$defs/QueryPolicy" },**

        **"documentStoragePolicy": { "$ref": "\#/$defs/DocumentStoragePolicy" }**

      **}**

    **}**

  **},**

  **"$defs": {**

    **"AuthorityConfig": {**

      **"type": "object",**

      **"required": \["authorityId", "displayName", "designationToSystemRole"\],**

      **"additionalProperties": false,**

      **"properties": {**

        **"authorityId": { "type": "string", "pattern": "^\[A-Z0-9\_\\\\-\]{2,40}$" },**

        **"displayName": { "type": "string", "minLength": 2 },**

        **"locale": { "type": "string", "default": "en-IN" },**

        **"timeZone": { "type": "string", "default": "Asia/Kolkata" },**

        **"designations": {**

          **"description": "Optional catalog of designations used by this authority (admin-managed).",**

          **"type": "array",**

          **"items": {**

            **"type": "object",**

            **"required": \["designationId", "designationName"\],**

            **"additionalProperties": false,**

            **"properties": {**

              **"designationId": { "type": "string", "pattern": "^\[A-Z0-9\_\\\\-\]{2,60}$" },**

              **"designationName": { "type": "string" }**

            **}**

          **}**

        **},**

        **"designationToSystemRole": {**

          **"description": "Authority-specific mapping layer: Designation \+ Authority \-\> System Role (stable).",**

          **"type": "array",**

          **"minItems": 1,**

          **"items": {**

            **"type": "object",**

            **"required": \["designationId", "systemRoleId"\],**

            **"additionalProperties": false,**

            **"properties": {**

              **"designationId": { "type": "string" },**

              **"systemRoleId": { "type": "string" }**

            **}**

          **}**

        **}**

      **}**

    **},**

    **"SystemRole": {**

      **"type": "object",**

      **"required": \["systemRoleId", "displayName"\],**

      **"additionalProperties": false,**

      **"properties": {**

        **"systemRoleId": { "type": "string", "pattern": "^\[A-Z0-9\_\\\\-\]{2,60}$" },**

        **"displayName": { "type": "string" },**

        **"description": { "type": "string" }**

      **}**

    **},**

    **"ServiceConfig": {**

      **"type": "object",**

      **"required": \["serviceKey", "displayName", "applicableAuthorityIds", "versions"\],**

      **"additionalProperties": false,**

      **"properties": {**

        **"serviceKey": { "type": "string", "pattern": "^\[a-z0-9\]\[a-z0-9\_\\\\-\]{2,80}$" },**

        **"displayName": { "type": "string" },**

        **"category": { "type": "string" },**

        **"applicableAuthorityIds": {**

          **"type": "array",**

          **"minItems": 1,**

          **"items": { "type": "string" }**

        **},**

        **"currentPublishedVersion": { "type": "string" },**

        **"versions": {**

          **"type": "array",**

          **"minItems": 1,**

          **"items": { "$ref": "\#/$defs/ServiceVersion" }**

        **}**

      **}**

    **},**

    **"ServiceVersion": {**

      **"type": "object",**

      **"required": \["version", "status", "effectiveFrom", "form", "documents", "workflow"\],**

      **"additionalProperties": false,**

      **"properties": {**

        **"version": { "type": "string", "pattern": "^\[0-9\]+\\\\.\[0-9\]+\\\\.\[0-9\]+$" },**

        **"status": { "type": "string", "enum": \["draft", "published", "retired"\] },**

        **"effectiveFrom": { "type": "string", "format": "date-time" },**

        **"effectiveTo": { "type": "string", "format": "date-time" },**

        **"policies": {**

          **"type": "object",**

          **"additionalProperties": false,**

          **"properties": {**

            **"queryPolicy": { "$ref": "\#/$defs/QueryPolicy" },**

            **"slaPolicy": { "$ref": "\#/$defs/SlaPolicy" }**

          **}**

        **},**

        **"fees": { "$ref": "\#/$defs/FeePolicy" },**

        **"form": { "$ref": "\#/$defs/FormConfig" },**

        **"documents": {**

          **"type": "array",**

          **"items": { "$ref": "\#/$defs/DocumentType" }**

        **},**

        **"workflow": { "$ref": "\#/$defs/WorkflowConfig" },**

        **"outputs": {**

          **"type": "array",**

          **"items": { "$ref": "\#/$defs/OutputTemplate" }**

        **},**

        **"notifications": {**

          **"type": "array",**

          **"items": { "$ref": "\#/$defs/NotificationRule" }**

        **}**

      **}**

    **},**

    **"QueryPolicy": {**

      **"description": "Supports query \+ resubmission loop with field/doc unlock controls.",**

      **"type": "object",**

      **"additionalProperties": false,**

      **"properties": {**

        **"enabled": { "type": "boolean", "default": true },**

        **"unlockMode": {**

          **"description": "Explicit unlock is recommended: applicant can only edit fields/docs explicitly unlocked by officer.",**

          **"type": "string",**

          **"enum": \["explicit", "bySection", "allEditable"\]**

        **},**

        **"defaultUnlockedFieldKeys": { "type": "array", "items": { "type": "string" } },**

        **"defaultUnlockedDocTypeIds": { "type": "array", "items": { "type": "string" } },**

        **"maxQueryCycles": { "type": "integer", "minimum": 0, "default": 10 },**

        **"citizenResponseWindowDays": { "type": "integer", "minimum": 1, "default": 30 },**

        **"slaTimerBehavior": {**

          **"type": "string",**

          **"enum": \["pauseWhileQueryPending", "continue", "resetOnResubmission"\],**

          **"default": "pauseWhileQueryPending"**

        **}**

      **}**

    **},**

    **"DocumentStoragePolicy": {**

      **"type": "object",**

      **"additionalProperties": false,**

      **"properties": {**

        **"checksumAlgorithm": { "type": "string", "enum": \["sha256", "sha512"\], "default": "sha256" },**

        **"versioningEnabled": { "type": "boolean", "default": true },**

        **"virusScanEnabled": { "type": "boolean", "default": true }**

      **}**

    **},**

    **"FeePolicy": {**

      **"type": "object",**

      **"additionalProperties": false,**

      **"properties": {**

        **"mode": { "type": "string", "enum": \["none", "gateway", "offline\_instrument"\], "default": "none" },**

        **"gateway": {**

          **"type": "object",**

          **"additionalProperties": false,**

          **"properties": {**

            **"providerKey": { "type": "string" },**

            **"amountRule": { "$ref": "\#/$defs/RuleExpr" },**

            **"currency": { "type": "string", "default": "INR" }**

          **}**

        **},**

        **"offlineInstrument": {**

          **"description": "Used for DD/BG style services. Capture fields in form \+ verification in workflow.",**

          **"type": "object",**

          **"additionalProperties": false,**

          **"properties": {**

            **"instrumentTypes": {**

              **"type": "array",**

              **"items": { "type": "string", "enum": \["DD", "BG", "CHALLAN", "RECEIPT\_UPLOAD"\] }**

            **}**

          **}**

        **},**

        **"paymentStates": {**

          **"description": "Optional, but aligns with services that model Payment Pending/Failed states.",**

          **"type": "object",**

          **"additionalProperties": false,**

          **"properties": {**

            **"pendingStateId": { "type": "string", "default": "PAYMENT\_PENDING" },**

            **"failedStateId": { "type": "string", "default": "PAYMENT\_FAILED" }**

          **}**

        **}**

      **}**

    **},**

    **"SlaPolicy": {**

      **"type": "object",**

      **"additionalProperties": false,**

      **"properties": {**

        **"serviceSlaDays": { "type": "integer", "minimum": 0 },**

        **"escalationEnabled": { "type": "boolean", "default": true }**

      **}**

    **},**

    **"FormConfig": {**

      **"type": "object",**

      **"required": \["pages"\],**

      **"additionalProperties": false,**

      **"properties": {**

        **"pages": {**

          **"type": "array",**

          **"minItems": 1,**

          **"items": { "$ref": "\#/$defs/FormPage" }**

        **},**

        **"dataModel": {**

          **"description": "Optional: JSON Schema for submitted data shape (for stronger validation).",**

          **"type": "object"**

        **}**

      **}**

    **},**

    **"FormPage": {**

      **"type": "object",**

      **"required": \["pageId", "title", "sections"\],**

      **"additionalProperties": false,**

      **"properties": {**

        **"pageId": { "type": "string", "pattern": "^\[A-Z0-9\_\\\\-\]{2,60}$" },**

        **"title": { "type": "string" },**

        **"visibility": { "$ref": "\#/$defs/RuleExpr" },**

        **"sections": {**

          **"type": "array",**

          **"minItems": 1,**

          **"items": { "$ref": "\#/$defs/FormSection" }**

        **}**

      **}**

    **},**

    **"FormSection": {**

      **"type": "object",**

      **"required": \["sectionId", "title", "fields"\],**

      **"additionalProperties": false,**

      **"properties": {**

        **"sectionId": { "type": "string", "pattern": "^\[A-Z0-9\_\\\\-\]{2,60}$" },**

        **"title": { "type": "string" },**

        **"helpText": { "type": "string" },**

        **"fields": {**

          **"type": "array",**

          **"minItems": 1,**

          **"items": { "$ref": "\#/$defs/FieldDef" }**

        **}**

      **}**

    **},**

    **"FieldDef": {**

      **"type": "object",**

      **"required": \["key", "label", "type"\],**

      **"additionalProperties": false,**

      **"properties": {**

        **"key": { "type": "string", "pattern": "^\[a-zA-Z0-9\_.\\\\-\]{2,120}$" },**

        **"label": { "type": "string" },**

        **"type": {**

          **"type": "string",**

          **"enum": \[**

            **"string",**

            **"text",**

            **"number",**

            **"date",**

            **"datetime",**

            **"boolean",**

            **"enum",**

            **"multiselect",**

            **"address",**

            **"phone",**

            **"email",**

            **"pan",**

            **"aadhaar",**

            **"fileRef",**

            **"table"**

          **\]**

        **},**

        **"required": { "$ref": "\#/$defs/RuleExpr" },**

        **"readOnly": { "$ref": "\#/$defs/RuleExpr" },**

        **"visibility": { "$ref": "\#/$defs/RuleExpr" },**

        **"defaultValue": {},**

        **"placeholder": { "type": "string" },**

        **"validations": {**

          **"type": "array",**

          **"items": { "$ref": "\#/$defs/ValidationRule" }**

        **},**

        **"ui": {**

          **"type": "object",**

          **"additionalProperties": true,**

          **"properties": {**

            **"widget": { "type": "string" },**

            **"columns": { "type": "integer", "minimum": 1, "maximum": 12 },**

            **"options": { "type": "array", "items": {} }**

          **}**

        **},**

        **"lookup": {**

          **"description": "Optional data lookup (e.g., property DB by UPN) to prefill/validate.",**

          **"type": "object",**

          **"additionalProperties": false,**

          **"properties": {**

            **"provider": { "type": "string", "enum": \["property\_db", "custom\_api"\] },**

            **"inputKeys": { "type": "array", "items": { "type": "string" } },**

            **"mapToKeys": {**

              **"type": "array",**

              **"items": {**

                **"type": "object",**

                **"required": \["from", "to"\],**

                **"additionalProperties": false,**

                **"properties": { "from": { "type": "string" }, "to": { "type": "string" } }**

              **}**

            **}**

          **}**

        **},**

        **"table": {**

          **"description": "For repeatable rows (e.g., legal heirs/transferees).",**

          **"type": "object",**

          **"additionalProperties": false,**

          **"properties": {**

            **"rowKey": { "type": "string" },**

            **"minRows": { "type": "integer", "minimum": 0 },**

            **"maxRows": { "type": "integer", "minimum": 1 },**

            **"columns": { "type": "array", "items": { "$ref": "\#/$defs/FieldDef" } }**

          **}**

        **}**

      **}**

    **},**

    **"ValidationRule": {**

      **"type": "object",**

      **"required": \["ruleType"\],**

      **"additionalProperties": false,**

      **"properties": {**

        **"ruleType": {**

          **"type": "string",**

          **"enum": \["minLength", "maxLength", "regex", "min", "max", "custom"\]**

        **},**

        **"value": {},**

        **"message": { "type": "string" },**

        **"when": { "$ref": "\#/$defs/RuleExpr" }**

      **}**

    **},**

    **"DocumentType": {**

      **"type": "object",**

      **"required": \["docTypeId", "displayName"\],**

      **"additionalProperties": false,**

      **"properties": {**

        **"docTypeId": { "type": "string", "pattern": "^\[A-Z0-9\_\\\\-\]{2,60}$" },**

        **"displayName": { "type": "string" },**

        **"mandatory": { "$ref": "\#/$defs/RuleExpr" },**

        **"allowedMimeTypes": {**

          **"type": "array",**

          **"items": { "type": "string" },**

          **"default": \["application/pdf", "image/jpeg", "image/png"\]**

        **},**

        **"maxSizeMB": { "type": "integer", "minimum": 1, "default": 10 },**

        **"multiple": { "type": "boolean", "default": false },**

        **"requiresOriginalSubmission": { "type": "boolean", "default": false },**

        **"requiredAtStateIds": { "type": "array", "items": { "type": "string" } }**

      **}**

    **},**

    **"WorkflowConfig": {**

      **"type": "object",**

      **"required": \["workflowId", "initialStateId", "states", "transitions"\],**

      **"additionalProperties": false,**

      **"properties": {**

        **"workflowId": { "type": "string", "pattern": "^\[A-Z0-9\_\\\\-\]{2,80}$" },**

        **"initialStateId": { "type": "string" },**

        **"states": {**

          **"type": "array",**

          **"minItems": 1,**

          **"items": { "$ref": "\#/$defs/StateDef" }**

        **},**

        **"transitions": {**

          **"type": "array",**

          **"minItems": 1,**

          **"items": { "$ref": "\#/$defs/TransitionDef" }**

        **},**

        **"actionsCatalog": {**

          **"description": "Reusable action templates referenced by transitions/states.",**

          **"type": "object",**

          **"additionalProperties": { "$ref": "\#/$defs/ActionDef" }**

        **},**

        **"rulesCatalog": {**

          **"description": "Reusable rules referenced by transitions/states.",**

          **"type": "object",**

          **"additionalProperties": { "$ref": "\#/$defs/RuleExpr" }**

        **}**

      **}**

    **},**

    **"StateDef": {**

      **"type": "object",**

      **"required": \["stateId", "name", "stateType", "actor"\],**

      **"additionalProperties": false,**

      **"properties": {**

        **"stateId": { "type": "string", "pattern": "^\[A-Z0-9\_\\\\-\]{2,80}$" },**

        **"name": { "type": "string" },**

        **"stateType": { "type": "string", "enum": \["simple", "parallel", "terminal"\] },**

        **"actor": { "type": "string", "enum": \["citizen", "officer", "system"\] },**

        **"allowedSystemRoleIds": {**

          **"type": "array",**

          **"items": { "type": "string" }**

        **},**

        **"formMode": { "type": "string", "enum": \["edit", "read", "mixed"\], "default": "read" },**

        **"editableFieldKeys": { "type": "array", "items": { "type": "string" } },**

        **"sla": {**

          **"type": "object",**

          **"additionalProperties": false,**

          **"properties": {**

            **"dueInHours": { "type": "integer", "minimum": 0 },**

            **"dueInDays": { "type": "integer", "minimum": 0 }**

          **}**

        **},**

        **"assignment": {**

          **"description": "How officer tasks are assigned at this state.",**

          **"type": "object",**

          **"additionalProperties": false,**

          **"properties": {**

            **"strategy": { "type": "string", "enum": \["manual", "round\_robin", "least\_loaded", "by\_role\_pool"\] },**

            **"rolePoolSystemRoleIds": { "type": "array", "items": { "type": "string" } }**

          **}**

        **},**

        **"parallel": {**

          **"description": "Parallel approvals: multiple branches, then join.",**

          **"type": "object",**

          **"additionalProperties": false,**

          **"properties": {**

            **"branches": {**

              **"type": "array",**

              **"minItems": 2,**

              **"items": {**

                **"type": "object",**

                **"required": \["branchId", "startStateId", "endStateIds"\],**

                **"additionalProperties": false,**

                **"properties": {**

                  **"branchId": { "type": "string" },**

                  **"startStateId": { "type": "string" },**

                  **"endStateIds": { "type": "array", "items": { "type": "string" }, "minItems": 1 }**

                **}**

              **}**

            **},**

            **"join": {**

              **"type": "object",**

              **"required": \["mode", "nextStateId"\],**

              **"additionalProperties": false,**

              **"properties": {**

                **"mode": { "type": "string", "enum": \["allOf", "anyOf"\] },**

                **"nextStateId": { "type": "string" }**

              **}**

            **}**

          **}**

        **},**

        **"onEnterActions": { "type": "array", "items": { "$ref": "\#/$defs/ActionRef" } },**

        **"onExitActions": { "type": "array", "items": { "$ref": "\#/$defs/ActionRef" } }**

      **}**

    **},**

    **"TransitionDef": {**

      **"type": "object",**

      **"required": \["transitionId", "fromStateId", "toStateId", "trigger"\],**

      **"additionalProperties": false,**

      **"properties": {**

        **"transitionId": { "type": "string", "pattern": "^\[A-Z0-9\_\\\\-\]{2,80}$" },**

        **"fromStateId": { "type": "string" },**

        **"toStateId": { "type": "string" },**

        **"trigger": { "type": "string", "enum": \["manual", "system", "timer", "api"\] },**

        **"uiActionId": {**

          **"description": "For manual transitions: e.g., FORWARD / RAISE\_QUERY / APPROVE / REJECT / RESUBMIT / PAYMENT\_SUCCESS.",**

          **"type": "string"**

        **},**

        **"allowedSystemRoleIds": { "type": "array", "items": { "type": "string" } },**

        **"guard": { "$ref": "\#/$defs/RuleExpr" },**

        **"actions": { "type": "array", "items": { "$ref": "\#/$defs/ActionRef" } }**

      **}**

    **},**

    **"RuleExpr": {**

      **"description": "Expression evaluated by rules engine. Representation depends on expressionLanguage.",**

      **"oneOf": \[**

        **{ "type": "boolean" },**

        **{ "type": "string" },**

        **{ "type": "object" }**

      **\]**

    **},**

    **"ActionRef": {**

      **"oneOf": \[**

        **{ "type": "string" },**

        **{**

          **"type": "object",**

          **"required": \["actionId"\],**

          **"additionalProperties": false,**

          **"properties": {**

            **"actionId": { "type": "string" },**

            **"params": { "type": "object" }**

          **}**

        **}**

      **\]**

    **},**

    **"ActionDef": {**

      **"type": "object",**

      **"required": \["type"\],**

      **"additionalProperties": false,**

      **"properties": {**

        **"type": {**

          **"type": "string",**

          **"enum": \[**

            **"assignTask",**

            **"notify",**

            **"lockFields",**

            **"unlockFields",**

            **"requirePayment",**

            **"generateOutput",**

            **"createInspection",**

            **"callIntegration"**

          **\]**

        **},**

        **"params": { "type": "object" }**

      **}**

    **},**

    **"OutputTemplate": {**

      **"type": "object",**

      **"required": \["outputId", "displayName", "templateRef"\],**

      **"additionalProperties": false,**

      **"properties": {**

        **"outputId": { "type": "string", "pattern": "^\[A-Z0-9\_\\\\-\]{2,60}$" },**

        **"displayName": { "type": "string" },**

        **"templateRef": { "type": "string" },**

        **"generateWhen": { "$ref": "\#/$defs/RuleExpr" }**

      **}**

    **},**

    **"NotificationRule": {**

      **"type": "object",**

      **"required": \["event", "channels"\],**

      **"additionalProperties": false,**

      **"properties": {**

        **"event": {**

          **"type": "string",**

          **"enum": \[**

            **"APPLICATION\_SUBMITTED",**

            **"QUERY\_RAISED",**

            **"QUERY\_RESPONDED",**

            **"STATE\_CHANGED",**

            **"PAYMENT\_SUCCESS",**

            **"PAYMENT\_FAILED",**

            **"APPROVED",**

            **"REJECTED",**

            **"OUTPUT\_ISSUED"**

          **\]**

        **},**

        **"channels": {**

          **"type": "array",**

          **"items": { "type": "string", "enum": \["sms", "email", "in\_app"\] }**

        **},**

        **"templateRef": { "type": "string" },**

        **"when": { "$ref": "\#/$defs/RuleExpr" }**

      **}**

    **}**

  **}**

**}**

---

## **Artifact 2 — Reference implementation outline (Node.js \+ React)**

**Below is an implementation outline that matches your guide’s core idea: orchestrator driving a state machine \+ rules \+ actions , with strong separation between workflow execution and authorization , and designation→system-role mapping .**

### **1\) Suggested architecture (pragmatic \+ enterprise-ready)**

**Given \~50–100k applications/year, start as a modular monolith (single deploy, strict modules) and leave seams for later splitting.**

**Backend (Node.js/TypeScript) modules**

1. **Config Registry**  
   * **Stores `ServiceConfig` \+ `AuthorityConfig` as JSON (Postgres JSONB).**  
   * **Validates configs against the schema and runs a *config linter* (graph validity, missing states, forbidden transitions).**  
   * **Provides immutable versioning: `serviceKey + version` pinned on submission.**  
2. **Workflow Runtime**  
   * **Workflow Orchestrator: validates transition requests, checks entitlements, evaluates rules, commits state changes, and dispatches actions. Mirrors the “brain” described in your doc .**  
   * **State machine engine: graph traversal with explicit transition IDs.**  
   * **Parallel approvals: create a “parallel group” with N child tasks; join when ALL/ANY complete.**  
3. **Task / Worklist Service**  
   * **Creates tasks per officer-state and supports “only show tasks the user can act on” (pre-filtering) .**  
   * **Inbox queries by `(authorityId, stateId, systemRoleId)`.**  
4. **Authorization / Entitlement Service**  
   * **Implements mapping: `user -> designation + authority -> systemRole -> (service + state)` .**  
   * **Keeps workflow config role checks *simple* (system roles only).**  
5. **Application Data Service**  
   * **Persists application data JSON; enforces field editability rules (draft vs submitted vs query unlock).**  
   * **Maintains state \+ version pointers.**  
6. **Documents Service**  
   * **Handles upload via pre-signed URLs (S3 or equivalent), checksum & versioning (required in multiple BRDs) .**  
   * **Implements doc type rules, file type/size constraints, and optional virus scanning.**  
7. **Query/Resubmission Service**  
   * **Implements query loop and “explicit unlock” (only selected fields/docs editable) .**  
   * **SLA pause/continue/reset per `QueryPolicy`.**  
8. **Payments Service (optional per service)**  
   * **Supports Payment Pending/Failed states used by fee services .**  
   * **For offline instruments (DD/BG), store details and include officer verification tasks (as per service needs).**  
9. **Output/Template Service**  
   * **Generates PDFs/orders/certificates; stores immutable outputs.**  
   * **Triggered by workflow actions (e.g., `generateOutput` on approval).**  
10. **Audit/Event Log**  
* **Immutable append-only event log: application created/edited/submitted, doc uploads, workflow actions, query issued/resubmitted, decisions, payments (explicitly called out in BRDs) .**

**Async processing**

* **Use a queue (BullMQ/Redis) for action execution (notifications, document generation, integration calls).**  
* **Actions must be idempotent (your guide explicitly calls this out) .**

---

### **2\) Core runtime flow (what happens on every officer action)**

1. **Load application (includes `serviceKey`, `serviceVersion`, `authorityId`, current `stateId`).**  
2. **Load pinned config for `serviceKey@version`.**  
3. **Authorize: compute system roles for the user (via designation mapping) , check transition’s `allowedSystemRoleIds`.**  
4. **Validate transition:**  
   * **Ensure `fromStateId` matches current state and transition exists.**  
   * **Evaluate `guard` rules (rules engine).**  
   * **For query action: enforce `unlockMode=explicit` etc.**  
5. **Commit:**  
   * **Use DB transaction with optimistic locking (`application.rowVersion`).**  
   * **Create/close tasks.**  
   * **Write audit events (append-only).**  
6. **Dispatch actions:**  
   * **Enqueue actions; mark action instances with idempotency keys.**

---

### **3\) Data model (Postgres suggested)**

**Tables (minimum viable, enterprise-friendly)**

* **`authority(authority_id, name, ...)`**  
* **`designation(designation_id, authority_id, name)`**  
* **`user(user_id, login, password_hash, ...)`**  
* **`user_posting(user_id, authority_id, designation_id, active_from, active_to)`**  
* **`system_role(system_role_id, name)`**  
* **`designation_role_map(authority_id, designation_id, system_role_id)` ← implements mapping layer**  
* **`service(service_key, name, ...)`**  
* **`service_version(service_key, version, status, effective_from, effective_to, config_jsonb, checksum)`**  
* **`application(arn, service_key, service_version, authority_id, applicant_user_id, state_id, data_jsonb, row_version, created_at, updated_at)`**  
* **`task(task_id, arn, state_id, system_role_id, assignee_user_id nullable, status, sla_due_at, created_at, completed_at, decision, remarks)`**  
* **`query(query_id, arn, raised_task_id, message, unlocked_field_keys text[], unlocked_doc_type_ids text[], due_at, responded_at)`**  
* **`document(doc_id, arn, doc_type_id, version, storage_key, mime_type, size_bytes, checksum, uploaded_by, uploaded_at)`**  
* **`payment(payment_id, arn, status, provider_ref, amount, metadata_jsonb)`**  
* **`output(output_id, arn, template_id, storage_key, checksum, generated_at)`**  
* **`audit_event(event_id, arn, actor_type, actor_id, event_type, payload_jsonb, created_at)` (append-only)**

---

### **4\) Rules engine choice (JSON-friendly)**

**You said “prefer JSON”, so JSONLogic is a good fit for `expressionLanguage=jsonlogic` because expressions are JSON objects (not strings).**

* **Compile/evaluate with a restricted function set (no arbitrary JS).**  
* **Input context: `{ app, user, authority, task, now }`.**

**If you choose `cel`, keep expressions as strings and evaluate via a CEL library; also safe but less “pure JSON”.**

---

### **5\) React front-end implementation outline (config-driven)**

**Citizen UI**

* **`ServiceLanding` loads config for authority \+ service version.**  
* **`DynamicFormRenderer`**  
  * **Renders pages/sections/fields from config**  
  * **Uses React Hook Form**  
  * **Builds runtime validation from `FieldDef.validations`**  
  * **Enforces `required/visibility/readOnly` expressions**  
* **`DocumentsUploader` uses document config to enforce checklist, file constraints.**  
* **`ApplicationTimeline` shows state/task history (from audit events).**

**Officer UI**

* **`Worklist` queries tasks filtered by entitlements (pre-filtering) .**  
* **`ApplicationReview` shows citizen data \+ documents \+ internal remarks.**  
* **`RaiseQuery` UX: checkbox list of fields/docs to unlock (because “explicit unlock” is a business rule) .**  
* **`DecisionPanel`: approve/reject/forward with mandatory remarks where configured.**

---

### **6\) Physical verification / inspection — best-practice baseline**

**Since many services say “physical verification required”, treat it as a configurable sub-flow:**

* **`createInspection` action creates an inspection task with:**  
  * **checklist (config-driven),**  
  * **geo-tag (optional),**  
  * **photo uploads,**  
  * **remarks,**  
  * **outcome (Pass/Fail/Needs revisit),**  
  * **optional scheduling fields.**  
* **Add a rule like “final approval blocked until verification complete” (your BRDs already describe this pattern) .**

**This keeps it reusable across services without hardcoding.**

---

### **7\) Config/versioning strategy (to avoid “breaking in-flight cases”)**

* **Pin version on submit: drafts can float; once submitted, application stores `service_version`.**  
* **Parallel publish: publish `1.1.0` while `1.0.0` continues for in-flight apps.**  
* **Config migration: if ever needed, support an explicit “migrate application from v1 to v2” admin tool (rare, controlled).**

---

### **8\) Minimum API surface (illustrative)**

* **`GET /config/services/:serviceKey?authorityId=...`**  
* **`POST /applications` (create draft)**  
* **`PUT /applications/:arn` (edit draft / query-allowed edits)**  
* **`POST /applications/:arn/submit`**  
* **`GET /applications/:arn` (citizen/officer view)**  
* **`POST /documents/presign` → returns upload URL**  
* **`POST /tasks/:taskId/actions` (FORWARD/QUERY/APPROVE/REJECT)**  
* **`POST /applications/:arn/query-response`**  
* **`POST /payments/initiate` / `POST /payments/webhook`**  
* **`GET /outputs/:arn`**

---

**If you want, I can also provide a concrete example JSON config for one service (e.g., “Permission for Sale/Gift/Transfer” showing payment pending/failed \+ query loop \+ sequential approvals) based on the BRD’s state model .**

