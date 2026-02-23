# PUDA Workflow Engine - Architecture and Design Document v2.0

**Version:** 2.0  
**Date:** February 2026  
**Status:** Reference Architecture  
**Scope:** Punjab Urban Development Authority (PUDA) and allied authorities (GMADA, GLADA, BDA)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Design Principles](#2-design-principles)
3. [System Context](#3-system-context)
4. [High-Level Architecture](#4-high-level-architecture)
5. [Core Components](#5-core-components)
6. [Configuration Layer](#6-configuration-layer)
7. [Data Models](#7-data-models)
8. [Workflow Engine](#8-workflow-engine)
9. [Authorization Model](#9-authorization-model)
10. [Fee and Payment Engine](#10-fee-and-payment-engine)
11. [Document Management](#11-document-management)
12. [Physical Verification](#12-physical-verification)
13. [Output Generation](#13-output-generation)
14. [Integration Architecture](#14-integration-architecture)
15. [Security Architecture](#15-security-architecture)
16. [API Design](#16-api-design)
17. [Technology Stack](#17-technology-stack)
18. [Non-Functional Requirements](#18-non-functional-requirements)
19. [Deployment Architecture](#19-deployment-architecture)
20. [Phased Implementation Plan](#20-phased-implementation-plan)
21. [Testing Strategy](#21-testing-strategy)
22. [Appendices](#22-appendices)

---

## 1. Executive Summary

### 1.1 Purpose

This document defines the architecture for a **configurable workflow engine** to digitize citizen services for Urban Development Authorities in Punjab, India. The platform will support 40-50+ services across multiple authorities (PUDA, GMADA, GLADA, BDA) with a "configuration over code" approach.

### 1.2 Key Objectives

| Objective | Description |
|-----------|-------------|
| **Zero-Code Service Onboarding** | New services added via configuration, not code changes |
| **Multi-Authority Support** | Same workflows, different officer designations per authority |
| **Regulatory Compliance** | Complete audit trails, document integrity, data protection |
| **Citizen-Centric** | 24x7 availability, mobile-friendly, status transparency |
| **Scalable** | Support 50,000-100,000 applications per year |

### 1.3 Document Scope

This architecture covers:
- All 30+ citizen services identified in BRDs
- Property-linked services (change of ownership, conveyance deed, etc.)
- Building/construction services (building plans, completion certificates, DPC)
- Utility services (water supply, sewerage connections)
- Registration services (architects, estate agents, promoters)
- Certificate services (no due certificate, copies of documents)

### 1.4 Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture Style | Modular Monolith | Faster development, clear module boundaries, future microservices path |
| Workflow Model | Configuration-driven State Machine | Flexibility without code changes |
| Rules Engine | JSONLogic | Pure JSON expressions, no code injection risk |
| Authorization | Designation → System Role Mapping | Handles frequent officer transfers |
| Data Storage | PostgreSQL with JSONB | Flexible schemas with relational integrity |
| State Model | Role-based states | Direct mapping to BRD requirements |

---

## 2. Design Principles

### 2.1 Configuration Over Code

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONFIGURATION LAYER                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │ Forms   │ │Documents│ │Workflows│ │  Rules  │ │Templates│   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                    RUNTIME ENGINE                               │
│         (Interprets configurations, executes workflows)         │
└─────────────────────────────────────────────────────────────────┘
```

**Principles:**
- No hardcoding of workflows, roles, rules, or validations
- All service behavior is data-driven
- Changes possible without redeployment
- Version-controlled configurations

### 2.2 Separation of Concerns

| Concern | Component | Rationale |
|---------|-----------|-----------|
| Workflow Execution | Workflow Engine | State transitions independent of business rules |
| Authorization | Entitlement Service | Role changes don't require workflow changes |
| Document Handling | Document Service | Storage, validation independent of workflow |
| Business Rules | Rules Engine | Declarative rules separate from execution |
| Notifications | Notification Service | Channel-agnostic event handling |

### 2.3 Auditability & Transparency

- Every state transition logged with actor, timestamp, remarks
- Document versions maintained with checksums
- AI-assisted steps (future) must be explainable
- Complete application lifecycle reconstructable from audit log

### 2.4 Government-Ready Design

- Hierarchy-based approvals (Clerk → Sr. Assistant → SDO → Estate Officer)
- Heavy documentation support with physical verification
- Multi-authority support with designation abstraction
- SLA tracking with escalation
- Working day calendar awareness

---

## 3. System Context

### 3.1 Context Diagram

```
                                    ┌─────────────────┐
                                    │   SMS Gateway   │
                                    └────────▲────────┘
                                             │
┌─────────────┐                              │
│   Citizen   │◄────────────────┐            │
└──────┬──────┘                 │            │
       │                        │            │
       ▼                        │            │
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                   PUDA WORKFLOW ENGINE                      │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Citizen     │  │ Officer     │  │ Admin       │         │
│  │ Portal      │  │ Workbench   │  │ Console     │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
       │              │                │              │
       ▼              ▼                ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  Property   │ │   Ledger/   │ │  Payment    │ │   eSign     │
│  Master DB  │ │  Accounts   │ │  Gateway    │ │   (NIC)     │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

### 3.2 User Roles

| Role Category | Roles | Description |
|---------------|-------|-------------|
| **External** | Citizen, Applicant, Legal Heir, Architect, Estate Agent, Promoter | Service consumers |
| **Internal** | Clerk, Sr. Assistant, Jr. Engineer, Draftsman, SDO, Estate Officer, Account Officer | Processing officers |
| **Administrative** | System Admin, Authority Admin | Configuration and user management |

### 3.3 Supported Authorities

| Authority ID | Name | Region |
|--------------|------|--------|
| PUDA | Punjab Urban Development Authority | State-wide |
| GMADA | Greater Mohali Area Development Authority | Mohali |
| GLADA | Greater Ludhiana Area Development Authority | Ludhiana |
| BDA | Bathinda Development Authority | Bathinda |

---

## 4. High-Level Architecture

### 4.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PRESENTATION LAYER                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │  Citizen Portal │  │ Officer Portal  │  │  Admin Console  │              │
│  │  (React SPA)    │  │  (React SPA)    │  │  (React SPA)    │              │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘              │
└───────────┼────────────────────┼────────────────────┼────────────────────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API GATEWAY                                     │
│                    (Authentication, Rate Limiting, Routing)                  │
└─────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           APPLICATION LAYER                                  │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Config     │  │   Workflow   │  │ Application  │  │    Task      │     │
│  │   Registry   │  │   Engine     │  │   Service    │  │   Service    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Document   │  │   Payment    │  │    Fee       │  │   Output     │     │
│  │   Service    │  │   Service    │  │   Engine     │  │   Service    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │    Auth/     │  │ Notification │  │  Inspection  │  │    Audit     │     │
│  │ Entitlement  │  │   Service    │  │   Service    │  │   Service    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐                                         │
│  │    Rules     │  │    Query     │                                         │
│  │    Engine    │  │   Service    │                                         │
│  └──────────────┘  └──────────────┘                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA LAYER                                         │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  PostgreSQL  │  │    Redis     │  │    MinIO     │  │   RabbitMQ   │     │
│  │  (Primary)   │  │   (Cache)    │  │  (Documents) │  │   (Queue)    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INTEGRATION LAYER                                    │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Property   │  │   Ledger/    │  │   Payment    │  │    eSign     │     │
│  │   Master     │  │   Accounts   │  │   Gateway    │  │    (NIC)     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                       │
│  │     SMS      │  │    Email     │  │  Empaneled   │                       │
│  │   Gateway    │  │   Service    │  │   Registry   │                       │
│  └──────────────┘  └──────────────┘  └──────────────┘                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Module Responsibilities

| Module | Responsibility |
|--------|----------------|
| **Config Registry** | Store, validate, version service configurations |
| **Workflow Engine** | Execute state transitions, enforce guards, dispatch actions |
| **Application Service** | CRUD for applications, data validation, snapshot management |
| **Task Service** | Officer inbox, task assignment, SLA tracking |
| **Document Service** | Upload, version, validate documents |
| **Payment Service** | Gateway integration, offline instruments, reconciliation |
| **Fee Engine** | Calculate fees with time-based escalation |
| **Output Service** | Generate PDFs, digital signatures, QR codes |
| **Auth/Entitlement** | Login, session, role mapping, pre-filtering |
| **Notification Service** | SMS, email, in-app notifications |
| **Inspection Service** | Physical verification tasks, geo-tagging, checklists |
| **Audit Service** | Immutable event logging |
| **Rules Engine** | Evaluate JSONLogic expressions |
| **Query Service** | Query/resubmission loop, field unlock management |

---

## 5. Core Components

### 5.1 Component Interaction Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         APPLICATION LIFECYCLE                                 │
└──────────────────────────────────────────────────────────────────────────────┘

┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  DRAFT  │───▶│ SUBMIT  │───▶│ PAYMENT │───▶│ PROCESS │───▶│ DISPOSE │
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
     │              │              │              │              │
     ▼              ▼              ▼              ▼              ▼
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
│  Form   │   │Validate │   │   Fee   │   │Workflow │   │ Output  │
│ Render  │   │  Rules  │   │ Engine  │   │ Engine  │   │Generate │
└─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘
     │              │              │              │              │
     ▼              ▼              ▼              ▼              ▼
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
│  Doc    │   │  ARN    │   │ Payment │   │  Task   │   │ Digital │
│ Upload  │   │Generate │   │ Gateway │   │ Assign  │   │  Sign   │
└─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘
```

### 5.2 Workflow Orchestrator

The Workflow Orchestrator is the central component that drives application lifecycle.

```
┌─────────────────────────────────────────────────────────────────┐
│                    WORKFLOW ORCHESTRATOR                         │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    State Machine                         │    │
│  │  ┌─────────┐    ┌─────────┐    ┌─────────┐             │    │
│  │  │ States  │───▶│Transitions──▶│ Guards  │             │    │
│  │  └─────────┘    └─────────┘    └─────────┘             │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Rules Engine                          │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │    │
│  │  │ Validation  │  │ Eligibility │  │ Transition  │     │    │
│  │  │   Rules     │  │    Rules    │  │   Guards    │     │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   Action Executor                        │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │    │
│  │  │ Notify  │  │ Assign  │  │Generate │  │Integrate│    │    │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Responsibilities:**
1. Load application and pinned service configuration
2. Validate requested transition exists and is valid
3. Check authorization (user has required system role)
4. Evaluate guard conditions (rules engine)
5. Execute transition atomically (DB transaction)
6. Dispatch actions (async via queue)
7. Log audit events

### 5.3 State Machine

#### State Types

| Type | Description | Example |
|------|-------------|---------|
| `simple` | Single actor state | Pending at Clerk |
| `parallel` | Multiple concurrent tasks | Multi-wing reports (future) |
| `terminal` | End state | Approved, Rejected, Closed |

#### Standard State Model (Role-Based)

Based on BRD analysis, all services follow this state pattern:

```
                                    ┌──────────────────┐
                                    │      DRAFT       │
                                    │  (actor:citizen) │
                                    └────────┬─────────┘
                                             │ submit
                                             ▼
                                    ┌──────────────────┐
                                    │    SUBMITTED     │
                                    │  (actor:system)  │
                                    └────────┬─────────┘
                                             │ [if fee required]
                              ┌──────────────┴──────────────┐
                              ▼                              ▼
                    ┌──────────────────┐          ┌──────────────────┐
                    │ PAYMENT_PENDING  │          │   PENDING_AT_    │
                    │ (actor:citizen)  │          │     STAGE_1      │
                    └────────┬─────────┘          │ (actor:officer)  │
                             │ payment_success    └────────┬─────────┘
                             ▼                             │
                    ┌──────────────────┐                   │
                    │   PENDING_AT_    │◄──────────────────┘
                    │     STAGE_1      │
                    └────────┬─────────┘
                             │ forward / query / reject
           ┌─────────────────┼─────────────────┐
           ▼                 ▼                 ▼
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │ PENDING_AT_  │  │QUERY_PENDING │  │   REJECTED   │
  │   STAGE_2    │  │(actor:citizen│  │  (terminal)  │
  └──────┬───────┘  └──────┬───────┘  └──────────────┘
         │                 │ resubmit
         │                 ▼
         │         ┌──────────────┐
         │         │ RESUBMITTED  │────┐
         │         │(actor:system)│    │ (returns to originating stage)
         │         └──────────────┘    │
         │                             │
         ▼                             │
  ┌──────────────┐◄────────────────────┘
  │ PENDING_AT_  │
  │   STAGE_N    │
  └──────┬───────┘
         │ approve / reject
         ▼
  ┌──────────────┐
  │   APPROVED   │
  │  (terminal)  │
  └──────┬───────┘
         │ generate_output
         ▼
  ┌──────────────┐
  │    CLOSED    │
  │  (terminal)  │
  └──────────────┘
```

### 5.4 Rules Engine

#### Expression Language: JSONLogic

All rules are expressed as JSONLogic objects for:
- Safety (no code injection)
- Portability (pure JSON)
- Debuggability (serializable)

#### Rule Categories

| Category | Purpose | Example |
|----------|---------|---------|
| **Validation** | Field/document completeness | `{"!": {"var": "docs.DEATH_CERT"}}` → "Death certificate required" |
| **Eligibility** | Business eligibility checks | `{">=": [{"var": "property.area"}, 1000]}` → Above 1000 sq yards |
| **Authorization** | Who can act | Handled by entitlement service, not rules |
| **Transition Guard** | Can transition proceed | `{"and": [{"var": "docs_verified"}, {"var": "fee_paid"}]}` |
| **Conditional** | Field/doc visibility | `{"==": [{"var": "applicant_type"}, "COMPANY"]}` → Show company fields |

#### Rule Context

```json
{
  "app": {
    "arn": "PUDA/2026/00001",
    "data": { /* form data */ },
    "state": "PENDING_AT_CLERK",
    "docs": { "DEATH_CERT": true, "AFFIDAVIT": false }
  },
  "user": {
    "userId": "U001",
    "systemRoles": ["CLERK", "DEALING_ASSISTANT"]
  },
  "authority": {
    "authorityId": "PUDA",
    "workingCalendar": "PUNJAB_GOVT"
  },
  "task": {
    "taskId": "T001",
    "slaDueAt": "2026-02-10T17:00:00Z"
  },
  "now": "2026-02-04T10:30:00Z"
}
```

### 5.5 Action Executor

Actions are side effects triggered during state transitions.

#### Action Types

| Action Type | Description | Async |
|-------------|-------------|-------|
| `assignTask` | Create task for next role | No |
| `notify` | Send SMS/email/in-app notification | Yes |
| `generateOutput` | Create PDF certificate/letter | Yes |
| `createInspection` | Create physical verification task | No |
| `callIntegration` | Call external system | Yes |
| `lockFields` | Lock specified form fields | No |
| `unlockFields` | Unlock fields for query response | No |
| `updateMaster` | Update property master (post-approval) | Yes |
| `scheduleReminder` | Schedule SLA reminder | Yes |

#### Action Properties

All actions must be:
- **Idempotent:** Safe to retry on failure
- **Logged:** Execution recorded in audit
- **Retriable:** Failed actions go to dead-letter queue

---

## 6. Configuration Layer

### 6.1 Service Pack Structure

A service is onboarded as a "Service Pack" - a versioned configuration bundle:

```
service-packs/
└── permission_for_sale_transfer/
    ├── service.yaml           # Service metadata
    ├── form.json              # Form configuration
    ├── documents.json         # Document requirements
    ├── workflow.json          # State machine definition
    ├── rules.json             # Business rules
    ├── fees.json              # Fee schedule
    ├── notifications.json     # Notification templates
    └── templates/
        ├── permission_letter.html
        └── rejection_order.html
```

### 6.2 Service Definition Schema

```yaml
# service.yaml
serviceKey: permission_for_sale_transfer
displayName: Permission for Sale/Gift/Transfer
category: PROPERTY_SERVICES
description: Obtain prior permission/NOC from authority for sale/gift/transfer

applicableAuthorities:
  - PUDA
  - GMADA
  - GLADA
  - BDA

sla:
  totalDays: 10
  calendarType: WORKING_DAYS
  workingCalendar: PUNJAB_GOVT

prerequisites:
  - serviceKey: no_due_certificate
    required: conditional
    condition: { "not": { "var": "ndc_issued_online" } }

applicantTypes:
  - INDIVIDUAL
  - FIRM
  - COMPANY
  - COOPERATIVE_SOCIETY

physicalDocumentRequired: false
physicalVerificationRequired: true
```

### 6.3 Form Configuration Schema

```json
{
  "formId": "FORM_PERMISSION_SALE_TRANSFER",
  "version": "1.0.0",
  "pages": [
    {
      "pageId": "PAGE_APPLICANT",
      "title": "Applicant Details",
      "sections": [
        {
          "sectionId": "SEC_APPLICANT_TYPE",
          "title": "Type of Applicant",
          "fields": [
            {
              "key": "applicant_type",
              "label": "Applicant Type",
              "type": "enum",
              "required": true,
              "ui": {
                "widget": "radio",
                "options": [
                  { "value": "INDIVIDUAL", "label": "Individual" },
                  { "value": "FIRM", "label": "Firm" },
                  { "value": "COMPANY", "label": "Company" },
                  { "value": "COOPERATIVE", "label": "Cooperative Society" }
                ]
              }
            }
          ]
        },
        {
          "sectionId": "SEC_INDIVIDUAL",
          "title": "Individual Details",
          "visibility": { "==": [{ "var": "applicant_type" }, "INDIVIDUAL"] },
          "fields": [
            {
              "key": "applicant.name",
              "label": "Full Name",
              "type": "string",
              "required": true,
              "validations": [
                { "ruleType": "minLength", "value": 2, "message": "Name too short" },
                { "ruleType": "maxLength", "value": 100, "message": "Name too long" }
              ]
            },
            {
              "key": "applicant.father_name",
              "label": "Father's/Husband's Name",
              "type": "string",
              "required": true
            },
            {
              "key": "applicant.aadhaar",
              "label": "Aadhaar Number",
              "type": "aadhaar",
              "required": true,
              "pii": true,
              "validations": [
                { "ruleType": "regex", "value": "^[0-9]{12}$", "message": "Invalid Aadhaar" }
              ]
            }
          ]
        },
        {
          "sectionId": "SEC_COMPANY",
          "title": "Company Details",
          "visibility": { "==": [{ "var": "applicant_type" }, "COMPANY"] },
          "fields": [
            {
              "key": "company.name",
              "label": "Company Name",
              "type": "string",
              "required": true
            },
            {
              "key": "company.cin",
              "label": "CIN Number",
              "type": "string",
              "required": true
            },
            {
              "key": "company.authorized_signatory",
              "label": "Authorized Signatory Name",
              "type": "string",
              "required": true
            }
          ]
        }
      ]
    },
    {
      "pageId": "PAGE_PROPERTY",
      "title": "Property Details",
      "sections": [
        {
          "sectionId": "SEC_PROPERTY",
          "title": "Property Information",
          "fields": [
            {
              "key": "property.upn",
              "label": "Unique Property Number (UPN)",
              "type": "string",
              "required": true,
              "lookup": {
                "provider": "property_db",
                "inputKeys": ["property.upn"],
                "mapToKeys": [
                  { "from": "scheme_name", "to": "property.scheme" },
                  { "from": "plot_number", "to": "property.plot_no" },
                  { "from": "area_sqyd", "to": "property.area" },
                  { "from": "property_type", "to": "property.type" }
                ]
              }
            },
            {
              "key": "property.scheme",
              "label": "Scheme Name",
              "type": "string",
              "readOnly": true
            },
            {
              "key": "property.plot_no",
              "label": "Plot Number",
              "type": "string",
              "readOnly": true
            },
            {
              "key": "property.area",
              "label": "Area (Sq. Yards)",
              "type": "number",
              "readOnly": true
            },
            {
              "key": "property.type",
              "label": "Property Type",
              "type": "enum",
              "readOnly": true,
              "ui": {
                "options": [
                  { "value": "RESIDENTIAL", "label": "Residential" },
                  { "value": "COMMERCIAL", "label": "Commercial" },
                  { "value": "INDUSTRIAL", "label": "Industrial" }
                ]
              }
            }
          ]
        }
      ]
    },
    {
      "pageId": "PAGE_TRANSFEREES",
      "title": "Transferee/Purchaser Details",
      "sections": [
        {
          "sectionId": "SEC_TRANSFEREES",
          "title": "Purchaser/Donee/Transferee Information",
          "fields": [
            {
              "key": "transferees",
              "label": "Transferees",
              "type": "table",
              "required": true,
              "table": {
                "minRows": 1,
                "maxRows": 10,
                "columns": [
                  { "key": "name", "label": "Name", "type": "string", "required": true },
                  { "key": "father_name", "label": "Father's Name", "type": "string", "required": true },
                  { "key": "aadhaar", "label": "Aadhaar", "type": "aadhaar", "required": true, "pii": true },
                  { "key": "share_percent", "label": "Share %", "type": "number", "required": true },
                  { "key": "photo_id", "label": "Photo ID", "type": "fileRef", "required": true }
                ]
              },
              "validations": [
                {
                  "ruleType": "custom",
                  "value": { "==": [{ "reduce": [{ "var": "transferees" }, { "+": [{ "var": "accumulator" }, { "var": "current.share_percent" }] }, 0] }, 100] },
                  "message": "Total share must equal 100%"
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### 6.4 Document Configuration Schema

```json
{
  "documents": [
    {
      "docTypeId": "DOC_SELLER_AFFIDAVIT",
      "displayName": "Affidavit from All Sellers",
      "description": "Affidavit stating property is free from encumbrances/litigation",
      "mandatory": true,
      "allowedMimeTypes": ["application/pdf"],
      "maxSizeMB": 5,
      "multiple": true,
      "requiresOriginalSubmission": false,
      "attestationRequired": true
    },
    {
      "docTypeId": "DOC_PURCHASER_AFFIDAVIT",
      "displayName": "Liability Affidavit of Purchasers/Transferees",
      "mandatory": true,
      "allowedMimeTypes": ["application/pdf"],
      "maxSizeMB": 5,
      "multiple": true
    },
    {
      "docTypeId": "DOC_GPA",
      "displayName": "Certified Copy of GPA/Sub Attorney",
      "mandatory": { "==": [{ "var": "has_gpa" }, true] },
      "allowedMimeTypes": ["application/pdf"],
      "maxSizeMB": 10
    },
    {
      "docTypeId": "DOC_CONVEYANCE_DEED",
      "displayName": "Certified Copy of Conveyance Deed",
      "mandatory": { "==": [{ "var": "conveyance_deed_issued" }, true] },
      "allowedMimeTypes": ["application/pdf"],
      "maxSizeMB": 10
    },
    {
      "docTypeId": "DOC_MORTGAGE_CLEARANCE",
      "displayName": "Mortgage/Loan Clearance Certificate",
      "mandatory": { "==": [{ "var": "has_mortgage" }, true] },
      "allowedMimeTypes": ["application/pdf"],
      "maxSizeMB": 5
    },
    {
      "docTypeId": "DOC_SEWERAGE_OC",
      "displayName": "Sewerage Connection/Occupation Certificate",
      "mandatory": false,
      "description": "If already obtained",
      "allowedMimeTypes": ["application/pdf", "image/jpeg", "image/png"],
      "maxSizeMB": 5
    },
    {
      "docTypeId": "DOC_SELLER_PHOTO_ID",
      "displayName": "Photo ID of All Sellers",
      "mandatory": true,
      "allowedMimeTypes": ["application/pdf", "image/jpeg", "image/png"],
      "maxSizeMB": 2,
      "multiple": true
    },
    {
      "docTypeId": "DOC_PURCHASER_PHOTO_ID",
      "displayName": "Photo ID of All Purchasers",
      "mandatory": true,
      "allowedMimeTypes": ["application/pdf", "image/jpeg", "image/png"],
      "maxSizeMB": 2,
      "multiple": true,
      "perTableRow": {
        "tableKey": "transferees",
        "columnKey": "photo_id"
      }
    }
  ]
}
```

### 6.5 Workflow Configuration Schema

```json
{
  "workflowId": "WF_PERMISSION_SALE_TRANSFER",
  "version": "1.0.0",
  "initialStateId": "DRAFT",
  
  "states": [
    {
      "stateId": "DRAFT",
      "name": "Draft",
      "stateType": "simple",
      "actor": "citizen",
      "formMode": "edit"
    },
    {
      "stateId": "PAYMENT_PENDING",
      "name": "Payment Pending",
      "stateType": "simple",
      "actor": "citizen",
      "formMode": "read"
    },
    {
      "stateId": "PENDING_AT_CLERK",
      "name": "Pending at Clerk",
      "stateType": "simple",
      "actor": "officer",
      "allowedSystemRoleIds": ["CLERK", "DEALING_ASSISTANT"],
      "formMode": "read",
      "sla": { "dueInDays": 3 },
      "assignment": {
        "strategy": "by_role_pool",
        "rolePoolSystemRoleIds": ["CLERK", "DEALING_ASSISTANT"]
      }
    },
    {
      "stateId": "PENDING_AT_SR_ASSISTANT",
      "name": "Pending at Senior Assistant",
      "stateType": "simple",
      "actor": "officer",
      "allowedSystemRoleIds": ["SENIOR_ASSISTANT"],
      "formMode": "read",
      "sla": { "dueInDays": 4 },
      "assignment": {
        "strategy": "by_role_pool",
        "rolePoolSystemRoleIds": ["SENIOR_ASSISTANT"]
      }
    },
    {
      "stateId": "PENDING_AT_SUPERINTENDENT",
      "name": "Pending at Superintendent",
      "stateType": "simple",
      "actor": "officer",
      "allowedSystemRoleIds": ["SUPERINTENDENT", "ESTATE_OFFICER"],
      "formMode": "read",
      "sla": { "dueInDays": 3 },
      "assignment": {
        "strategy": "by_role_pool",
        "rolePoolSystemRoleIds": ["SUPERINTENDENT", "ESTATE_OFFICER"]
      }
    },
    {
      "stateId": "QUERY_PENDING",
      "name": "Query Pending",
      "stateType": "simple",
      "actor": "citizen",
      "formMode": "mixed"
    },
    {
      "stateId": "APPROVED",
      "name": "Approved",
      "stateType": "terminal",
      "actor": "system"
    },
    {
      "stateId": "REJECTED",
      "name": "Rejected",
      "stateType": "terminal",
      "actor": "system"
    },
    {
      "stateId": "CLOSED",
      "name": "Closed",
      "stateType": "terminal",
      "actor": "system"
    }
  ],
  
  "transitions": [
    {
      "transitionId": "SUBMIT",
      "fromStateId": "DRAFT",
      "toStateId": "PAYMENT_PENDING",
      "trigger": "manual",
      "uiActionId": "SUBMIT",
      "guard": { "var": "all_mandatory_complete" },
      "actions": [
        { "actionId": "generateARN" },
        { "actionId": "notify", "params": { "template": "APPLICATION_SUBMITTED" } }
      ]
    },
    {
      "transitionId": "PAYMENT_SUCCESS",
      "fromStateId": "PAYMENT_PENDING",
      "toStateId": "PENDING_AT_CLERK",
      "trigger": "system",
      "uiActionId": "PAYMENT_SUCCESS",
      "actions": [
        { "actionId": "assignTask", "params": { "roleId": "CLERK" } },
        { "actionId": "startSLA" },
        { "actionId": "notify", "params": { "template": "PAYMENT_RECEIVED" } }
      ]
    },
    {
      "transitionId": "CLERK_FORWARD",
      "fromStateId": "PENDING_AT_CLERK",
      "toStateId": "PENDING_AT_SR_ASSISTANT",
      "trigger": "manual",
      "uiActionId": "FORWARD",
      "allowedSystemRoleIds": ["CLERK", "DEALING_ASSISTANT"],
      "guard": { "var": "basic_verification_complete" },
      "actions": [
        { "actionId": "completeTask" },
        { "actionId": "assignTask", "params": { "roleId": "SENIOR_ASSISTANT" } }
      ]
    },
    {
      "transitionId": "CLERK_QUERY",
      "fromStateId": "PENDING_AT_CLERK",
      "toStateId": "QUERY_PENDING",
      "trigger": "manual",
      "uiActionId": "RAISE_QUERY",
      "allowedSystemRoleIds": ["CLERK", "DEALING_ASSISTANT"],
      "actions": [
        { "actionId": "raiseQuery" },
        { "actionId": "pauseSLA" },
        { "actionId": "notify", "params": { "template": "QUERY_RAISED" } }
      ]
    },
    {
      "transitionId": "CLERK_REJECT",
      "fromStateId": "PENDING_AT_CLERK",
      "toStateId": "REJECTED",
      "trigger": "manual",
      "uiActionId": "REJECT",
      "allowedSystemRoleIds": ["CLERK", "DEALING_ASSISTANT"],
      "guard": { "var": "rejection_remarks_provided" },
      "actions": [
        { "actionId": "completeTask" },
        { "actionId": "generateOutput", "params": { "templateId": "REJECTION_ORDER" } },
        { "actionId": "notify", "params": { "template": "APPLICATION_REJECTED" } }
      ]
    },
    {
      "transitionId": "RESUBMIT_TO_CLERK",
      "fromStateId": "QUERY_PENDING",
      "toStateId": "PENDING_AT_CLERK",
      "trigger": "manual",
      "uiActionId": "RESUBMIT",
      "guard": { "var": "query_response_complete" },
      "actions": [
        { "actionId": "closeQuery" },
        { "actionId": "resumeSLA" },
        { "actionId": "assignTask", "params": { "roleId": "CLERK" } },
        { "actionId": "notify", "params": { "template": "RESUBMITTED" } }
      ]
    },
    {
      "transitionId": "SR_ASST_FORWARD",
      "fromStateId": "PENDING_AT_SR_ASSISTANT",
      "toStateId": "PENDING_AT_SUPERINTENDENT",
      "trigger": "manual",
      "uiActionId": "FORWARD",
      "allowedSystemRoleIds": ["SENIOR_ASSISTANT"],
      "actions": [
        { "actionId": "completeTask" },
        { "actionId": "assignTask", "params": { "roleId": "SUPERINTENDENT" } }
      ]
    },
    {
      "transitionId": "SUPERINTENDENT_APPROVE",
      "fromStateId": "PENDING_AT_SUPERINTENDENT",
      "toStateId": "APPROVED",
      "trigger": "manual",
      "uiActionId": "APPROVE",
      "allowedSystemRoleIds": ["SUPERINTENDENT", "ESTATE_OFFICER"],
      "guard": {
        "and": [
          { "var": "all_verifications_complete" },
          { "var": "physical_verification_passed" }
        ]
      },
      "actions": [
        { "actionId": "completeTask" },
        { "actionId": "generateOutput", "params": { "templateId": "PERMISSION_LETTER" } },
        { "actionId": "notify", "params": { "template": "APPLICATION_APPROVED" } }
      ]
    },
    {
      "transitionId": "OUTPUT_ISSUED",
      "fromStateId": "APPROVED",
      "toStateId": "CLOSED",
      "trigger": "system",
      "actions": [
        { "actionId": "signOutput" },
        { "actionId": "notify", "params": { "template": "OUTPUT_READY" } }
      ]
    }
  ],
  
  "queryPolicy": {
    "enabled": true,
    "unlockMode": "explicit",
    "maxQueryCycles": 3,
    "citizenResponseWindowDays": 15,
    "slaTimerBehavior": "pauseWhileQueryPending",
    "returnToState": "originating"
  }
}
```

### 6.6 Fee Configuration Schema

```json
{
  "feeSchedule": {
    "serviceKey": "permission_for_sale_transfer",
    "mode": "gateway",
    "currency": "INR",
    "baseYear": 2024,
    "annualEscalation": {
      "rate": 0.10,
      "effectiveMonth": 4,
      "effectiveDay": 1
    },
    "components": [
      {
        "componentId": "BASE_FEE",
        "name": "Application Fee",
        "calculationRule": {
          "if": [
            { "==": [{ "var": "property.type" }, "RESIDENTIAL"] },
            8729,
            { "==": [{ "var": "property.type" }, "COMMERCIAL"] },
            17458,
            8729
          ]
        }
      },
      {
        "componentId": "GST",
        "name": "GST @ 18%",
        "calculationRule": {
          "*": [{ "var": "components.BASE_FEE" }, 0.18]
        }
      }
    ],
    "totalRule": {
      "+": [
        { "var": "components.BASE_FEE" },
        { "var": "components.GST" }
      ]
    },
    "gateway": {
      "providerKey": "RAZORPAY",
      "merchantId": "PUDA_MERCHANT"
    }
  }
}
```

### 6.7 Notification Configuration

```json
{
  "notifications": [
    {
      "event": "APPLICATION_SUBMITTED",
      "channels": ["sms", "email"],
      "templates": {
        "sms": "Your application {arn} for {serviceName} has been submitted. Track at {portalUrl}",
        "email": {
          "subject": "Application Submitted - {arn}",
          "templateRef": "emails/submitted.html"
        }
      },
      "recipients": ["applicant"]
    },
    {
      "event": "QUERY_RAISED",
      "channels": ["sms", "email", "in_app"],
      "templates": {
        "sms": "Query raised on application {arn}. Please respond within {daysToRespond} days.",
        "email": {
          "subject": "Action Required - Query on {arn}",
          "templateRef": "emails/query_raised.html"
        }
      },
      "recipients": ["applicant"]
    },
    {
      "event": "APPLICATION_APPROVED",
      "channels": ["sms", "email", "in_app"],
      "templates": {
        "sms": "Congratulations! Your application {arn} has been approved. Download certificate from portal.",
        "email": {
          "subject": "Application Approved - {arn}",
          "templateRef": "emails/approved.html"
        }
      },
      "recipients": ["applicant"]
    },
    {
      "event": "SLA_WARNING",
      "channels": ["email", "in_app"],
      "templates": {
        "email": {
          "subject": "SLA Warning - {arn}",
          "templateRef": "emails/sla_warning.html"
        }
      },
      "recipients": ["assigned_officer", "supervisor"],
      "when": { "<=": [{ "var": "sla_hours_remaining" }, 8] }
    }
  ]
}
```

---

## 7. Data Models

### 7.1 Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│    AUTHORITY    │       │   DESIGNATION   │       │   SYSTEM_ROLE   │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ authority_id PK │◄──┐   │ designation_id  │   ┌──▶│ system_role_id  │
│ name            │   │   │ authority_id FK │───┘   │ name            │
│ locale          │   │   │ name            │       │ description     │
│ timezone        │   │   └─────────────────┘       └─────────────────┘
└─────────────────┘   │            │                        ▲
                      │            ▼                        │
                      │   ┌─────────────────────────┐       │
                      │   │ DESIGNATION_ROLE_MAP    │       │
                      │   ├─────────────────────────┤       │
                      │   │ authority_id FK         │───────┤
                      │   │ designation_id FK       │       │
                      │   │ system_role_id FK       │───────┘
                      │   └─────────────────────────┘
                      │
┌─────────────────┐   │   ┌─────────────────┐
│      USER       │   │   │  USER_POSTING   │
├─────────────────┤   │   ├─────────────────┤
│ user_id PK      │◄──┼───│ user_id FK      │
│ login           │   │   │ authority_id FK │───────┘
│ password_hash   │   │   │ designation_id  │
│ name            │   │   │ active_from     │
│ email           │   │   │ active_to       │
│ phone           │   │   └─────────────────┘
│ user_type       │   │
└─────────────────┘   │
                      │
┌─────────────────┐   │   ┌─────────────────┐
│    SERVICE      │   │   │ SERVICE_VERSION │
├─────────────────┤   │   ├─────────────────┤
│ service_key PK  │◄──┼───│ service_key FK  │
│ name            │   │   │ version         │
│ category        │   │   │ status          │
│ description     │   │   │ effective_from  │
└─────────────────┘   │   │ effective_to    │
                      │   │ config_jsonb    │
                      │   │ checksum        │
                      │   └─────────────────┘
                      │            │
                      │            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           APPLICATION                                │
├─────────────────────────────────────────────────────────────────────┤
│ arn PK                    │ Application Reference Number             │
│ service_key FK            │ Service identifier                       │
│ service_version FK        │ Pinned config version at submission      │
│ authority_id FK           │ Processing authority                     │
│ applicant_user_id FK      │ Citizen who applied                      │
│ state_id                  │ Current workflow state                   │
│ data_jsonb                │ Form data (flexible schema)              │
│ submission_snapshot_jsonb │ Immutable copy at submission             │
│ query_count               │ Number of query cycles                   │
│ sla_due_at                │ Overall SLA deadline                     │
│ sla_paused_at             │ When SLA was paused (null if running)    │
│ row_version               │ Optimistic locking                       │
│ created_at                │ Draft creation timestamp                 │
│ submitted_at              │ Submission timestamp                     │
│ disposed_at               │ Final decision timestamp                 │
│ disposal_type             │ APPROVED/REJECTED                        │
└─────────────────────────────────────────────────────────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                              TASK                                    │
├─────────────────────────────────────────────────────────────────────┤
│ task_id PK                │ Unique task identifier                   │
│ arn FK                    │ Parent application                       │
│ state_id                  │ Workflow state for this task             │
│ system_role_id            │ Required role to process                 │
│ assignee_user_id FK       │ Assigned officer (nullable)              │
│ status                    │ PENDING/IN_PROGRESS/COMPLETED/CANCELLED  │
│ sla_due_at                │ Task-level SLA deadline                  │
│ started_at                │ When officer started processing          │
│ completed_at              │ When task was completed                  │
│ decision                  │ FORWARD/QUERY/APPROVE/REJECT             │
│ remarks                   │ Officer remarks                          │
│ remarks_internal          │ Internal notes (not visible to citizen)  │
└─────────────────────────────────────────────────────────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                              QUERY                                   │
├─────────────────────────────────────────────────────────────────────┤
│ query_id PK               │ Unique query identifier                  │
│ arn FK                    │ Parent application                       │
│ raised_by_task_id FK      │ Task that raised the query               │
│ query_number              │ Sequential query number (1, 2, 3...)     │
│ message                   │ Query message to citizen                 │
│ unlocked_field_keys[]     │ Fields citizen can edit                  │
│ unlocked_doc_type_ids[]   │ Documents citizen can replace            │
│ raised_at                 │ When query was raised                    │
│ response_due_at           │ Deadline for citizen response            │
│ responded_at              │ When citizen responded                   │
│ response_remarks          │ Citizen's response message               │
│ status                    │ PENDING/RESPONDED/EXPIRED                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                            DOCUMENT                                  │
├─────────────────────────────────────────────────────────────────────┤
│ doc_id PK                 │ Unique document identifier               │
│ arn FK                    │ Parent application                       │
│ doc_type_id               │ Document type from config                │
│ version                   │ Version number (1, 2, 3...)              │
│ storage_key               │ Object storage path                      │
│ original_filename         │ Uploaded filename                        │
│ mime_type                 │ File MIME type                           │
│ size_bytes                │ File size                                │
│ checksum                  │ SHA-256 hash                             │
│ uploaded_by_user_id FK    │ Who uploaded                             │
│ uploaded_at               │ Upload timestamp                         │
│ verification_status       │ PENDING/VERIFIED/REJECTED                │
│ verified_by_user_id FK    │ Officer who verified                     │
│ verified_at               │ Verification timestamp                   │
│ verification_remarks      │ Verification notes                       │
│ is_current                │ Is this the active version               │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                            PAYMENT                                   │
├─────────────────────────────────────────────────────────────────────┤
│ payment_id PK             │ Unique payment identifier                │
│ arn FK                    │ Parent application                       │
│ payment_type              │ GATEWAY/DD/BG/CHALLAN                    │
│ status                    │ INITIATED/SUCCESS/FAILED/VERIFIED        │
│ amount                    │ Payment amount                           │
│ currency                  │ Currency code (INR)                      │
│ fee_breakdown_jsonb       │ Component-wise breakdown                 │
│ gateway_order_id          │ Payment gateway order ID                 │
│ gateway_payment_id        │ Payment gateway payment ID               │
│ gateway_signature         │ Payment verification signature           │
│ instrument_number         │ DD/BG number (for offline)               │
│ instrument_bank           │ Issuing bank (for offline)               │
│ instrument_date           │ DD/BG date (for offline)                 │
│ instrument_validity       │ BG validity date                         │
│ verified_by_user_id FK    │ Officer who verified (offline)           │
│ verified_at               │ Verification timestamp                   │
│ initiated_at              │ When payment was initiated               │
│ completed_at              │ When payment completed/verified          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                           INSPECTION                                 │
├─────────────────────────────────────────────────────────────────────┤
│ inspection_id PK          │ Unique inspection identifier             │
│ arn FK                    │ Parent application                       │
│ inspection_type           │ SITE_VISIT/DOCUMENT_VERIFICATION         │
│ assigned_to_user_id FK    │ Assigned inspector                       │
│ scheduled_date            │ Planned inspection date                  │
│ scheduled_time_slot       │ Time slot if applicable                  │
│ status                    │ SCHEDULED/IN_PROGRESS/COMPLETED          │
│ visited_at                │ Actual visit timestamp                   │
│ geo_latitude              │ GPS latitude                             │
│ geo_longitude             │ GPS longitude                            │
│ geo_accuracy              │ GPS accuracy in meters                   │
│ checklist_responses_jsonb │ Checklist answers                        │
│ outcome                   │ PASS/FAIL/REVISIT_REQUIRED               │
│ remarks                   │ Inspector remarks                        │
│ completed_at              │ Completion timestamp                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       INSPECTION_PHOTO                               │
├─────────────────────────────────────────────────────────────────────┤
│ photo_id PK               │ Unique photo identifier                  │
│ inspection_id FK          │ Parent inspection                        │
│ storage_key               │ Object storage path                      │
│ caption                   │ Photo description                        │
│ geo_latitude              │ Photo GPS latitude                       │
│ geo_longitude             │ Photo GPS longitude                      │
│ captured_at               │ Photo timestamp                          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                            OUTPUT                                    │
├─────────────────────────────────────────────────────────────────────┤
│ output_id PK              │ Unique output identifier                 │
│ arn FK                    │ Parent application                       │
│ output_type               │ CERTIFICATE/LETTER/ORDER                 │
│ template_id               │ Template used for generation             │
│ output_number             │ Unique certificate/order number          │
│ storage_key               │ Object storage path                      │
│ checksum                  │ SHA-256 hash                             │
│ signed_by_user_id FK      │ Signing officer                          │
│ signature_type            │ DIGITAL/ESIGN                            │
│ signature_certificate     │ Digital signature certificate            │
│ qr_verification_code      │ QR code for verification                 │
│ generated_at              │ Generation timestamp                     │
│ signed_at                 │ Signing timestamp                        │
│ download_count            │ Number of times downloaded               │
│ last_downloaded_at        │ Last download timestamp                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         AUDIT_EVENT                                  │
├─────────────────────────────────────────────────────────────────────┤
│ event_id PK               │ Unique event identifier (UUID)           │
│ arn FK                    │ Related application (nullable)           │
│ event_type                │ Event category (see below)               │
│ actor_type                │ CITIZEN/OFFICER/SYSTEM                   │
│ actor_id                  │ User ID or system identifier             │
│ ip_address                │ Client IP address                        │
│ user_agent                │ Client user agent                        │
│ payload_jsonb             │ Event-specific data                      │
│ created_at                │ Event timestamp (indexed)                │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Audit Event Types

| Event Type | Description | Payload Contents |
|------------|-------------|------------------|
| `APPLICATION_CREATED` | Draft created | service_key, authority_id |
| `APPLICATION_UPDATED` | Form data changed | changed_fields, old_values, new_values |
| `APPLICATION_SUBMITTED` | Submitted for processing | submission_snapshot_hash |
| `DOCUMENT_UPLOADED` | Document uploaded | doc_type_id, version, checksum |
| `DOCUMENT_VERIFIED` | Document verified/rejected | doc_id, status, remarks |
| `DOCUMENT_VIEWED` | Document viewed | doc_id, viewer_user_id |
| `DOCUMENT_DOWNLOADED` | Document downloaded | doc_id, viewer_user_id |
| `STATE_CHANGED` | Workflow state transition | from_state, to_state, transition_id |
| `TASK_ASSIGNED` | Task assigned to officer | task_id, assignee_user_id |
| `TASK_COMPLETED` | Task completed | task_id, decision, remarks |
| `QUERY_RAISED` | Query raised | query_id, unlocked_fields |
| `QUERY_RESPONDED` | Citizen responded to query | query_id, changed_fields |
| `PAYMENT_INITIATED` | Payment started | payment_id, amount |
| `PAYMENT_COMPLETED` | Payment successful | payment_id, gateway_payment_id |
| `PAYMENT_FAILED` | Payment failed | payment_id, failure_reason |
| `INSPECTION_SCHEDULED` | Inspection scheduled | inspection_id, scheduled_date |
| `INSPECTION_COMPLETED` | Inspection completed | inspection_id, outcome |
| `OUTPUT_GENERATED` | Certificate/letter generated | output_id, output_number |
| `OUTPUT_SIGNED` | Output digitally signed | output_id, signer_user_id |
| `OUTPUT_DOWNLOADED` | Output downloaded | output_id |
| `SLA_WARNING` | SLA warning triggered | hours_remaining |
| `SLA_BREACHED` | SLA breached | breach_hours |

### 7.3 Database Indexes

```sql
-- Application indexes for inbox queries
CREATE INDEX idx_application_authority_state 
  ON application(authority_id, state_id) 
  WHERE disposed_at IS NULL;

CREATE INDEX idx_application_applicant 
  ON application(applicant_user_id, created_at DESC);

CREATE INDEX idx_application_sla_due 
  ON application(sla_due_at) 
  WHERE disposed_at IS NULL AND sla_paused_at IS NULL;

-- Task indexes for officer workbench
CREATE INDEX idx_task_assignee_status 
  ON task(assignee_user_id, status) 
  WHERE status = 'PENDING';

CREATE INDEX idx_task_role_authority 
  ON task(system_role_id, authority_id, status) 
  WHERE status = 'PENDING';

CREATE INDEX idx_task_sla_due 
  ON task(sla_due_at) 
  WHERE status = 'PENDING';

-- Audit indexes
CREATE INDEX idx_audit_arn_created 
  ON audit_event(arn, created_at DESC);

CREATE INDEX idx_audit_actor_created 
  ON audit_event(actor_id, created_at DESC);

CREATE INDEX idx_audit_type_created 
  ON audit_event(event_type, created_at DESC);

-- Document indexes
CREATE INDEX idx_document_arn_type 
  ON document(arn, doc_type_id, version DESC);

-- Partition audit_event by month
CREATE TABLE audit_event (
  ...
) PARTITION BY RANGE (created_at);

CREATE TABLE audit_event_2026_01 PARTITION OF audit_event
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

---

## 8. Workflow Engine

### 8.1 Orchestrator Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    WORKFLOW TRANSITION REQUEST                              │
│                                                                             │
│  Input: { arn, transitionId, actionPayload, actorUserId }                  │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ 1. LOAD APPLICATION                                                        │
│    - Fetch application by ARN                                              │
│    - Acquire row-level lock (SELECT FOR UPDATE)                            │
│    - Load pinned service config (service_key@version)                      │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ 2. VALIDATE TRANSITION                                                     │
│    - Transition exists in config                                           │
│    - Current state matches transition.fromStateId                          │
│    - Transition trigger type is appropriate (manual/system/timer)          │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ 3. AUTHORIZE                                                               │
│    - Load user's system roles (via designation mapping)                    │
│    - Check user has role in transition.allowedSystemRoleIds                │
│    - Verify task is assigned to user (if applicable)                       │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ 4. EVALUATE GUARDS                                                         │
│    - Build rule context { app, user, authority, task, now }                │
│    - Evaluate transition.guard using JSONLogic                             │
│    - If guard fails, return error with reason                              │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ 5. EXECUTE TRANSITION (DB Transaction)                                     │
│    - Update application.state_id                                           │
│    - Update application.row_version (optimistic lock)                      │
│    - Complete current task (if applicable)                                 │
│    - Create new task for next state (if applicable)                        │
│    - Handle SLA (pause/resume/reset based on config)                       │
│    - Create audit event                                                    │
│    - Commit transaction                                                    │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ 6. DISPATCH ACTIONS (Async via Queue)                                      │
│    - For each action in transition.actions:                                │
│      - Create action job with idempotency key                              │
│      - Enqueue to appropriate queue                                        │
│    - Actions execute asynchronously                                        │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ 7. RETURN RESPONSE                                                         │
│    - Return new state                                                      │
│    - Return next task info (if applicable)                                 │
│    - Return any immediate action results                                   │
└───────────────────────────────────────────────────────────────────────────┘
```

### 8.2 SLA Management

#### SLA Calculation

```typescript
interface SLAPolicy {
  totalDays: number;
  calendarType: 'WORKING_DAYS' | 'CALENDAR_DAYS';
  workingCalendar: string;  // e.g., 'PUNJAB_GOVT'
  stageSLAs: {
    stateId: string;
    dueInDays: number;
  }[];
  escalationRules: {
    hoursRemaining: number;
    action: 'NOTIFY_OFFICER' | 'NOTIFY_SUPERVISOR' | 'AUTO_ESCALATE';
  }[];
}
```

#### Working Calendar

```typescript
interface WorkingCalendar {
  calendarId: string;
  name: string;
  workingDays: number[];  // 1=Monday, 7=Sunday
  holidays: {
    date: string;  // YYYY-MM-DD
    name: string;
    type: 'GAZETTED' | 'RESTRICTED';
  }[];
}

// Example: Punjab Government Working Calendar
{
  calendarId: 'PUNJAB_GOVT',
  name: 'Punjab Government Working Days',
  workingDays: [1, 2, 3, 4, 5, 6],  // Monday to Saturday
  holidays: [
    { date: '2026-01-26', name: 'Republic Day', type: 'GAZETTED' },
    { date: '2026-03-14', name: 'Holi', type: 'GAZETTED' },
    // ... more holidays
  ]
}
```

#### SLA Timer Behavior During Query

| Behavior | Description | Use Case |
|----------|-------------|----------|
| `pauseWhileQueryPending` | Timer stops while awaiting citizen response | Default - fair to citizen |
| `continue` | Timer keeps running | Urgent services |
| `resetOnResubmission` | Timer resets to start of current stage | After significant changes |

### 8.3 Query/Resubmission Loop

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     QUERY/RESUBMISSION FLOW                              │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│ PENDING_AT_CLERK │
│    (Stage 1)     │
└────────┬─────────┘
         │
         │ Officer raises query
         │ - Selects fields to unlock
         │ - Selects documents to unlock
         │ - Enters query message
         ▼
┌──────────────────┐
│  QUERY_PENDING   │
│                  │ ◄─── SLA paused (if configured)
│  Citizen can:    │ ◄─── Only unlocked fields editable
│  - Edit fields   │ ◄─── Only unlocked docs replaceable
│  - Upload docs   │ ◄─── Previous versions preserved
│  - Submit reply  │
└────────┬─────────┘
         │
         │ Citizen resubmits
         │ - New data snapshot created
         │ - Query marked responded
         │ - SLA resumed
         ▼
┌──────────────────┐
│  RESUBMITTED     │
│   (transient)    │
└────────┬─────────┘
         │
         │ System auto-routes back to originating stage
         ▼
┌──────────────────┐
│ PENDING_AT_CLERK │ ◄─── Same officer sees updated application
│    (Stage 1)     │ ◄─── Can see what changed
└──────────────────┘
```

#### Query Data Model

```json
{
  "queryId": "Q001",
  "arn": "PUDA/2026/00001",
  "queryNumber": 1,
  "message": "Please provide updated sale deed with correct property number",
  "unlockedFields": [
    "property.plot_no",
    "property.area"
  ],
  "unlockedDocuments": [
    "DOC_SALE_DEED"
  ],
  "raisedAt": "2026-02-04T10:00:00Z",
  "responseDueAt": "2026-02-19T17:00:00Z",
  "status": "PENDING"
}
```

---

## 9. Authorization Model

### 9.1 Designation to System Role Mapping

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AUTHORIZATION MAPPING LAYERS                          │
└─────────────────────────────────────────────────────────────────────────┘

           ┌──────────────┐
           │    USER      │
           │   (login)    │
           └──────┬───────┘
                  │
                  │ has posting at
                  ▼
     ┌────────────────────────────┐
     │      USER_POSTING          │
     │  (user + authority +       │
     │   designation + dates)     │
     └────────────┬───────────────┘
                  │
                  │ maps to (per authority)
                  ▼
     ┌────────────────────────────┐
     │   DESIGNATION_ROLE_MAP     │
     │  (designation → role)      │
     │                            │
     │  Same designation maps to  │
     │  different roles in        │
     │  different authorities     │
     └────────────┬───────────────┘
                  │
                  │ grants
                  ▼
     ┌────────────────────────────┐
     │      SYSTEM_ROLE           │
     │  (stable, platform-wide)   │
     └────────────┬───────────────┘
                  │
                  │ allowed on
                  ▼
     ┌────────────────────────────┐
     │   (SERVICE + STATE)        │
     │                            │
     │  Defined in workflow       │
     │  configuration             │
     └────────────────────────────┘
```

### 9.2 System Roles (Platform-Wide)

| System Role ID | Display Name | Typical Designations |
|----------------|--------------|---------------------|
| `CLERK` | Clerk | UDC, LDC, Dealing Clerk |
| `DEALING_ASSISTANT` | Dealing Assistant | DA, Assistant |
| `SENIOR_ASSISTANT` | Senior Assistant | SA, Head Clerk |
| `JUNIOR_ENGINEER` | Junior Engineer | JE, Sub-Engineer |
| `DRAFTSMAN` | Draftsman | Draftsman, CAD Operator |
| `SDO` | Sub-Divisional Officer | SDO, SDE |
| `ESTATE_OFFICER` | Estate Officer | EO, AEO |
| `ACCOUNT_OFFICER` | Account Officer | AO, Accountant |
| `SUPERINTENDENT` | Superintendent | Superintendent |
| `TOWN_PLANNER` | Town Planner | TP, ATP, DTP |
| `INSPECTOR` | Field Inspector | Inspector, SI |

### 9.3 Authority-Specific Mapping Example

```json
{
  "authorities": [
    {
      "authorityId": "PUDA",
      "displayName": "Punjab Urban Development Authority",
      "designationToSystemRole": [
        { "designationId": "PUDA_UDC", "systemRoleId": "CLERK" },
        { "designationId": "PUDA_SA", "systemRoleId": "SENIOR_ASSISTANT" },
        { "designationId": "PUDA_JE", "systemRoleId": "JUNIOR_ENGINEER" },
        { "designationId": "PUDA_SDO_BLDG", "systemRoleId": "SDO" },
        { "designationId": "PUDA_EO", "systemRoleId": "ESTATE_OFFICER" }
      ]
    },
    {
      "authorityId": "GMADA",
      "displayName": "Greater Mohali Area Development Authority",
      "designationToSystemRole": [
        { "designationId": "GMADA_CLERK", "systemRoleId": "CLERK" },
        { "designationId": "GMADA_HEAD_CLERK", "systemRoleId": "SENIOR_ASSISTANT" },
        { "designationId": "GMADA_AE", "systemRoleId": "JUNIOR_ENGINEER" },
        { "designationId": "GMADA_XEN", "systemRoleId": "SDO" },
        { "designationId": "GMADA_AEO", "systemRoleId": "ESTATE_OFFICER" }
      ]
    }
  ]
}
```

### 9.4 Entitlement Computation

At login, compute user's allowed actions:

```typescript
interface UserEntitlement {
  userId: string;
  authorityId: string;
  systemRoles: string[];
  allowedServiceStates: {
    serviceKey: string;
    stateId: string;
    actions: string[];  // FORWARD, QUERY, APPROVE, REJECT
  }[];
}

// Computed at login, cached in Redis
async function computeEntitlements(userId: string): Promise<UserEntitlement[]> {
  // 1. Get user's active postings
  const postings = await getUserPostings(userId);
  
  // 2. For each posting, get system roles
  const entitlements: UserEntitlement[] = [];
  
  for (const posting of postings) {
    const roleMap = await getDesignationRoleMap(
      posting.authorityId, 
      posting.designationId
    );
    
    const systemRoles = roleMap.map(r => r.systemRoleId);
    
    // 3. For each role, find allowed service+state combinations
    const allowedStates = await getAllowedServiceStates(systemRoles);
    
    entitlements.push({
      userId,
      authorityId: posting.authorityId,
      systemRoles,
      allowedServiceStates: allowedStates
    });
  }
  
  return entitlements;
}
```

### 9.5 Task Visibility (Pre-Filtering)

Officers only see tasks they can act on:

```sql
-- Inbox query for officer
SELECT t.*, a.arn, a.service_key, a.applicant_name
FROM task t
JOIN application a ON t.arn = a.arn
WHERE t.status = 'PENDING'
  AND t.authority_id = :officerAuthorityId
  AND t.system_role_id = ANY(:officerSystemRoles)
ORDER BY t.sla_due_at ASC;
```

---

## 10. Fee and Payment Engine

### 10.1 Fee Calculation Engine

#### Time-Based Escalation

```typescript
interface FeeSchedule {
  serviceKey: string;
  baseYear: number;
  annualEscalation: {
    rate: number;          // e.g., 0.10 for 10%
    effectiveMonth: number; // 1-12
    effectiveDay: number;   // 1-31
  };
  components: FeeComponent[];
}

interface FeeComponent {
  componentId: string;
  name: string;
  calculationRule: JSONLogicRule;  // Can reference app data
}

function calculateFee(
  schedule: FeeSchedule, 
  appData: any, 
  asOfDate: Date
): FeeBreakdown {
  // Calculate escalation factor
  const escalationFactor = calculateEscalation(
    schedule.baseYear,
    schedule.annualEscalation,
    asOfDate
  );
  
  // Calculate each component
  const components: { [key: string]: number } = {};
  
  for (const comp of schedule.components) {
    const baseAmount = evaluateRule(comp.calculationRule, { 
      ...appData, 
      components 
    });
    components[comp.componentId] = Math.round(baseAmount * escalationFactor);
  }
  
  return {
    components,
    total: Object.values(components).reduce((a, b) => a + b, 0),
    escalationFactor,
    calculatedAt: asOfDate
  };
}

function calculateEscalation(
  baseYear: number,
  escalation: { rate: number; effectiveMonth: number; effectiveDay: number },
  asOfDate: Date
): number {
  const effectiveDate = new Date(
    asOfDate.getFullYear(),
    escalation.effectiveMonth - 1,
    escalation.effectiveDay
  );
  
  let yearsElapsed = asOfDate.getFullYear() - baseYear;
  
  // If before effective date this year, reduce by 1
  if (asOfDate < effectiveDate) {
    yearsElapsed--;
  }
  
  return Math.pow(1 + escalation.rate, Math.max(0, yearsElapsed));
}
```

### 10.2 Payment Gateway Integration

```typescript
interface PaymentGatewayAdapter {
  createOrder(params: {
    arn: string;
    amount: number;
    currency: string;
    description: string;
    customerEmail: string;
    customerPhone: string;
  }): Promise<{ orderId: string; paymentUrl: string }>;
  
  verifyPayment(params: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): Promise<{ verified: boolean; status: string }>;
  
  handleWebhook(payload: any, signature: string): Promise<PaymentEvent>;
}

// Payment flow
async function initiatePayment(arn: string): Promise<PaymentInitiation> {
  const app = await getApplication(arn);
  const feeBreakdown = await calculateFee(app);
  
  // Create payment record
  const payment = await createPayment({
    arn,
    paymentType: 'GATEWAY',
    amount: feeBreakdown.total,
    feeBreakdown,
    status: 'INITIATED'
  });
  
  // Create gateway order
  const gateway = getGatewayAdapter(app.serviceConfig.fees.gateway.providerKey);
  const order = await gateway.createOrder({
    arn,
    amount: feeBreakdown.total,
    currency: 'INR',
    description: `${app.serviceName} - ${arn}`,
    customerEmail: app.applicantEmail,
    customerPhone: app.applicantPhone
  });
  
  // Update payment with order ID
  await updatePayment(payment.paymentId, {
    gatewayOrderId: order.orderId
  });
  
  return {
    paymentId: payment.paymentId,
    orderId: order.orderId,
    paymentUrl: order.paymentUrl,
    amount: feeBreakdown.total,
    breakdown: feeBreakdown
  };
}
```

### 10.3 Offline Instrument Handling (DD/BG)

```typescript
interface OfflineInstrument {
  instrumentType: 'DD' | 'BG' | 'CHALLAN';
  instrumentNumber: string;
  issuingBank: string;
  issueDate: Date;
  amount: number;
  validityDate?: Date;  // For BG
  favorOf: string;      // Payable to
  uploadedDocId?: string;
}

// Workflow for offline instruments
// 1. Citizen uploads instrument details + scanned copy
// 2. Application moves to INSTRUMENT_VERIFICATION state
// 3. Finance officer verifies instrument
// 4. On verification, application proceeds to first processing stage

interface InstrumentVerificationTask {
  taskId: string;
  arn: string;
  instrument: OfflineInstrument;
  assignedTo: string;  // Finance officer
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  verificationRemarks?: string;
  verifiedAt?: Date;
}
```

### 10.4 BG Tracking and Alerts

```typescript
// Background job for BG expiry alerts
async function checkBGExpiries(): Promise<void> {
  const expiringBGs = await findExpiringBGs({
    daysUntilExpiry: 30  // Alert 30 days before
  });
  
  for (const bg of expiringBGs) {
    await sendNotification({
      type: 'BG_EXPIRY_WARNING',
      recipients: [bg.applicantEmail, bg.financeOfficerEmail],
      data: {
        arn: bg.arn,
        instrumentNumber: bg.instrumentNumber,
        expiryDate: bg.validityDate,
        daysRemaining: bg.daysUntilExpiry
      }
    });
    
    await createAuditEvent({
      arn: bg.arn,
      eventType: 'BG_EXPIRY_WARNING',
      payload: { instrumentNumber: bg.instrumentNumber, expiryDate: bg.validityDate }
    });
  }
}
```

---

## 11. Document Management

### 11.1 Document Storage Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DOCUMENT MANAGEMENT FLOW                              │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Upload  │────▶│  Validate    │────▶│  Store       │────▶│  Index       │
│  Request │     │  (type/size) │     │  (MinIO/S3)  │     │  (Postgres)  │
└──────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                        │                     │
                        │                     │
                        ▼                     ▼
                 ┌──────────────┐     ┌──────────────┐
                 │  Virus Scan  │     │  Checksum    │
                 │  (ClamAV)    │     │  (SHA-256)   │
                 └──────────────┘     └──────────────┘
```

### 11.2 Upload Flow

```typescript
interface DocumentUploadRequest {
  arn: string;
  docTypeId: string;
  file: Buffer;
  filename: string;
  mimeType: string;
}

async function uploadDocument(req: DocumentUploadRequest): Promise<Document> {
  // 1. Validate against document config
  const docConfig = await getDocumentConfig(req.arn, req.docTypeId);
  
  if (!docConfig.allowedMimeTypes.includes(req.mimeType)) {
    throw new ValidationError(`File type ${req.mimeType} not allowed`);
  }
  
  if (req.file.length > docConfig.maxSizeMB * 1024 * 1024) {
    throw new ValidationError(`File exceeds ${docConfig.maxSizeMB}MB limit`);
  }
  
  // 2. Virus scan
  const scanResult = await virusScan(req.file);
  if (scanResult.infected) {
    throw new SecurityError('File failed virus scan');
  }
  
  // 3. Calculate checksum
  const checksum = crypto.createHash('sha256').update(req.file).digest('hex');
  
  // 4. Determine version
  const existingDocs = await getDocuments(req.arn, req.docTypeId);
  const version = existingDocs.length + 1;
  
  // 5. Store in object storage
  const storageKey = `${req.arn}/${req.docTypeId}/v${version}/${req.filename}`;
  await objectStorage.put(storageKey, req.file, {
    contentType: req.mimeType,
    metadata: {
      arn: req.arn,
      docTypeId: req.docTypeId,
      version: version.toString(),
      checksum
    }
  });
  
  // 6. Mark previous versions as not current
  await markPreviousVersionsNotCurrent(req.arn, req.docTypeId);
  
  // 7. Create document record
  const doc = await createDocument({
    arn: req.arn,
    docTypeId: req.docTypeId,
    version,
    storageKey,
    originalFilename: req.filename,
    mimeType: req.mimeType,
    sizeBytes: req.file.length,
    checksum,
    uploadedByUserId: getCurrentUserId(),
    isCurrent: true
  });
  
  // 8. Audit
  await createAuditEvent({
    arn: req.arn,
    eventType: 'DOCUMENT_UPLOADED',
    payload: {
      docId: doc.docId,
      docTypeId: req.docTypeId,
      version,
      checksum,
      sizeBytes: req.file.length
    }
  });
  
  return doc;
}
```

### 11.3 Document Versioning

```
Document: DOC_SALE_DEED for ARN PUDA/2026/00001

┌─────────────────────────────────────────────────────────────────────┐
│ Version 1 (uploaded at submission)                                   │
│ - storage_key: PUDA/2026/00001/DOC_SALE_DEED/v1/sale_deed.pdf       │
│ - checksum: abc123...                                               │
│ - is_current: false                                                 │
│ - verification_status: REJECTED                                     │
│ - verification_remarks: "Property number mismatch"                  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ Query raised, document unlocked
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Version 2 (uploaded after query)                                     │
│ - storage_key: PUDA/2026/00001/DOC_SALE_DEED/v2/sale_deed_v2.pdf    │
│ - checksum: def456...                                               │
│ - is_current: true                                                  │
│ - verification_status: VERIFIED                                     │
│ - verification_remarks: "Verified OK"                               │
└─────────────────────────────────────────────────────────────────────┘
```

### 11.4 Document Access Control

```typescript
async function canAccessDocument(
  userId: string, 
  docId: string
): Promise<boolean> {
  const doc = await getDocument(docId);
  const app = await getApplication(doc.arn);
  const user = await getUser(userId);
  
  // Applicant can access their own documents
  if (app.applicantUserId === userId) {
    return true;
  }
  
  // Officers can access if they have a task on this application
  const tasks = await getTasksForApplication(doc.arn);
  const userRoles = await getUserSystemRoles(userId);
  
  for (const task of tasks) {
    if (userRoles.includes(task.systemRoleId)) {
      return true;
    }
  }
  
  // Supervisors can access based on hierarchy
  const supervisorAccess = await checkSupervisorAccess(userId, doc.arn);
  if (supervisorAccess) {
    return true;
  }
  
  return false;
}

// All document access is logged
async function getDocumentWithAudit(
  docId: string, 
  userId: string
): Promise<{ doc: Document; presignedUrl: string }> {
  const canAccess = await canAccessDocument(userId, docId);
  if (!canAccess) {
    throw new AuthorizationError('Access denied');
  }
  
  const doc = await getDocument(docId);
  const presignedUrl = await objectStorage.getPresignedUrl(doc.storageKey, {
    expiresIn: 300  // 5 minutes
  });
  
  await createAuditEvent({
    arn: doc.arn,
    eventType: 'DOCUMENT_VIEWED',
    actorId: userId,
    payload: { docId, docTypeId: doc.docTypeId }
  });
  
  return { doc, presignedUrl };
}
```

---

## 12. Physical Verification

### 12.1 Inspection Configuration

```json
{
  "inspectionConfig": {
    "inspectionType": "SITE_VISIT",
    "required": true,
    "gateApproval": true,
    "scheduling": {
      "enabled": true,
      "slotDuration": 60,
      "availableSlots": ["09:00", "11:00", "14:00", "16:00"]
    },
    "geoTagging": {
      "required": true,
      "maxAccuracyMeters": 50
    },
    "photos": {
      "required": true,
      "minCount": 2,
      "maxCount": 10,
      "geoTagRequired": true
    },
    "checklist": [
      {
        "checklistItemId": "CHK_BOUNDARY",
        "question": "Are plot boundaries clearly demarcated?",
        "responseType": "YES_NO_NA",
        "required": true
      },
      {
        "checklistItemId": "CHK_CONSTRUCTION",
        "question": "Is there any unauthorized construction?",
        "responseType": "YES_NO_NA",
        "required": true
      },
      {
        "checklistItemId": "CHK_MATCHING",
        "question": "Does site match submitted documents?",
        "responseType": "YES_NO_NA",
        "required": true
      },
      {
        "checklistItemId": "CHK_REMARKS",
        "question": "Additional observations",
        "responseType": "TEXT",
        "required": false
      }
    ],
    "outcomes": [
      { "outcomeId": "PASS", "label": "Verification Passed", "allowsApproval": true },
      { "outcomeId": "FAIL", "label": "Verification Failed", "allowsApproval": false },
      { "outcomeId": "REVISIT", "label": "Revisit Required", "allowsApproval": false }
    ]
  }
}
```

### 12.2 Inspection Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       INSPECTION WORKFLOW                                │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│ Application at   │
│ PENDING_AT_SDO   │
└────────┬─────────┘
         │
         │ SDO creates inspection
         ▼
┌──────────────────┐
│  INSPECTION      │
│  SCHEDULED       │
│                  │
│  - Inspector     │
│    assigned      │
│  - Date/slot     │
│    selected      │
└────────┬─────────┘
         │
         │ Inspector visits site (mobile app)
         ▼
┌──────────────────┐
│  INSPECTION      │
│  IN_PROGRESS     │
│                  │
│  - Geo captured  │
│  - Photos taken  │
│  - Checklist     │
│    filled        │
└────────┬─────────┘
         │
         │ Inspector submits
         ▼
┌──────────────────┐     ┌──────────────────┐
│  INSPECTION      │     │  Application     │
│  COMPLETED       │────▶│  continues       │
│                  │     │  processing      │
│  Outcome: PASS   │     └──────────────────┘
└──────────────────┘
         │
         │ If FAIL or REVISIT
         ▼
┌──────────────────┐
│  Application may │
│  be rejected or  │
│  sent for query  │
└──────────────────┘
```

### 12.3 Mobile Inspection App Requirements

```typescript
interface InspectionCapture {
  inspectionId: string;
  
  // Geo location at start
  startLocation: {
    latitude: number;
    longitude: number;
    accuracy: number;
    capturedAt: Date;
  };
  
  // Photos with metadata
  photos: {
    photoId: string;
    imageData: Buffer;
    latitude: number;
    longitude: number;
    capturedAt: Date;
    caption: string;
  }[];
  
  // Checklist responses
  checklistResponses: {
    checklistItemId: string;
    response: string | boolean | null;
  }[];
  
  // Final outcome
  outcome: 'PASS' | 'FAIL' | 'REVISIT';
  remarks: string;
  
  // Completion location
  endLocation: {
    latitude: number;
    longitude: number;
    accuracy: number;
    capturedAt: Date;
  };
}

// Offline support
interface OfflineInspectionQueue {
  queuedInspections: InspectionCapture[];
  
  async queueForUpload(inspection: InspectionCapture): Promise<void>;
  async syncWhenOnline(): Promise<void>;
  async getPendingCount(): Promise<number>;
}
```

---

## 13. Output Generation

### 13.1 Template Engine

```typescript
interface OutputTemplate {
  templateId: string;
  displayName: string;
  format: 'PDF' | 'HTML';
  templatePath: string;
  dataBindings: {
    placeholder: string;
    source: string;  // JSONPath to data
    format?: string;  // date format, number format, etc.
  }[];
  signingRequired: boolean;
  qrCodeEnabled: boolean;
  numberingPattern: string;  // e.g., "PUDA/PST/{YEAR}/{SEQ:6}"
}

// Example template binding
{
  templateId: "PERMISSION_LETTER",
  displayName: "Permission for Sale/Gift/Transfer",
  format: "PDF",
  templatePath: "templates/permission_letter.html",
  dataBindings: [
    { placeholder: "{{ARN}}", source: "$.arn" },
    { placeholder: "{{APPLICANT_NAME}}", source: "$.data.applicant.name" },
    { placeholder: "{{PROPERTY_UPN}}", source: "$.data.property.upn" },
    { placeholder: "{{PROPERTY_ADDRESS}}", source: "$.data.property.address" },
    { placeholder: "{{AREA_SQYD}}", source: "$.data.property.area" },
    { placeholder: "{{APPROVAL_DATE}}", source: "$.disposedAt", format: "DD-MMM-YYYY" },
    { placeholder: "{{CERTIFICATE_NO}}", source: "$.outputNumber" },
    { placeholder: "{{AUTHORITY_NAME}}", source: "$.authority.displayName" }
  ],
  signingRequired: true,
  qrCodeEnabled: true,
  numberingPattern: "{{AUTHORITY}}/PST/{{YEAR}}/{{SEQ:6}}"
}
```

### 13.2 Output Generation Flow

```typescript
async function generateOutput(
  arn: string, 
  templateId: string
): Promise<Output> {
  const app = await getApplication(arn);
  const template = await getTemplate(templateId, app.authorityId);
  
  // 1. Generate unique output number
  const outputNumber = await generateOutputNumber(
    template.numberingPattern,
    app.authorityId
  );
  
  // 2. Prepare data context
  const dataContext = {
    arn: app.arn,
    data: app.data,
    authority: await getAuthority(app.authorityId),
    outputNumber,
    generatedAt: new Date(),
    disposedAt: app.disposedAt
  };
  
  // 3. Render template
  const renderedHtml = await renderTemplate(template, dataContext);
  
  // 4. Generate PDF
  const pdfBuffer = await htmlToPdf(renderedHtml);
  
  // 5. Add QR code if enabled
  let finalPdf = pdfBuffer;
  if (template.qrCodeEnabled) {
    const qrCode = await generateVerificationQR({
      outputNumber,
      arn,
      verificationUrl: `${config.portalUrl}/verify/${outputNumber}`
    });
    finalPdf = await addQRToPdf(pdfBuffer, qrCode);
  }
  
  // 6. Store unsigned version
  const storageKey = `outputs/${arn}/${outputNumber}.pdf`;
  await objectStorage.put(storageKey, finalPdf);
  
  // 7. Calculate checksum
  const checksum = crypto.createHash('sha256').update(finalPdf).digest('hex');
  
  // 8. Create output record
  const output = await createOutput({
    arn,
    outputType: 'CERTIFICATE',
    templateId,
    outputNumber,
    storageKey,
    checksum,
    generatedAt: new Date()
  });
  
  // 9. Queue for signing if required
  if (template.signingRequired) {
    await queueForSigning(output.outputId);
  }
  
  return output;
}
```

### 13.3 Digital Signature Integration

```typescript
interface ESignAdapter {
  initiateSigning(params: {
    documentBuffer: Buffer;
    signerUserId: string;
    signerName: string;
    signerDesignation: string;
    reason: string;
    location: string;
  }): Promise<{ signRequestId: string; redirectUrl: string }>;
  
  getSignedDocument(signRequestId: string): Promise<{
    status: 'PENDING' | 'SIGNED' | 'REJECTED';
    signedDocument?: Buffer;
    signatureCertificate?: string;
    signedAt?: Date;
  }>;
}

// eSign flow (NIC eSign or similar)
async function signOutput(outputId: string, signerUserId: string): Promise<void> {
  const output = await getOutput(outputId);
  const documentBuffer = await objectStorage.get(output.storageKey);
  const signer = await getUser(signerUserId);
  
  const esign = getESignAdapter();
  const { signRequestId, redirectUrl } = await esign.initiateSigning({
    documentBuffer,
    signerUserId,
    signerName: signer.name,
    signerDesignation: signer.designation,
    reason: `Approving ${output.outputNumber}`,
    location: 'Punjab'
  });
  
  await updateOutput(outputId, {
    signRequestId,
    signatureStatus: 'PENDING'
  });
  
  // Officer redirected to eSign portal
  // Callback received after signing
}

async function handleSigningCallback(signRequestId: string): Promise<void> {
  const output = await getOutputBySignRequest(signRequestId);
  const esign = getESignAdapter();
  
  const result = await esign.getSignedDocument(signRequestId);
  
  if (result.status === 'SIGNED') {
    // Replace unsigned with signed version
    const signedStorageKey = output.storageKey.replace('.pdf', '_signed.pdf');
    await objectStorage.put(signedStorageKey, result.signedDocument);
    
    await updateOutput(output.outputId, {
      storageKey: signedStorageKey,
      signatureStatus: 'SIGNED',
      signatureCertificate: result.signatureCertificate,
      signedAt: result.signedAt,
      checksum: crypto.createHash('sha256').update(result.signedDocument).digest('hex')
    });
    
    // Notify applicant
    await sendNotification({
      type: 'OUTPUT_READY',
      arn: output.arn,
      recipients: ['applicant']
    });
  }
}
```

### 13.4 QR Verification

```typescript
// Public verification endpoint (no auth required)
async function verifyOutput(outputNumber: string): Promise<VerificationResult> {
  const output = await getOutputByNumber(outputNumber);
  
  if (!output) {
    return {
      valid: false,
      message: 'Certificate not found'
    };
  }
  
  const app = await getApplication(output.arn);
  
  return {
    valid: true,
    outputNumber: output.outputNumber,
    serviceName: app.serviceName,
    applicantName: app.data.applicant.name,
    propertyUPN: app.data.property?.upn,
    issuedDate: output.signedAt || output.generatedAt,
    issuingAuthority: app.authority.displayName,
    signatureStatus: output.signatureStatus
  };
}
```

---

## 14. Integration Architecture

### 14.1 Integration Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    EXTERNAL INTEGRATIONS                                 │
└─────────────────────────────────────────────────────────────────────────┘

┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│  Property Master  │     │  Ledger/Accounts  │     │  Payment Gateway  │
│     Database      │     │     System        │     │  (Razorpay/PayU)  │
├───────────────────┤     ├───────────────────┤     ├───────────────────┤
│ - UPN lookup      │     │ - Dues inquiry    │     │ - Order creation  │
│ - Owner verify    │     │ - Payment history │     │ - Payment verify  │
│ - Property status │     │ - NDC eligibility │     │ - Refund process  │
└─────────┬─────────┘     └─────────┬─────────┘     └─────────┬─────────┘
          │                         │                         │
          └─────────────────────────┼─────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │      INTEGRATION LAYER        │
                    │   (Adapters + Circuit Breaker │
                    │    + Retry + Logging)         │
                    └───────────────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
          ▼                         ▼                         ▼
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│   SMS Gateway     │     │   Email Service   │     │    eSign (NIC)    │
├───────────────────┤     ├───────────────────┤     ├───────────────────┤
│ - OTP delivery    │     │ - Transactional   │     │ - Document sign   │
│ - Notifications   │     │ - Notifications   │     │ - Verify signer   │
│ - Status callback │     │ - Attachments     │     │ - Certificate     │
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

### 14.2 Integration Adapter Pattern

```typescript
// Base adapter interface
interface IntegrationAdapter<TRequest, TResponse> {
  name: string;
  call(request: TRequest): Promise<TResponse>;
  healthCheck(): Promise<boolean>;
}

// Circuit breaker wrapper
class CircuitBreakerAdapter<TRequest, TResponse> 
  implements IntegrationAdapter<TRequest, TResponse> {
  
  private adapter: IntegrationAdapter<TRequest, TResponse>;
  private failures: number = 0;
  private lastFailure: Date | null = null;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  constructor(
    adapter: IntegrationAdapter<TRequest, TResponse>,
    private config: {
      failureThreshold: number;
      resetTimeout: number;
    }
  ) {
    this.adapter = adapter;
  }
  
  async call(request: TRequest): Promise<TResponse> {
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN';
      } else {
        throw new CircuitOpenError(`Circuit open for ${this.adapter.name}`);
      }
    }
    
    try {
      const response = await this.adapter.call(request);
      this.onSuccess();
      return response;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailure = new Date();
    if (this.failures >= this.config.failureThreshold) {
      this.state = 'OPEN';
    }
  }
  
  private shouldAttemptReset(): boolean {
    if (!this.lastFailure) return false;
    const elapsed = Date.now() - this.lastFailure.getTime();
    return elapsed >= this.config.resetTimeout;
  }
}
```

### 14.3 Property Master Integration

```typescript
interface PropertyMasterAdapter {
  lookupByUPN(upn: string): Promise<PropertyInfo | null>;
  verifyOwner(upn: string, ownerId: string): Promise<OwnerVerification>;
  getPropertyStatus(upn: string): Promise<PropertyStatus>;
}

interface PropertyInfo {
  upn: string;
  schemeName: string;
  plotNumber: string;
  areaSqYd: number;
  propertyType: 'RESIDENTIAL' | 'COMMERCIAL' | 'INDUSTRIAL';
  currentOwner: {
    name: string;
    fatherName: string;
    allotmentDate: Date;
  };
  encumbrances: {
    type: 'MORTGAGE' | 'LIEN' | 'COURT_STAY';
    details: string;
  }[];
  constructionStatus: 'VACANT' | 'UNDER_CONSTRUCTION' | 'COMPLETED';
  conveyanceDeedIssued: boolean;
}

// Implementation
class PropertyMasterAdapterImpl implements PropertyMasterAdapter {
  constructor(private baseUrl: string, private apiKey: string) {}
  
  async lookupByUPN(upn: string): Promise<PropertyInfo | null> {
    const response = await fetch(`${this.baseUrl}/properties/${upn}`, {
      headers: { 'X-API-Key': this.apiKey }
    });
    
    if (response.status === 404) return null;
    if (!response.ok) throw new IntegrationError('Property lookup failed');
    
    return response.json();
  }
}
```

### 14.4 Ledger/Accounts Integration

```typescript
interface LedgerAdapter {
  getDues(upn: string): Promise<DuesInfo>;
  getPaymentHistory(upn: string): Promise<PaymentRecord[]>;
  checkNDCEligibility(upn: string): Promise<NDCEligibility>;
}

interface DuesInfo {
  upn: string;
  totalOutstanding: number;
  breakdown: {
    category: string;
    amount: number;
    dueDate: Date;
  }[];
  lastPaymentDate: Date | null;
  lastPaymentAmount: number | null;
}

interface NDCEligibility {
  eligible: boolean;
  reason?: string;
  outstandingAmount: number;
}
```

### 14.5 Empaneled Registry Integration

```typescript
interface EmpaneledRegistryAdapter {
  verifyArchitect(registrationNumber: string): Promise<ArchitectInfo | null>;
  verifyPlumber(licenseNumber: string): Promise<PlumberInfo | null>;
  getEmpaneledList(type: 'ARCHITECT' | 'PLUMBER', authorityId: string): Promise<string[]>;
}

interface ArchitectInfo {
  registrationNumber: string;
  name: string;
  coaCertificateNumber: string;
  validFrom: Date;
  validTo: Date;
  status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
  empaneledAuthorities: string[];
}

// Validation in building plan submission
async function validateEmpaneledArchitect(
  registrationNumber: string, 
  authorityId: string
): Promise<ValidationResult> {
  const registry = getEmpaneledRegistry();
  const architect = await registry.verifyArchitect(registrationNumber);
  
  if (!architect) {
    return { valid: false, error: 'Architect not found in registry' };
  }
  
  if (architect.status !== 'ACTIVE') {
    return { valid: false, error: `Architect registration is ${architect.status}` };
  }
  
  if (new Date() > architect.validTo) {
    return { valid: false, error: 'Architect registration has expired' };
  }
  
  if (!architect.empaneledAuthorities.includes(authorityId)) {
    return { valid: false, error: 'Architect not empaneled with this authority' };
  }
  
  return { valid: true };
}
```

---

## 15. Security Architecture

### 15.1 Security Layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SECURITY ARCHITECTURE                            │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ LAYER 1: PERIMETER                                                       │
│ - WAF (Web Application Firewall)                                        │
│ - DDoS Protection                                                        │
│ - Rate Limiting                                                          │
│ - IP Whitelisting (for admin)                                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ LAYER 2: AUTHENTICATION                                                  │
│ - JWT tokens (short-lived: 30 min)                                      │
│ - Refresh tokens (longer: 7 days)                                       │
│ - MFA for officers (optional)                                           │
│ - Session management                                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ LAYER 3: AUTHORIZATION                                                   │
│ - Role-based access control (RBAC)                                      │
│ - Entitlement pre-filtering                                             │
│ - Resource-level permissions                                            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ LAYER 4: DATA PROTECTION                                                 │
│ - PII encryption (Aadhaar, PAN)                                         │
│ - TLS 1.3 in transit                                                    │
│ - AES-256 at rest                                                       │
│ - Field-level masking in logs                                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ LAYER 5: AUDIT & MONITORING                                              │
│ - Immutable audit logs                                                  │
│ - Security event monitoring                                             │
│ - Anomaly detection                                                      │
│ - Compliance reporting                                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 15.2 Authentication

```typescript
interface AuthConfig {
  jwt: {
    accessTokenExpiry: '30m';
    refreshTokenExpiry: '7d';
    algorithm: 'RS256';
    issuer: 'puda-workflow-engine';
  };
  session: {
    idleTimeout: 30 * 60 * 1000;  // 30 minutes
    maxConcurrentSessions: 1;     // Single active session for officers
    absoluteTimeout: 8 * 60 * 60 * 1000;  // 8 hours
  };
  password: {
    minLength: 12;
    requireUppercase: true;
    requireLowercase: true;
    requireNumber: true;
    requireSpecial: true;
    maxAge: 90;  // days
    historyCount: 5;  // cannot reuse last 5
  };
}

// Session invalidation on role change
async function onUserPostingChange(userId: string): Promise<void> {
  // Immediately invalidate all sessions
  await invalidateAllSessions(userId);
  
  // Clear cached entitlements
  await clearEntitlementCache(userId);
  
  // Log security event
  await createSecurityEvent({
    type: 'POSTING_CHANGED',
    userId,
    message: 'User posting changed, sessions invalidated'
  });
}
```

### 15.3 PII Handling

```typescript
interface PIIPolicy {
  encryptedFields: string[];  // JSONPath to fields
  maskedInLogs: string[];
  maskedInUI: {
    field: string;
    pattern: string;  // e.g., "XXXX-XXXX-{last4}"
    roles: string[];  // roles that can see unmasked
  }[];
}

const piiPolicy: PIIPolicy = {
  encryptedFields: [
    '$.applicant.aadhaar',
    '$.applicant.pan',
    '$.transferees[*].aadhaar'
  ],
  maskedInLogs: [
    'aadhaar',
    'pan',
    'phone',
    'email',
    'password'
  ],
  maskedInUI: [
    {
      field: 'aadhaar',
      pattern: 'XXXX-XXXX-{last4}',
      roles: ['ESTATE_OFFICER', 'SUPERINTENDENT']  // Can see full
    },
    {
      field: 'pan',
      pattern: 'XXXXX{last5}',
      roles: ['ACCOUNT_OFFICER', 'ESTATE_OFFICER']
    }
  ]
};

// Encryption at field level
class PIIEncryption {
  private key: Buffer;
  
  encrypt(value: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }
  
  decrypt(encrypted: string): string {
    const data = Buffer.from(encrypted, 'base64');
    const iv = data.subarray(0, 16);
    const authTag = data.subarray(16, 32);
    const content = data.subarray(32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(content) + decipher.final('utf8');
  }
}
```

### 15.4 API Security

```typescript
// Rate limiting configuration
const rateLimits = {
  citizen: {
    requests: 100,
    window: '1m'
  },
  officer: {
    requests: 500,
    window: '1m'
  },
  public: {
    requests: 20,
    window: '1m'
  }
};

// Request validation
const requestValidation = {
  maxBodySize: '10mb',
  maxFileSize: '25mb',
  allowedContentTypes: [
    'application/json',
    'multipart/form-data'
  ],
  csrfProtection: true,
  corsOrigins: [
    'https://puda.gov.in',
    'https://portal.puda.gov.in'
  ]
};

// Security headers
const securityHeaders = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Content-Security-Policy': "default-src 'self'",
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};
```

---

## 16. API Design

### 16.1 API Overview

| Category | Base Path | Description |
|----------|-----------|-------------|
| Config | `/api/v1/config` | Service configurations |
| Applications | `/api/v1/applications` | Application CRUD |
| Documents | `/api/v1/documents` | Document management |
| Tasks | `/api/v1/tasks` | Officer workbench |
| Payments | `/api/v1/payments` | Payment processing |
| Outputs | `/api/v1/outputs` | Generated outputs |
| Admin | `/api/v1/admin` | Administration |
| Public | `/api/v1/public` | Unauthenticated endpoints |

### 16.2 Application APIs

```yaml
# Create draft application
POST /api/v1/applications
Request:
  {
    "authorityId": "PUDA",
    "serviceKey": "permission_for_sale_transfer"
  }
Response:
  {
    "arn": "PUDA/2026/DFT/00001",
    "status": "DRAFT",
    "serviceKey": "permission_for_sale_transfer",
    "serviceVersion": "1.0.0",
    "createdAt": "2026-02-04T10:00:00Z"
  }

# Update draft
PUT /api/v1/applications/{arn}
Request:
  {
    "data": {
      "applicant": {
        "name": "John Doe",
        "aadhaar": "123456789012"
      },
      "property": {
        "upn": "PUDA-SAS-1234"
      }
    }
  }
Response:
  {
    "arn": "PUDA/2026/DFT/00001",
    "status": "DRAFT",
    "data": { ... },
    "validationErrors": []
  }

# Submit application
POST /api/v1/applications/{arn}/submit
Response:
  {
    "arn": "PUDA/2026/00001",  # New ARN after submission
    "status": "PAYMENT_PENDING",
    "submittedAt": "2026-02-04T11:00:00Z",
    "feeAmount": 10300,
    "paymentUrl": "https://payment.gateway/..."
  }

# Get application details
GET /api/v1/applications/{arn}
Response:
  {
    "arn": "PUDA/2026/00001",
    "status": "PENDING_AT_CLERK",
    "data": { ... },
    "documents": [ ... ],
    "timeline": [ ... ],
    "currentTask": { ... },
    "sla": {
      "totalDays": 10,
      "daysRemaining": 8,
      "dueAt": "2026-02-14T17:00:00Z"
    }
  }

# Respond to query
POST /api/v1/applications/{arn}/query-response
Request:
  {
    "queryId": "Q001",
    "responseMessage": "Updated documents attached",
    "updatedData": {
      "property.plot_no": "123-A"
    }
  }
Response:
  {
    "arn": "PUDA/2026/00001",
    "status": "PENDING_AT_CLERK",
    "queryStatus": "RESPONDED"
  }
```

### 16.3 Task APIs

```yaml
# Get officer inbox
GET /api/v1/tasks/inbox
Query params:
  - authorityId (optional, defaults to user's authority)
  - status (optional, default: PENDING)
  - sortBy (optional: sla_due_at, created_at)
Response:
  {
    "tasks": [
      {
        "taskId": "T001",
        "arn": "PUDA/2026/00001",
        "serviceName": "Permission for Sale/Gift/Transfer",
        "applicantName": "John Doe",
        "stateId": "PENDING_AT_CLERK",
        "slaDueAt": "2026-02-07T17:00:00Z",
        "slaStatus": "ON_TRACK",
        "createdAt": "2026-02-04T11:00:00Z"
      }
    ],
    "total": 25,
    "page": 1,
    "pageSize": 20
  }

# Take action on task
POST /api/v1/tasks/{taskId}/actions
Request:
  {
    "action": "FORWARD",  # FORWARD | QUERY | APPROVE | REJECT
    "remarks": "Documents verified, forwarding for approval",
    "internalRemarks": "Checked property records",
    # For QUERY action:
    "queryMessage": "Please provide updated sale deed",
    "unlockedFields": ["property.plot_no"],
    "unlockedDocuments": ["DOC_SALE_DEED"]
  }
Response:
  {
    "taskId": "T001",
    "status": "COMPLETED",
    "decision": "FORWARD",
    "newState": "PENDING_AT_SR_ASSISTANT",
    "nextTaskId": "T002"
  }
```

### 16.4 Document APIs

```yaml
# Get presigned upload URL
POST /api/v1/documents/presign
Request:
  {
    "arn": "PUDA/2026/00001",
    "docTypeId": "DOC_SALE_DEED",
    "filename": "sale_deed.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 1048576
  }
Response:
  {
    "uploadUrl": "https://storage.../presigned-url",
    "uploadId": "UP001",
    "expiresAt": "2026-02-04T11:05:00Z"
  }

# Confirm upload
POST /api/v1/documents/confirm
Request:
  {
    "uploadId": "UP001"
  }
Response:
  {
    "docId": "D001",
    "docTypeId": "DOC_SALE_DEED",
    "version": 1,
    "checksum": "abc123...",
    "uploadedAt": "2026-02-04T11:01:00Z"
  }

# Get document
GET /api/v1/documents/{docId}
Response:
  {
    "docId": "D001",
    "downloadUrl": "https://storage.../presigned-url",
    "expiresAt": "2026-02-04T11:10:00Z",
    "metadata": { ... }
  }
```

### 16.5 Public APIs

```yaml
# Verify certificate (no auth required)
GET /api/v1/public/verify/{outputNumber}
Response:
  {
    "valid": true,
    "outputNumber": "PUDA/PST/2026/000001",
    "serviceName": "Permission for Sale/Gift/Transfer",
    "applicantName": "John Doe",
    "propertyUPN": "PUDA-SAS-1234",
    "issuedDate": "2026-02-04",
    "issuingAuthority": "Punjab Urban Development Authority"
  }

# Check application status (with ARN + mobile)
GET /api/v1/public/status/{arn}
Query params:
  - mobile (last 4 digits for verification)
Response:
  {
    "arn": "PUDA/2026/00001",
    "serviceName": "Permission for Sale/Gift/Transfer",
    "status": "PENDING_AT_SR_ASSISTANT",
    "statusLabel": "Under Review",
    "submittedAt": "2026-02-04",
    "lastUpdated": "2026-02-05"
  }
```

---

## 17. Technology Stack

### 17.1 Technology Choices

| Layer | Technology | Version | Rationale |
|-------|------------|---------|-----------|
| **Backend Runtime** | Node.js | 20 LTS | Async I/O, large ecosystem, config-heavy workloads |
| **Backend Framework** | NestJS | 10.x | Modular architecture, TypeScript, enterprise patterns |
| **Language** | TypeScript | 5.x | Type safety, better tooling, maintainability |
| **Primary Database** | PostgreSQL | 16.x | JSONB support, partitioning, mature, reliable |
| **Cache** | Redis | 7.x | Config cache, sessions, rate limiting |
| **Object Storage** | MinIO | Latest | S3-compatible, on-premise option for data sovereignty |
| **Message Queue** | RabbitMQ | 3.12+ | Reliable messaging, dead letter queues |
| **Search** | PostgreSQL FTS | - | Full-text search, avoid additional infrastructure |
| **Frontend** | React | 18.x | Component-based, large ecosystem |
| **UI Framework** | Ant Design | 5.x | Enterprise UI components, form handling |
| **State Management** | React Query + Zustand | Latest | Server state + client state separation |
| **PDF Generation** | Puppeteer | Latest | HTML to PDF, flexible templating |
| **API Documentation** | OpenAPI 3.0 | - | Industry standard, code generation |

### 17.2 Infrastructure Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      PRODUCTION INFRASTRUCTURE                           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Load Balancer │     │   WAF/DDoS      │     │   CDN           │
│   (HAProxy)     │     │   Protection    │     │   (Static)      │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┴───────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        APPLICATION TIER                                  │
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  API Node 1 │  │  API Node 2 │  │  API Node 3 │  │  API Node N │    │
│  │  (NestJS)   │  │  (NestJS)   │  │  (NestJS)   │  │  (NestJS)   │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐                                       │
│  │  Worker 1   │  │  Worker 2   │  (Background jobs: notifications,    │
│  │  (BullMQ)   │  │  (BullMQ)   │   PDF generation, integrations)      │
│  └─────────────┘  └─────────────┘                                       │
└─────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          DATA TIER                                       │
│                                                                          │
│  ┌──────────────────────┐  ┌──────────────────────┐                     │
│  │     PostgreSQL       │  │     PostgreSQL       │                     │
│  │     (Primary)        │──│     (Replica)        │                     │
│  │                      │  │     (Read-only)      │                     │
│  └──────────────────────┘  └──────────────────────┘                     │
│                                                                          │
│  ┌──────────────────────┐  ┌──────────────────────┐                     │
│  │       Redis          │  │       MinIO          │                     │
│  │  (Cache/Sessions)    │  │  (Object Storage)    │                     │
│  │  Sentinel cluster    │  │  4-node cluster      │                     │
│  └──────────────────────┘  └──────────────────────┘                     │
│                                                                          │
│  ┌──────────────────────┐                                               │
│  │      RabbitMQ        │                                               │
│  │   (Message Queue)    │                                               │
│  │   3-node cluster     │                                               │
│  └──────────────────────┘                                               │
└─────────────────────────────────────────────────────────────────────────┘
```

### 17.3 Development Tools

| Category | Tool | Purpose |
|----------|------|---------|
| **Version Control** | Git + GitLab/GitHub | Source control, CI/CD |
| **CI/CD** | GitLab CI / GitHub Actions | Automated builds, tests, deployments |
| **Containerization** | Docker | Consistent environments |
| **Orchestration** | Docker Compose (dev) / Kubernetes (prod) | Container management |
| **API Testing** | Postman / Bruno | API development and testing |
| **Load Testing** | k6 / Artillery | Performance testing |
| **Monitoring** | Prometheus + Grafana | Metrics and dashboards |
| **Logging** | ELK Stack (Elasticsearch, Logstash, Kibana) | Log aggregation |
| **Error Tracking** | Sentry | Error monitoring |

---

## 18. Non-Functional Requirements

### 18.1 Performance Requirements

| Metric | Target | Measurement |
|--------|--------|-------------|
| **API Response Time** | p95 < 500ms | For standard CRUD operations |
| **Form Submission** | p95 < 3s | Including validation |
| **Document Upload** | p95 < 5s | For 10MB file |
| **PDF Generation** | p95 < 10s | For standard certificate |
| **Search Results** | p95 < 1s | Inbox queries |
| **Concurrent Users** | 500+ | Simultaneous active users |
| **Throughput** | 100 req/s | Sustained API load |

### 18.2 Availability Requirements

| Aspect | Target |
|--------|--------|
| **Uptime** | 99.5% (excluding planned maintenance) |
| **Planned Maintenance Window** | Sundays 02:00-06:00 IST |
| **RTO (Recovery Time Objective)** | 4 hours |
| **RPO (Recovery Point Objective)** | 1 hour |
| **Backup Frequency** | Daily full, hourly incremental |
| **Backup Retention** | 30 days online, 1 year archive |

### 18.3 Scalability Requirements

| Dimension | Current | Target (3 years) |
|-----------|---------|------------------|
| **Applications/Year** | 50,000 | 200,000 |
| **Documents/Year** | 500,000 | 2,000,000 |
| **Storage** | 500 GB | 5 TB |
| **Concurrent Users** | 200 | 1,000 |
| **Authorities** | 4 | 10+ |
| **Services** | 30 | 100+ |

### 18.4 Security Requirements

| Requirement | Implementation |
|-------------|----------------|
| **Data at Rest** | AES-256 encryption |
| **Data in Transit** | TLS 1.3 |
| **Authentication** | JWT + Refresh tokens |
| **Session Timeout** | 30 minutes idle |
| **Password Policy** | 12+ chars, complexity rules, 90-day expiry |
| **Audit Logging** | All actions logged, immutable |
| **PII Protection** | Field-level encryption, masking |
| **VAPT** | Annual penetration testing |
| **Compliance** | IT Act 2000, GIGW guidelines |

### 18.5 Disaster Recovery

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     DISASTER RECOVERY ARCHITECTURE                       │
└─────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────┐         ┌────────────────────────────┐
│      PRIMARY SITE          │         │      DR SITE               │
│      (Chandigarh DC)       │         │      (Delhi/Mumbai DC)     │
├────────────────────────────┤         ├────────────────────────────┤
│                            │         │                            │
│  ┌──────────────────────┐  │         │  ┌──────────────────────┐  │
│  │   Application Tier   │  │         │  │   Application Tier   │  │
│  │   (Active)           │  │         │  │   (Standby)          │  │
│  └──────────────────────┘  │         │  └──────────────────────┘  │
│                            │         │                            │
│  ┌──────────────────────┐  │   Sync  │  ┌──────────────────────┐  │
│  │   PostgreSQL         │──┼────────▶│  │   PostgreSQL         │  │
│  │   (Primary)          │  │ (Async) │  │   (Replica)          │  │
│  └──────────────────────┘  │         │  └──────────────────────┘  │
│                            │         │                            │
│  ┌──────────────────────┐  │   Sync  │  ┌──────────────────────┐  │
│  │   MinIO              │──┼────────▶│  │   MinIO              │  │
│  │   (Primary)          │  │         │  │   (Replica)          │  │
│  └──────────────────────┘  │         │  └──────────────────────┘  │
│                            │         │                            │
└────────────────────────────┘         └────────────────────────────┘

Failover Process:
1. Detect primary site failure (automated health checks)
2. Promote DR PostgreSQL to primary
3. Update DNS to point to DR site
4. Activate DR application tier
5. Notify stakeholders
6. Target failover time: < 4 hours
```

---

## 19. Deployment Architecture

### 19.1 Environment Strategy

| Environment | Purpose | Data | Access |
|-------------|---------|------|--------|
| **Development** | Developer testing | Synthetic | Developers |
| **QA/Testing** | QA testing, automation | Anonymized production subset | QA team |
| **Staging** | Pre-production validation | Anonymized production mirror | QA + DevOps |
| **Production** | Live system | Real data | All users |

### 19.2 CI/CD Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CI/CD PIPELINE                                  │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Commit  │───▶│  Build   │───▶│  Test    │───▶│  Deploy  │───▶│  Verify  │
│          │    │          │    │          │    │  (Env)   │    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                     │               │               │               │
                     ▼               ▼               ▼               ▼
              ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
              │ Lint     │    │ Unit     │    │ Dev      │    │ Smoke    │
              │ TypeCheck│    │ Tests    │    │ QA       │    │ Tests    │
              │ Build    │    │ Coverage │    │ Staging  │    │ Health   │
              │ Docker   │    │ Security │    │ Prod     │    │ Checks   │
              └──────────┘    └──────────┘    └──────────┘    └──────────┘

Branch Strategy:
- main (production)
- staging (staging deployments)
- develop (integration branch)
- feature/* (feature branches)
- hotfix/* (production fixes)
```

### 19.3 Docker Configuration

```dockerfile
# Backend Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./
USER nestjs
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

```yaml
# docker-compose.yml (Development)
version: '3.8'
services:
  api:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/puda
      - REDIS_URL=redis://redis:6379
      - MINIO_ENDPOINT=minio:9000
    depends_on:
      - db
      - redis
      - minio
      - rabbitmq

  worker:
    build: ./backend
    command: npm run worker
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/puda
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
      - rabbitmq

  frontend:
    build: ./frontend
    ports:
      - "3001:80"
    depends_on:
      - api

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: puda
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"

  rabbitmq:
    image: rabbitmq:3.12-management-alpine
    ports:
      - "5672:5672"
      - "15672:15672"

volumes:
  postgres_data:
  minio_data:
```

---

## 20. Phased Implementation Plan

### 20.1 Phase Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    IMPLEMENTATION PHASES                                 │
└─────────────────────────────────────────────────────────────────────────┘

     Phase 0        Phase 1        Phase 2        Phase 3        Phase 4
    Foundation    Core Engine       UIs         Payments      Inspections
    (4-6 weeks)   (6-8 weeks)   (6-8 weeks)   (4-6 weeks)   (4-6 weeks)
        │              │              │              │              │
        ▼              ▼              ▼              ▼              ▼
   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
   │ Auth    │   │Workflow │   │ Citizen │   │ Fee     │   │ Mobile  │
   │ Config  │   │ Engine  │   │ Portal  │   │ Engine  │   │ Inspect │
   │ Models  │   │ Rules   │   │ Officer │   │ Gateway │   │ Geo/Photo│
   │ Infra   │   │ Tasks   │   │ Portal  │   │ DD/BG   │   │ Checklist│
   └─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘
        │              │              │              │              │
        │              │              ├──────────────┼──────────────┤
        │              │              │              │              │
        ▼              ▼              ▼              ▼              ▼
                                                          
                            Phase 5           Phase 6
                            Outputs          Hardening
                          (4-6 weeks)       (4-6 weeks)
                               │                 │
                               ▼                 ▼
                          ┌─────────┐       ┌─────────┐
                          │Templates│       │ Security│
                          │ PDF Gen │       │ Perf    │
                          │ eSign   │       │ DR      │
                          │ QR Code │       │ Multi-  │
                          └─────────┘       │Authority│
                                            └─────────┘

Legend:
═══════  Sequential dependency
- - - -  Can run in parallel
```

### 20.2 Phase 0: Foundation (4-6 weeks)

#### Scope
- Infrastructure setup
- Core data models
- Authentication and authorization
- Configuration registry

#### Deliverables

| Module | Features | Priority |
|--------|----------|----------|
| **Infrastructure** | Dev environment, CI/CD pipeline, Docker setup | P0 |
| **Database** | Schema creation, migrations framework | P0 |
| **Auth Service** | Login, JWT, session management | P0 |
| **User Management** | User CRUD, posting management | P0 |
| **Authority Config** | Authority master, designation mapping | P0 |
| **Role Mapping** | Designation → System Role mapping | P0 |
| **Config Registry** | Service config storage, validation | P0 |
| **Audit Framework** | Event logging infrastructure | P0 |

#### Dependencies
- Cloud/on-premise infrastructure provisioned
- Domain names, SSL certificates
- External API credentials (SMS, email)

#### Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Infrastructure delays | Medium | High | Start with cloud, migrate to on-prem later |
| Role mapping complexity | Medium | Medium | Start with PUDA only |
| Schema changes | Low | Medium | Use migrations from day 1 |

#### Testing Strategy
- **Unit Tests:** 80% coverage on auth, config validation
- **Integration Tests:** Database operations, Redis connectivity
- **Security Tests:** Authentication flows, token validation
- **No UAT** (infrastructure only)

#### Exit Criteria
- [ ] All developers can run local environment
- [ ] CI/CD pipeline deploys to dev environment
- [ ] User can login and view dashboard
- [ ] Role mapping works for PUDA designations

---

### 20.3 Phase 1: Core Workflow Engine (6-8 weeks)

#### Scope
- Workflow state machine
- Rules engine (JSONLogic)
- Task management
- Query/resubmission loop
- Notifications (basic)

#### Deliverables

| Module | Features | Priority |
|--------|----------|----------|
| **State Machine** | State transitions, guards, actions | P0 |
| **Rules Engine** | JSONLogic evaluation, rule context | P0 |
| **Task Service** | Task creation, assignment, completion | P0 |
| **Query Service** | Raise query, unlock fields/docs, resubmit | P0 |
| **SLA Engine** | SLA calculation, working calendar | P1 |
| **Notification Service** | Email/SMS stubs, templates | P1 |
| **Application Service** | CRUD, validation, state management | P0 |

#### Pilot Services

| Service | Rationale |
|---------|-----------|
| **Registration of Architect** | Simplest workflow (4-day SLA, 2 stages) |
| **No Due Certificate** | Tests ledger integration mock |
| **Sanction of Water Supply** | Adds utility service pattern |

#### Dependencies
- Phase 0 complete
- Service configurations drafted
- Mock external APIs (property master, ledger)

#### Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| State machine bugs | Medium | High | Extensive test coverage, state diagrams |
| Query loop complexity | Medium | Medium | Define clear state transitions |
| Rules engine performance | Low | Medium | Cache compiled rules |

#### Testing Strategy
- **Unit Tests:** 70% coverage on state machine, rules
- **Integration Tests:** Full workflow execution
- **State Machine Tests:** All valid/invalid transitions
- **UAT Prep:** Create test scenarios from BRDs

#### Exit Criteria
- [ ] Architect registration flows end-to-end (happy path)
- [ ] Query/resubmission works correctly
- [ ] SLA timer starts and tracks correctly
- [ ] Audit log captures all events

---

### 20.4 Phase 2: Citizen and Officer UIs (6-8 weeks)

#### Scope
- Citizen portal (React)
- Officer workbench (React)
- Dynamic form renderer
- Document upload
- Application tracking

#### Deliverables

| Module | Features | Priority |
|--------|----------|----------|
| **Form Renderer** | Config-driven forms, validation, conditional fields | P0 |
| **Document Uploader** | Upload, preview, versioning | P0 |
| **Citizen Dashboard** | My applications, status tracking | P0 |
| **Service Catalog** | Browse services, start application | P0 |
| **Officer Inbox** | Task list, filtering, sorting | P0 |
| **Application Review** | View data, documents, timeline | P0 |
| **Decision Panel** | Forward, query, approve, reject | P0 |
| **Query Builder** | Select fields/docs to unlock | P1 |

#### Dependencies
- Phase 1 complete
- UI/UX designs approved
- Form configurations for pilot services

#### Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Form complexity | Medium | Medium | Start with simple forms, iterate |
| Performance (large forms) | Medium | Medium | Lazy loading, virtualization |
| Browser compatibility | Low | Low | Test on Chrome, Firefox, Edge |

#### Testing Strategy
- **Unit Tests:** 60% coverage on components
- **Integration Tests:** API integration, form submission
- **E2E Tests:** Cypress for critical flows
- **UAT:** Internal users test pilot services

#### Exit Criteria
- [ ] Citizen can complete application for pilot services
- [ ] Officer can process applications
- [ ] Query/response works in UI
- [ ] Mobile responsive design works

---

### 20.5 Phase 3: Payments and Fees (4-6 weeks)

**Can run in parallel with Phase 4**

#### Scope
- Fee calculation engine
- Payment gateway integration
- Offline instrument handling
- Payment reconciliation

#### Deliverables

| Module | Features | Priority |
|--------|----------|----------|
| **Fee Engine** | Time-based escalation, components | P0 |
| **Payment Gateway** | Razorpay/PayU integration | P0 |
| **Payment UI** | Payment page, status updates | P0 |
| **Offline Instruments** | DD/BG capture, verification | P1 |
| **Finance Dashboard** | Pending verifications, reports | P1 |
| **Reconciliation** | Daily reconciliation, mismatches | P2 |

#### Target Services
- **Permission for Sale/Gift/Transfer** (gateway payment)
- **Certificate of Registration as Estate Agent** (DD + BG)

#### Dependencies
- Phase 2 complete
- Payment gateway sandbox credentials
- Fee schedules from business team

#### Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Gateway integration issues | Medium | High | Use sandbox extensively |
| Fee calculation errors | Medium | High | Extensive test cases |
| BG tracking complexity | Low | Medium | Start simple, enhance later |

#### Testing Strategy
- **Unit Tests:** Fee calculation, escalation logic
- **Integration Tests:** Gateway sandbox
- **System Tests:** Payment → workflow state changes
- **UAT:** Finance team validates fees

#### Exit Criteria
- [ ] Online payment works end-to-end
- [ ] Fee escalation calculates correctly
- [ ] DD/BG can be captured and verified
- [ ] Payment receipt generated

---

### 20.6 Phase 4: Physical Verification (4-6 weeks)

**Can run in parallel with Phase 3**

#### Scope
- Inspection service
- Mobile inspection app
- Geo-tagging and photos
- Checklist management

#### Deliverables

| Module | Features | Priority |
|--------|----------|----------|
| **Inspection Service** | Create, assign, complete inspections | P0 |
| **Mobile App** | React Native or PWA | P0 |
| **Geo Capture** | Location with accuracy | P0 |
| **Photo Capture** | Geo-tagged photos | P0 |
| **Checklist Engine** | Config-driven checklists | P1 |
| **Offline Support** | Queue and sync | P1 |
| **Scheduling** | Slot booking (optional) | P2 |

#### Target Services
- **Sanction of Building Plans** (site inspection)
- **Completion Certificate** (physical verification)

#### Dependencies
- Phase 2 complete
- Mobile devices for testing
- Checklist configurations

#### Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Offline sync issues | Medium | Medium | Robust conflict resolution |
| GPS accuracy | Medium | Low | Allow manual override |
| Device compatibility | Low | Medium | Test on common devices |

#### Testing Strategy
- **Unit Tests:** Inspection logic
- **Integration Tests:** Photo upload, geo capture
- **Field Tests:** Real device testing
- **UAT:** Field officers pilot

#### Exit Criteria
- [ ] Inspector can complete inspection on mobile
- [ ] Photos captured with location
- [ ] Checklist submitted successfully
- [ ] Offline mode works

---

### 20.7 Phase 5: Output Generation (4-6 weeks)

#### Scope
- PDF template engine
- Certificate generation
- Digital signature (eSign)
- QR verification

#### Deliverables

| Module | Features | Priority |
|--------|----------|----------|
| **Template Engine** | HTML templates, data binding | P0 |
| **PDF Generator** | Puppeteer-based PDF creation | P0 |
| **Output Numbering** | Unique certificate numbers | P0 |
| **eSign Integration** | NIC eSign or equivalent | P1 |
| **QR Code** | Verification QR codes | P1 |
| **Public Verification** | Certificate verification page | P1 |
| **Output Download** | Secure download with audit | P0 |

#### Target
- All pilot services with output generation

#### Dependencies
- Phases 1-4 complete
- eSign API access
- Output templates designed

#### Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Template complexity | Medium | Medium | Start with simple templates |
| eSign availability | Medium | High | Design for async signing |
| PDF rendering issues | Low | Low | Test across browsers |

#### Testing Strategy
- **Unit Tests:** Template rendering
- **Integration Tests:** eSign sandbox
- **Visual Tests:** PDF output verification
- **UAT:** Sample outputs reviewed

#### Exit Criteria
- [ ] Certificates generated correctly
- [ ] eSign integration works
- [ ] QR verification works
- [ ] Download with audit logging

---

### 20.8 Phase 6: Hardening and Scale (4-6 weeks)

#### Scope
- Security hardening
- Performance optimization
- Multi-authority rollout
- Disaster recovery

#### Deliverables

| Activity | Details | Priority |
|----------|---------|----------|
| **Security Audit** | VAPT, code review | P0 |
| **Performance Tuning** | Query optimization, caching | P0 |
| **Load Testing** | 500 concurrent users | P0 |
| **DR Setup** | Backup, replication, failover | P0 |
| **Multi-Authority** | GMADA, GLADA, BDA configs | P1 |
| **Admin Console** | User management, config publishing | P1 |
| **Monitoring** | Dashboards, alerts | P0 |

#### Dependencies
- Phases 1-5 stable
- Security audit vendor
- DR infrastructure

#### Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Security vulnerabilities | Medium | High | Fix all critical/high findings |
| Performance issues | Medium | Medium | Profile and optimize |
| DR failover failures | Low | High | Regular DR drills |

#### Testing Strategy
- **Performance Tests:** Load, stress, soak
- **Security Tests:** Penetration testing
- **DR Tests:** Failover simulation
- **UAT:** Multi-authority end-to-end

#### Exit Criteria
- [ ] All critical security issues fixed
- [ ] Performance targets met
- [ ] DR failover tested successfully
- [ ] All 4 authorities configured

---

### 20.9 Service Rollout Plan

| Phase | Services | Timeline |
|-------|----------|----------|
| **Pilot (Phase 2)** | Registration of Architect, No Due Certificate, Sanction of Water Supply | Week 12-16 |
| **Wave 1 (Phase 3-5)** | Permission for Sale/Gift/Transfer, Estate Agent Registration, Building Plans | Week 20-26 |
| **Wave 2** | Change of Ownership (all variants), Conveyance Deed, Completion Certificates | Week 28-34 |
| **Wave 3** | Remaining services (20+) | Week 36-48 |

---

## 21. Testing Strategy

### 21.1 Testing Pyramid

```
                    ┌─────────────┐
                    │    E2E      │  10%
                    │   Tests     │
                    └─────────────┘
               ┌─────────────────────┐
               │   Integration       │  20%
               │      Tests          │
               └─────────────────────┘
          ┌───────────────────────────────┐
          │         Unit Tests            │  70%
          │                               │
          └───────────────────────────────┘
```

### 21.2 Test Categories

| Category | Tool | Coverage Target | Responsibility |
|----------|------|-----------------|----------------|
| **Unit Tests** | Jest | 70%+ | Developers |
| **Integration Tests** | Jest + Supertest | Key flows | Developers |
| **API Tests** | Postman/Newman | All endpoints | QA |
| **E2E Tests** | Cypress | Critical paths | QA |
| **Performance Tests** | k6 | Key scenarios | QA/DevOps |
| **Security Tests** | OWASP ZAP | All endpoints | Security team |
| **UAT** | Manual | BRD scenarios | Business users |

### 21.3 BRD Validation Test Cases

For each service, validate against BRD requirements:

```markdown
## Test Case Template: [Service Name]

### TC-001: Happy Path Submission
**BRD Reference:** FR-01 to FR-05
**Preconditions:** User logged in, service available
**Steps:**
1. Select authority
2. Fill all mandatory fields
3. Upload all required documents
4. Submit application
**Expected Result:** 
- ARN generated
- Acknowledgement shown
- Status = PENDING_AT_CLERK

### TC-002: Mandatory Field Validation
**BRD Reference:** BR-01
**Steps:**
1. Leave mandatory field empty
2. Attempt submission
**Expected Result:**
- Validation error displayed
- Submission blocked

### TC-003: Document Type Validation
**BRD Reference:** Documents section
**Steps:**
1. Upload wrong file type
**Expected Result:**
- Error: "Only PDF files allowed"

### TC-004: SLA Tracking
**BRD Reference:** SLA section
**Steps:**
1. Submit application
2. Check SLA timer
**Expected Result:**
- SLA due date = submission + [X] working days
- Stage SLA correctly allocated

### TC-005: Query/Resubmission
**BRD Reference:** FR-10
**Steps:**
1. Officer raises query
2. Citizen responds
**Expected Result:**
- Only unlocked fields editable
- Application returns to same stage
- SLA resumed

### TC-006: Role-Based Access
**BRD Reference:** RBAC requirements
**Steps:**
1. Login as wrong role
2. Attempt action
**Expected Result:**
- Action denied
- Error: "Unauthorized"

### TC-007: Output Generation
**BRD Reference:** Output section
**Steps:**
1. Approve application
**Expected Result:**
- Certificate generated
- Correct data populated
- Download available
```

### 21.4 Performance Test Scenarios

```javascript
// k6 load test script
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up
    { duration: '5m', target: 100 },  // Steady state
    { duration: '2m', target: 200 },  // Peak load
    { duration: '5m', target: 200 },  // Sustained peak
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests under 500ms
    http_req_failed: ['rate<0.01'],    // Error rate under 1%
  },
};

export default function () {
  // Scenario 1: View inbox
  const inboxRes = http.get('https://api.puda.gov.in/api/v1/tasks/inbox', {
    headers: { Authorization: `Bearer ${__ENV.TOKEN}` },
  });
  check(inboxRes, { 'inbox status 200': (r) => r.status === 200 });
  sleep(1);

  // Scenario 2: View application
  const appRes = http.get('https://api.puda.gov.in/api/v1/applications/PUDA/2026/00001', {
    headers: { Authorization: `Bearer ${__ENV.TOKEN}` },
  });
  check(appRes, { 'application status 200': (r) => r.status === 200 });
  sleep(1);

  // Scenario 3: Submit form
  const submitRes = http.post(
    'https://api.puda.gov.in/api/v1/applications',
    JSON.stringify({ serviceKey: 'registration_of_architect', authorityId: 'PUDA' }),
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${__ENV.TOKEN}` } }
  );
  check(submitRes, { 'submit status 201': (r) => r.status === 201 });
  sleep(2);
}
```

---

## 22. Appendices

### 22.1 Appendix A: Service Catalog

| # | Service Key | Service Name | SLA (Days) | Stages | Fee |
|---|-------------|--------------|------------|--------|-----|
| 1 | `registration_of_architect` | Registration of Architect | 4 | 2 | TBD |
| 2 | `no_due_certificate` | No Due Certificate | 5 | 3 | No |
| 3 | `sanction_of_water_supply` | Sanction of Water Supply | 7 | 3 | TBD |
| 4 | `sanction_of_sewerage` | Sanction of Sewerage Connection | 7 | 3 | No |
| 5 | `permission_for_sale_transfer` | Permission for Sale/Gift/Transfer | 10 | 3 | Yes |
| 6 | `change_of_ownership` | Change of Ownership | 5 | 3 | TBD |
| 7 | `change_of_ownership_death_heirs` | Change of Ownership (Death - All Heirs) | 30 | 3 | TBD |
| 8 | `change_of_ownership_death_will` | Change of Ownership (Death - Registered Will) | 30 | 3 | TBD |
| 9 | `conveyance_deed` | Issuance of Conveyance Deed | 15 | 4 | TBD |
| 10 | `building_plan_sanction` | Sanction of Building Plans | 7 | 4 | TBD |
| 11 | `building_plan_private` | Building Plans (Private Property) | 7 | 4 | TBD |
| 12 | `completion_certificate_above_1000` | Completion Certificate (>1000 sq yd) | 14 | 5 | TBD |
| 13 | `completion_certificate_upto_1000` | Completion Certificate (≤1000 sq yd) | 14 | 4 | TBD |
| 14 | `dpc_certificate` | DPC Certificate | 7 | 3 | TBD |
| 15 | `estate_agent_registration` | Certificate of Registration as Estate Agent | TBD | 3 | DD+BG |
| 16 | `promoter_registration` | Certificate of Registration as Promoter | TBD | 3 | DD+BG |
| ... | ... | ... | ... | ... | ... |

### 22.2 Appendix B: System Role Matrix

| System Role | Services | States | Actions |
|-------------|----------|--------|---------|
| `CLERK` | All | PENDING_AT_CLERK | Forward, Query, Reject |
| `DEALING_ASSISTANT` | All | PENDING_AT_CLERK | Forward, Query, Reject |
| `SENIOR_ASSISTANT` | All | PENDING_AT_SR_ASSISTANT | Forward, Query, Reject |
| `JUNIOR_ENGINEER` | Water, Sewerage, DPC, OC | PENDING_AT_JE | Forward, Query, Reject |
| `DRAFTSMAN` | Building Plans, Architect Reg | PENDING_AT_DRAFTSMAN | Forward, Query, Reject |
| `SDO` | Building, Water, Sewerage, DPC | PENDING_AT_SDO | Approve, Query, Reject |
| `ESTATE_OFFICER` | Property services, OC >1000 | PENDING_AT_EO | Approve, Query, Reject |
| `ACCOUNT_OFFICER` | NDC, Fee services | PENDING_AT_AO | Forward, Query, Reject |
| `SUPERINTENDENT` | Property services | PENDING_AT_SUPT | Approve, Query, Reject |
| `INSPECTOR` | All with verification | INSPECTION | Complete Inspection |

### 22.3 Appendix C: Glossary

| Term | Definition |
|------|------------|
| **ARN** | Application Reference Number - unique identifier for each application |
| **BRD** | Business Requirement Document |
| **CoA** | Council of Architecture |
| **DPC** | Damp Proof Course - construction milestone certificate |
| **GPA** | General Power of Attorney |
| **NDC** | No Due Certificate |
| **OC** | Occupation Certificate / Completion Certificate |
| **PUDA** | Punjab Urban Development Authority |
| **GMADA** | Greater Mohali Area Development Authority |
| **GLADA** | Greater Ludhiana Area Development Authority |
| **BDA** | Bathinda Development Authority |
| **SLA** | Service Level Agreement |
| **UPN** | Unique Property Number |
| **DD** | Demand Draft |
| **BG** | Bank Guarantee |

### 22.4 Appendix D: Configuration Checklist for New Service

```markdown
## New Service Onboarding Checklist

### 1. Service Definition
- [ ] Service key defined (lowercase, underscores)
- [ ] Display name in English
- [ ] Category assigned
- [ ] Applicable authorities listed
- [ ] SLA defined (total days, working/calendar)
- [ ] Prerequisites identified

### 2. Form Configuration
- [ ] Pages defined
- [ ] Sections within pages
- [ ] Fields with types, validations
- [ ] Conditional visibility rules
- [ ] Table fields for repeatable data
- [ ] Lookup integrations (property, etc.)

### 3. Document Configuration
- [ ] All document types listed
- [ ] Mandatory/conditional flags
- [ ] File type restrictions
- [ ] Size limits
- [ ] Per-row documents (if applicable)

### 4. Workflow Configuration
- [ ] States defined (role-based)
- [ ] Transitions mapped
- [ ] Guards defined
- [ ] Actions assigned
- [ ] SLA per stage

### 5. Fee Configuration (if applicable)
- [ ] Fee mode (gateway/offline/none)
- [ ] Components defined
- [ ] Escalation rules
- [ ] Gateway mapping

### 6. Output Configuration
- [ ] Output template designed
- [ ] Data bindings mapped
- [ ] Numbering pattern defined
- [ ] Signing requirement

### 7. Notification Configuration
- [ ] Events identified
- [ ] Templates created
- [ ] Channels configured

### 8. Testing
- [ ] Unit tests for rules
- [ ] Integration tests for workflow
- [ ] UAT scenarios documented
- [ ] BRD traceability matrix
```

### 22.5 Appendix E: Assumptions

| ID | Assumption | Impact if Invalid |
|----|------------|-------------------|
| A1 | Property master database exists with API access | Need to build property data store |
| A2 | Ledger/accounts system available for dues inquiry | Need integration workaround |
| A3 | SMS/email gateways are standard REST APIs | May need custom adapters |
| A4 | eSign API is NIC or compatible government standard | May need different signing approach |
| A5 | All authorities share same workflow logic | Need authority-specific workflows |
| A6 | Working days = Mon-Sat excluding gazetted holidays | May need calendar customization |
| A7 | Initial pilot with PUDA only | Multi-authority from start increases complexity |
| A8 | Peak concurrent users ~500 | Need to revisit scaling strategy |
| A9 | Document sizes typically <10MB | May need chunked upload |
| A10 | Officers have stable internet connectivity | Need better offline support |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Jan 2026 | [Original Author] | Initial architecture |
| 2.0 | Feb 2026 | [Reviewer] | Comprehensive revision incorporating BRD analysis, gap fixes, phased implementation |

---

**End of Architecture and Design Document v2.0**

---

## 17. Technology Stack

### 17.1 Recommended Stack

| Layer | Technology | Version | Rationale |
|-------|------------|---------|-----------|
| **Backend** | Node.js | 20 LTS | Async I/O, JSON-native, large ecosystem |
| **Framework** | NestJS | 10.x | Enterprise patterns, TypeScript, modular |
| **Language** | TypeScript | 5.x | Type safety, better tooling |
| **Database** | PostgreSQL | 16 | JSONB support, robust, ACID |
| **Cache** | Redis | 7.x | Config caching, sessions, rate limiting |
| **Queue** | BullMQ | 5.x | Redis-based, reliable, dashboard |
| **Object Storage** | MinIO | Latest | S3-compatible, on-prem option |
| **Frontend** | React | 18.x | Component-based, large ecosystem |
| **UI Framework** | Ant Design | 5.x | Enterprise components, forms |
| **State Management** | Zustand | 4.x | Simple, lightweight |
| **API Client** | React Query | 5.x | Caching, sync, optimistic updates |
| **PDF Generation** | Puppeteer | 22.x | Chrome-based, accurate rendering |
| **Rules Engine** | json-logic-js | 2.x | Safe JSON expressions |

### 17.2 Development Tools

| Tool | Purpose |
|------|---------|
| Docker | Containerization |
| Docker Compose | Local development |
| ESLint + Prettier | Code quality |
| Jest | Unit testing |
| Playwright | E2E testing |
| k6 | Load testing |
| GitHub Actions | CI/CD |

### 17.3 Project Structure

```
puda-workflow-engine/
├── apps/
│   ├── api/                    # Backend API (NestJS)
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── config/
│   │   │   │   ├── workflow/
│   │   │   │   ├── application/
│   │   │   │   ├── document/
│   │   │   │   ├── task/
│   │   │   │   ├── payment/
│   │   │   │   ├── output/
│   │   │   │   ├── inspection/
│   │   │   │   ├── notification/
│   │   │   │   └── audit/
│   │   │   ├── common/
│   │   │   │   ├── decorators/
│   │   │   │   ├── filters/
│   │   │   │   ├── guards/
│   │   │   │   ├── interceptors/
│   │   │   │   └── pipes/
│   │   │   ├── integrations/
│   │   │   │   ├── property-master/
│   │   │   │   ├── ledger/
│   │   │   │   ├── payment-gateway/
│   │   │   │   ├── esign/
│   │   │   │   └── notification/
│   │   │   └── main.ts
│   │   ├── test/
│   │   └── package.json
│   │
│   ├── citizen-portal/         # Citizen React App
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── hooks/
│   │   │   ├── services/
│   │   │   └── store/
│   │   └── package.json
│   │
│   ├── officer-portal/         # Officer React App
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── hooks/
│   │   │   ├── services/
│   │   │   └── store/
│   │   └── package.json
│   │
│   └── admin-console/          # Admin React App
│       └── ...
│
├── packages/
│   ├── shared/                 # Shared types and utilities
│   │   ├── src/
│   │   │   ├── types/
│   │   │   ├── constants/
│   │   │   └── utils/
│   │   └── package.json
│   │
│   ├── config-schema/          # JSON schemas
│   │   ├── schemas/
│   │   │   ├── service.schema.json
│   │   │   ├── form.schema.json
│   │   │   ├── workflow.schema.json
│   │   │   └── ...
│   │   └── package.json
│   │
│   └── form-renderer/          # Shared form component
│       └── ...
│
├── service-packs/              # Service configurations
│   ├── permission_for_sale_transfer/
│   ├── no_due_certificate/
│   ├── registration_of_architect/
│   └── ...
│
├── infrastructure/
│   ├── docker/
│   │   ├── Dockerfile.api
│   │   ├── Dockerfile.portal
│   │   └── docker-compose.yml
│   ├── k8s/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── ingress.yaml
│   └── terraform/
│       └── ...
│
├── docs/
│   ├── api/
│   ├── architecture/
│   └── guides/
│
├── scripts/
│   ├── db-migrate.ts
│   ├── seed-data.ts
│   └── validate-configs.ts
│
├── package.json
├── turbo.json                  # Monorepo tooling
└── README.md
```

---

## 18. Non-Functional Requirements

### 18.1 Performance Requirements

| Metric | Target | Measurement |
|--------|--------|-------------|
| API Response Time (P95) | < 500ms | Application endpoints |
| API Response Time (P99) | < 2s | Application endpoints |
| Page Load Time | < 3s | Initial page load |
| Concurrent Users | 500 | Simultaneous active |
| Throughput | 100 req/s | Peak sustained |
| Database Query Time | < 100ms | P95 |

### 18.2 Availability Requirements

| Metric | Target |
|--------|--------|
| Uptime | 99.5% (excludes planned maintenance) |
| Planned Maintenance Window | Sunday 2 AM - 6 AM |
| Recovery Time Objective (RTO) | 4 hours |
| Recovery Point Objective (RPO) | 1 hour |

### 18.3 Scalability Requirements

| Dimension | Current | Target (Year 1) | Target (Year 3) |
|-----------|---------|-----------------|-----------------|
| Applications/Year | - | 50,000 | 150,000 |
| Documents/Year | - | 500,000 | 1,500,000 |
| Concurrent Users | - | 500 | 1,500 |
| Authorities | 1 (PUDA) | 4 | 10 |
| Services | 5 | 30 | 50 |

### 18.4 Security Requirements

| Requirement | Standard |
|-------------|----------|
| Data Encryption at Rest | AES-256 |
| Data Encryption in Transit | TLS 1.3 |
| Authentication | JWT + Refresh Tokens |
| Password Policy | 12+ chars, complexity, 90-day expiry |
| Session Management | 30-min idle timeout, single session |
| Audit Logging | All actions, immutable, 7-year retention |
| PII Protection | Field-level encryption, masking |
| VAPT | Annual penetration testing |

### 18.5 Compliance Requirements

| Requirement | Description |
|-------------|-------------|
| IT Act 2000 | Electronic records compliance |
| Data Localization | All data stored in India |
| WCAG 2.1 AA | Accessibility compliance |
| RTI Act | Audit trail for information requests |
| eSign Guidelines | NIC eSign compliance |

---

## 19. Deployment Architecture

### 19.1 Production Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PRODUCTION DEPLOYMENT                             │
└─────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────┐
                              │   Internet   │
                              └──────┬──────┘
                                     │
                              ┌──────▼──────┐
                              │   WAF/CDN   │
                              │ (CloudFlare)│
                              └──────┬──────┘
                                     │
                              ┌──────▼──────┐
                              │Load Balancer│
                              │   (Nginx)   │
                              └──────┬──────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
       ┌──────▼──────┐       ┌──────▼──────┐       ┌──────▼──────┐
       │  API Node 1 │       │  API Node 2 │       │  API Node 3 │
       │  (NestJS)   │       │  (NestJS)   │       │  (NestJS)   │
       └──────┬──────┘       └──────┬──────┘       └──────┬──────┘
              │                      │                      │
              └──────────────────────┼──────────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
  ┌──────▼──────┐            ┌──────▼──────┐            ┌──────▼──────┐
  │ PostgreSQL  │            │    Redis    │            │    MinIO    │
  │  Primary    │            │   Cluster   │            │   Cluster   │
  │  + Replica  │            │             │            │             │
  └─────────────┘            └─────────────┘            └─────────────┘

                              ┌─────────────┐
                              │   BullMQ    │
                              │   Workers   │
                              │  (3 nodes)  │
                              └─────────────┘
```

### 19.2 Infrastructure Specifications

| Component | Specification | Count |
|-----------|--------------|-------|
| **API Servers** | 4 vCPU, 8GB RAM | 3 |
| **Worker Servers** | 2 vCPU, 4GB RAM | 3 |
| **PostgreSQL** | 8 vCPU, 32GB RAM, 500GB SSD | 1 Primary + 1 Replica |
| **Redis** | 2 vCPU, 8GB RAM | 3 (Cluster) |
| **MinIO** | 4 vCPU, 16GB RAM, 2TB storage | 4 (Distributed) |
| **Load Balancer** | Nginx | 2 (HA) |

### 19.3 Backup Strategy

| Data Type | Frequency | Retention | Storage |
|-----------|-----------|-----------|---------|
| PostgreSQL Full | Daily | 30 days | S3/Object Storage |
| PostgreSQL WAL | Continuous | 7 days | S3/Object Storage |
| Documents | Continuous (via MinIO replication) | Permanent | MinIO Replica |
| Configs | On change | All versions | Git |
| Audit Logs | Daily archive | 7 years | Cold Storage |

### 19.4 Monitoring Stack

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        MONITORING ARCHITECTURE                           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  API Nodes  │────▶│  Prometheus │────▶│   Grafana   │────▶│   Alerts    │
│  (metrics)  │     │             │     │ (dashboards)│     │ (PagerDuty) │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘

┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  API Nodes  │────▶│   Loki      │────▶│   Grafana   │
│   (logs)    │     │             │     │  (explore)  │
└─────────────┘     └─────────────┘     └─────────────┘

┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  API Nodes  │────▶│   Jaeger    │────▶│   Jaeger    │
│  (traces)   │     │             │     │     UI      │
└─────────────┘     └─────────────┘     └─────────────┘
```

### 19.5 Key Dashboards

| Dashboard | Metrics |
|-----------|---------|
| **System Health** | CPU, Memory, Disk, Network |
| **API Performance** | Request rate, latency, errors |
| **Workflow Metrics** | Applications by state, SLA status |
| **Queue Health** | Job processing rate, failures |
| **Database** | Connections, query time, locks |
| **Business KPIs** | Submissions/day, approvals/day, SLA compliance |

---

## 20. Phased Implementation Plan

### 20.1 Phase Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        IMPLEMENTATION PHASES                             │
└─────────────────────────────────────────────────────────────────────────┘

Phase 0 ═══════════════════════════════════════════════> Foundation (6 weeks)
         │
Phase 1 ═══════════════════════════════════════════════> Core Engine (8 weeks)
         │
Phase 2 ═══════════════════════════════════════════════> UIs (8 weeks)
         │
         ├──────────────> Phase 3 (Payments) ══════════> (6 weeks) PARALLEL
         └──────────────> Phase 4 (Inspections) ═══════> (6 weeks) PARALLEL
                                    │
Phase 5 ═══════════════════════════════════════════════> Outputs (6 weeks)
         │
Phase 6 ═══════════════════════════════════════════════> Hardening (6 weeks)
```

### 20.2 Phase 0: Foundation (6 weeks)

**Objective:** Establish infrastructure, core data models, and authentication.

| Week | Deliverables |
|------|--------------|
| 1-2 | Project setup, CI/CD, database schema, Docker compose |
| 3-4 | Auth module, user management, designation-role mapping |
| 5-6 | Config registry, schema validation, seed data |

**Exit Criteria:**
- [ ] Local dev environment working
- [ ] User login functional
- [ ] Role mapping operational
- [ ] Config validation working

### 20.3 Phase 1: Core Workflow Engine (8 weeks)

**Objective:** Working workflow engine with sequential routing and query loop.

| Week | Deliverables |
|------|--------------|
| 1-2 | State machine implementation, transition validation |
| 3-4 | Rules engine (JSONLogic), guard evaluation |
| 5-6 | Task service, officer inbox, assignment |
| 7-8 | Query/resubmission loop, SLA engine |

**Target Services:**
1. Registration of Architect (simplest)
2. No Due Certificate (ledger integration)

**Exit Criteria:**
- [ ] End-to-end workflow for pilot services
- [ ] SLA tracking operational
- [ ] Query loop working

### 20.4 Phase 2: User Interfaces (8 weeks)

**Objective:** Functional citizen and officer portals.

| Week | Deliverables |
|------|--------------|
| 1-2 | Form renderer component, validation |
| 3-4 | Document upload, citizen dashboard |
| 5-6 | Officer workbench, inbox, review |
| 7-8 | Query response UI, notifications integration |

**Exit Criteria:**
- [ ] Citizens can submit applications
- [ ] Officers can process applications
- [ ] Notifications sending

### 20.5 Phase 3: Payments (6 weeks) - PARALLEL

**Objective:** Fee calculation and payment processing.

| Week | Deliverables |
|------|--------------|
| 1-2 | Fee engine with escalation, gateway integration |
| 3-4 | Payment flow, callback handling |
| 5-6 | Offline instrument capture, verification workflow |

**Target Service:** Permission for Sale/Gift/Transfer

**Exit Criteria:**
- [ ] Online payment working
- [ ] Fee escalation tested
- [ ] DD/BG capture working

### 20.6 Phase 4: Physical Verification (6 weeks) - PARALLEL

**Objective:** Inspection capability with mobile support.

| Week | Deliverables |
|------|--------------|
| 1-2 | Inspection data model, scheduling |
| 3-4 | Mobile-friendly inspection UI |
| 5-6 | Geo-tagging, photo capture, checklist |

**Target Service:** Sanction of Building Plans

**Exit Criteria:**
- [ ] Inspection workflow working
- [ ] Mobile capture functional
- [ ] Geo-tagging working

### 20.7 Phase 5: Output Generation (6 weeks)

**Objective:** Certificate/letter generation with digital signing.

| Week | Deliverables |
|------|--------------|
| 1-2 | Template engine, PDF generation |
| 3-4 | eSign integration, signing flow |
| 5-6 | QR verification, output download |

**Exit Criteria:**
- [ ] Certificates generating correctly
- [ ] Digital signatures working
- [ ] QR verification functional

### 20.8 Phase 6: Hardening (6 weeks)

**Objective:** Production readiness across security, performance, and operations.

| Week | Deliverables |
|------|--------------|
| 1-2 | Security audit fixes, VAPT remediation |
| 3-4 | Performance optimization, load testing |
| 5-6 | DR testing, monitoring setup, documentation |

**Exit Criteria:**
- [ ] Security audit passed
- [ ] Load test passed (500 concurrent users)
- [ ] DR tested successfully
- [ ] Runbooks complete

---

## 21. Testing Strategy

### 21.1 Testing Pyramid

```
                    ┌───────────┐
                   │    UAT    │  (5%)
                  │   E2E     │
                 └───────────┘
                ┌───────────────┐
               │   Integration  │  (20%)
              │     Tests       │
             └───────────────────┘
            ┌───────────────────────┐
           │      Unit Tests        │  (75%)
          │                         │
         └───────────────────────────┘
```

### 21.2 Test Types by Phase

| Phase | Unit | Integration | E2E | UAT |
|-------|------|-------------|-----|-----|
| Phase 0 | 80% | 20% | - | - |
| Phase 1 | 70% | 25% | 5% | Prep |
| Phase 2 | 60% | 25% | 15% | Internal |
| Phase 3 | 60% | 30% | 10% | Finance |
| Phase 4 | 50% | 30% | 20% | Field |
| Phase 5 | 60% | 25% | 15% | Domain |
| Phase 6 | 30% | 30% | 40% | Full |

### 21.3 Unit Testing Guidelines

```typescript
// Example: Workflow engine unit test
describe('WorkflowEngine', () => {
  describe('executeTransition', () => {
    it('should transition from DRAFT to SUBMITTED on submit', async () => {
      const app = createMockApplication({ stateId: 'DRAFT' });
      const config = createMockConfig();
      
      const result = await workflowEngine.executeTransition(
        app,
        'SUBMIT',
        config
      );
      
      expect(result.newStateId).toBe('PAYMENT_PENDING');
      expect(result.actions).toContain('generateARN');
    });
    
    it('should reject transition if guard fails', async () => {
      const app = createMockApplication({ 
        stateId: 'DRAFT',
        data: { /* missing mandatory fields */ }
      });
      
      await expect(
        workflowEngine.executeTransition(app, 'SUBMIT', config)
      ).rejects.toThrow('Guard condition failed');
    });
  });
});
```

### 21.4 Integration Testing

```typescript
// Example: Application submission integration test
describe('Application Submission Flow', () => {
  let app: TestApp;
  
  beforeAll(async () => {
    app = await createTestApp();
    await app.seedTestData();
  });
  
  it('should create draft, upload docs, and submit', async () => {
    // Create draft
    const draft = await app.api
      .post('/applications')
      .send({ authorityId: 'PUDA', serviceKey: 'ndc' })
      .expect(201);
    
    // Update with data
    await app.api
      .put(`/applications/${draft.body.arn}`)
      .send({ data: validNDCData })
      .expect(200);
    
    // Upload document
    const uploadUrl = await app.api
      .post('/documents/presign')
      .send({ arn: draft.body.arn, docTypeId: 'DOC_ID_PROOF' })
      .expect(200);
    
    await uploadFile(uploadUrl.body.uploadUrl, testPdf);
    
    // Submit
    const submitted = await app.api
      .post(`/applications/${draft.body.arn}/submit`)
      .expect(200);
    
    expect(submitted.body.status).toBe('PENDING_AT_CLERK');
    expect(submitted.body.arn).toMatch(/^PUDA\/2026\/\d+$/);
  });
});
```

### 21.5 E2E Testing

```typescript
// Example: Playwright E2E test
test('Citizen can submit NDC application', async ({ page }) => {
  // Login as citizen
  await page.goto('/login');
  await page.fill('[data-testid=email]', 'citizen@test.com');
  await page.fill('[data-testid=password]', 'TestPassword123!');
  await page.click('[data-testid=login-btn]');
  
  // Navigate to new application
  await page.click('[data-testid=new-application]');
  await page.selectOption('[data-testid=authority]', 'PUDA');
  await page.selectOption('[data-testid=service]', 'no_due_certificate');
  await page.click('[data-testid=start-application]');
  
  // Fill form
  await page.fill('[data-testid=property-upn]', 'PUDA-TEST-001');
  await page.waitForSelector('[data-testid=property-details]');
  
  // Upload document
  await page.setInputFiles('[data-testid=doc-upload]', 'test-files/id-proof.pdf');
  await page.waitForSelector('[data-testid=doc-uploaded]');
  
  // Submit
  await page.click('[data-testid=submit-btn]');
  await page.waitForSelector('[data-testid=submission-success]');
  
  // Verify
  const arn = await page.textContent('[data-testid=arn]');
  expect(arn).toMatch(/^PUDA\/2026\/\d+$/);
});
```

### 21.6 BRD Validation Checklist

For each service UAT:

| Test Case | BRD Reference | Status |
|-----------|---------------|--------|
| All mandatory fields enforced | FR-01 | ☐ |
| All document types uploadable | FR-04 | ☐ |
| SLA timer starts on submission | FR-16 | ☐ |
| Correct role can process at each stage | FR-08 | ☐ |
| Wrong role cannot access task | FR-08 | ☐ |
| Query pauses SLA | FR-10 | ☐ |
| Fee calculation matches BRD | Fees section | ☐ |
| Output document has all fields | FR-11 | ☐ |
| Notification sent on key events | FR-13 | ☐ |
| Audit trail complete | FR-12 | ☐ |
| Physical verification gates approval | FR-11 | ☐ |

---

## 22. Appendices

### 22.1 Appendix A: Service Catalog

| Service Key | Service Name | Category | SLA (Days) | Fee |
|-------------|--------------|----------|------------|-----|
| `registration_of_architect` | Registration of Architect | Registration | 4 | TBD |
| `no_due_certificate` | Issue of No Due Certificate | Property | 5 | - |
| `change_of_ownership` | Change of Ownership | Property | 5 | TBD |
| `change_of_ownership_death_all_heirs` | Change of Ownership (Death - All Heirs) | Property | 30 | TBD |
| `change_of_ownership_death_will` | Change of Ownership (Death - Will) | Property | 30 | TBD |
| `permission_for_sale_transfer` | Permission for Sale/Gift/Transfer | Property | 10 | ₹10,300/₹20,600 |
| `conveyance_deed` | Issuance of Conveyance Deed | Property | 15 | TBD |
| `sanction_building_plan` | Sanction of Building Plans | Building | 7 | TBD |
| `completion_certificate_above_1000` | Completion Certificate (>1000 sq yd) | Building | 14 | TBD |
| `completion_certificate_upto_1000` | Completion Certificate (≤1000 sq yd) | Building | 14 | TBD |
| `dpc_certificate` | Issue of DPC Certificate | Building | 7 | TBD |
| `sanction_water_supply` | Sanction of Water Supply | Utility | 7 | TBD |
| `sanction_sewerage` | Sanction of Sewerage Connection | Utility | 7 | - |
| `estate_agent_registration` | Certificate of Registration as Estate Agent | Registration | TBD | ₹2,950 + BG ₹10,000 |
| `promoter_registration` | Certificate of Registration as Promoter | Registration | TBD | ₹5,900 + BG ₹50,000 |

### 22.2 Appendix B: System Role to Designation Mapping

| System Role | PUDA | GMADA | GLADA | BDA |
|-------------|------|-------|-------|-----|
| `CLERK` | UDC | Clerk | LDC | Clerk |
| `DEALING_ASSISTANT` | Dealing Assistant | DA | Assistant | DA |
| `SENIOR_ASSISTANT` | Senior Assistant | Head Clerk | SA | Head Clerk |
| `JUNIOR_ENGINEER` | JE | JE | JE | JE |
| `DRAFTSMAN` | Draftsman | CAD Operator | Draftsman | Draftsman |
| `SDO` | SDO | SDE | SDO | SDO |
| `ESTATE_OFFICER` | Estate Officer | AEO | EO | EO |
| `ACCOUNT_OFFICER` | Account Officer | AO | Accountant | AO |
| `SUPERINTENDENT` | Superintendent | Superintendent | Superintendent | Superintendent |

### 22.3 Appendix C: Common Workflows

#### Simple 3-Stage Workflow
```
DRAFT → SUBMITTED → PENDING_AT_CLERK → PENDING_AT_SR_ASSISTANT → PENDING_AT_SDO → APPROVED/REJECTED → CLOSED
```
**Used by:** DPC Certificate, Registration of Architect, Water Supply, Sewerage

#### 4-Stage Property Workflow
```
DRAFT → SUBMITTED → PENDING_AT_CLERK → PENDING_AT_SR_ASSISTANT → PENDING_AT_SUPERINTENDENT → APPROVED/REJECTED → CLOSED
```
**Used by:** Change of Ownership, Permission for Sale/Transfer

#### 5-Stage Building Workflow
```
DRAFT → SUBMITTED → PENDING_AT_CLERK → PENDING_AT_DRAFTSMAN → PENDING_AT_SR_ASSISTANT → PENDING_AT_SDO → APPROVED/REJECTED → CLOSED
```
**Used by:** Sanction of Building Plans

#### 5-Stage Completion Workflow (with Inspection)
```
DRAFT → SUBMITTED → PENDING_AT_CLERK → PENDING_AT_JE (+ Inspection) → PENDING_AT_SR_ASSISTANT → PENDING_AT_SDO → APPROVED/REJECTED → CLOSED
```
**Used by:** Completion Certificate (both types)

### 22.4 Appendix D: Glossary

| Term | Definition |
|------|------------|
| **ARN** | Application Reference Number - unique identifier for applications |
| **BRD** | Business Requirement Document |
| **CoA** | Council of Architecture - architect licensing body |
| **DD** | Demand Draft - offline payment instrument |
| **BG** | Bank Guarantee - security deposit instrument |
| **DPC** | Damp Proof Course - construction milestone certificate |
| **NDC** | No Due Certificate - clearance of financial dues |
| **OC** | Occupation Certificate - building completion approval |
| **SLA** | Service Level Agreement - processing time commitment |
| **UPN** | Unique Property Number - property identifier |
| **PUDA** | Punjab Urban Development Authority |
| **GMADA** | Greater Mohali Area Development Authority |
| **GLADA** | Greater Ludhiana Area Development Authority |
| **BDA** | Bathinda Development Authority |

### 22.5 Appendix E: Document Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Jan 2026 | - | Initial draft |
| 2.0 | Feb 2026 | - | Comprehensive revision incorporating BRD review, fee engine, inspection workflow, security architecture |

---

**End of Document**
```

