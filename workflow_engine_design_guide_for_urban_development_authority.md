# Developer Guide: Configurable Workflow Engine for Urban Development Authorities

## 1. Purpose of This Document
This document serves as a **developer and architecture guide** for building a **scalable, configurable, and regulation-resilient workflow engine** for Urban Development Authorities (UDAs). The goal is to enable multiple citizen services (40–50+) to be onboarded **without rewriting code**, while allowing frequent policy, rule, and organizational changes.

---

## 2. Design Principles

### 2.1 Configuration Over Code
- No hardcoding of workflows, roles, rules, or validations
- All service behavior must be data-driven
- Changes should be possible without redeployment

### 2.2 Separation of Concerns
- Workflow execution ≠ authorization ≠ document validation
- Each capability should evolve independently

### 2.3 Auditability & Transparency
- Every decision, transition, and override must be traceable
- AI-assisted steps must be explainable

### 2.4 Government-Ready
- Supports hierarchy-based approvals
- Handles heavy documentation
- Adapts across municipalities, departments, and authorities

---

## 3. High-Level Architecture

```
Citizen UI / Officer UI
        |
        v
Workflow Orchestrator
        |
 ---------------------------------------------------
 | State Machine | Rules Engine | Action Executor |
 ---------------------------------------------------
        |
 Authorization / Entitlement Service
        |
 Document AI + Validation Layer
        |
 Master Data Systems (Land, Property, Tax, etc.)
```

---

## 4. Core Components of the Workflow Engine

### 4.1 State Machine
The **state machine** defines *where* an application is in its lifecycle.

#### Examples of States
- Draft
- Submitted
- Document Verification
- Field Inspection
- Approval Pending
- Approved
- Rejected

Each service defines its own valid states **via configuration**.

---

### 4.2 Transitions
Transitions define *how* an application moves from one state to another.

Each transition includes:
- From State
- To State
- Trigger (manual / system / AI)
- Preconditions (rules)
- Allowed Roles
- Actions to execute

Example:
```json
{
  "from": "Document Verification",
  "to": "Approval Pending",
  "allowedRoles": ["JUNIOR_ENGINEER"],
  "conditions": ["ALL_DOCS_VERIFIED"],
  "actions": ["NOTIFY_APPROVER"]
}
```

---

### 4.3 Rules Engine
The **rules engine** evaluates conditions dynamically.

Rules are expressed as **declarative logic**, not code.

#### Types of Rules
- Validation rules (document completeness)
- Eligibility rules (land use, zoning)
- Authorization rules (who can act)
- Transition guards

Rules can be:
- Boolean
- Scoring-based
- AI-assisted

---

### 4.4 Action Executor
Actions are **side effects** triggered during transitions.

Examples:
- Send SMS/email
- Assign next officer
- Generate inspection order
- Lock/unlock application
- Trigger AI validation

Actions should be:
- Idempotent
- Asynchronous where possible
- Logged

---

### 4.5 Workflow Orchestrator (4th Component)
The orchestrator:
- Drives the lifecycle
- Invokes rules at the right time
- Calls authorization before transitions
- Executes actions
- Persists audit logs

This is the **brain** of the engine.

---

## 5. Authorization & Entitlement Model

### 5.1 Why Authorization Is Separate
Authorization changes frequently due to:
- Transfers
- Promotions
- Inter-department differences

Hence it must NOT be embedded in workflow logic.

---

### 5.2 Role & Designation Abstraction

#### Key Insight
> **System roles are stable. Human designations are not.**

---

### 5.3 Authorization Mapping Layers

```
User ID
  ↓
Designation + Development Authority
  ↓
System Role
  ↓
(Service Type + State)
```

---

### 5.4 Example

- Designation: "Assistant Town Planner"
- Authority: "Municipal Corp A"
- Maps to System Role: `TECHNICAL_SCRUTINY_OFFICER`
- Allowed on:
  - Building Permit
  - State: "Technical Review"

---

### 5.5 Task Visibility (Pre-Filtering)
Users should **only see applications they can act on**.

Implementation:
- At login, compute allowed `(service, state)` combinations
- Query only matching applications

This avoids failed actions and improves UX.

---

## 6. Admin & Governance Model

### 6.1 Admin Responsibilities
Admin users (not developers) manage:
- User ↔ Designation mapping
- Designation ↔ System Role mapping
- Authority-specific overrides

### 6.2 Implementation Team Responsibilities
- Define states
- Define transitions
- Define rules
- Define actions

This clean split ensures governance and scalability.

---

## 7. Document-Heavy Workflow Reimagined with AI

### 7.1 Traditional vs Modern Flow

| Traditional | AI-Enabled |
|-----------|------------|
| Physical documents | Digital upload |
| Manual checking | AI-assisted extraction |
| Subjective | Rule-based & explainable |
| Slow | Near real-time |

---

### 7.2 Document Validation Strategy

Each document type has a **validation checklist**.

Example: Property Document
- Property ID
- Owner Name
- Father’s Name
- Address
- PIN Code
- Tax Number

---

### 7.3 AI-Based Validation Flow

1. Citizen uploads PDF / Image
2. Document sent to Document AI
3. Extract structured fields
4. Compare with master systems
5. Flag missing or mismatched data
6. Produce validation report

---

## 8. Recommended Document AI Tools

### 8.1 Primary Tools
- Google Document AI
- Amazon Textract
- Azure Form Recognizer

### 8.2 Why Not Vector Store Alone?
- Vector stores are excellent for **retrieval**
- Structured field extraction requires **document parsers**
- Best approach:
  - Document AI → structured data
  - LLM → reasoning, explanation, discrepancy analysis

---

## 9. Accuracy & Language Support

- Typical accuracy: **90–95%** (higher with tuning)
- Supports Indian languages (Hindi, Tamil, Telugu, etc.)
- English remains strongest

Human-in-the-loop verification is still essential.

---

## 10. Document Review UI Design

### 10.1 Recommended UI Pattern

**Split View Interface**
- Left: Original document (PDF/Image)
- Right: Extracted fields

### 10.2 Interactive Verification
- Click a field → highlight source location
- Bounding boxes from Document AI
- Officer can accept / correct

This builds trust in AI outputs.

---

## 11. Workflow Integration

Once document verification completes:
1. Officer confirms AI results
2. System evaluates transition rules
3. Authorization is checked
4. Transition executed
5. Actions triggered

All steps logged.

---

## 12. End-to-End Example

**Service:** Building Permit

1. Citizen submits application
2. AI validates property documents
3. Officer reviews highlighted fields
4. Workflow moves to Technical Scrutiny
5. Only eligible officers see the task
6. Approval triggers next stage

No code changes required.

---

## 13. Final Recommendations

- Treat workflows as **living configurations**
- Keep authorization external
- Use AI to assist, not replace, officers
- Design for audit, scale, and change

---

## 14. Next Steps

- Convert configs to JSON/YAML schemas
- Build a Workflow Config UI
- Add simulation & testing for rule changes
- Introduce SLA and analytics layer

---

**End of Developer Guide**

