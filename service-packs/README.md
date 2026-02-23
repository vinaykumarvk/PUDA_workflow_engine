# Service Packs

A **service pack** is a declarative configuration bundle that defines an end-to-end government service — its application form, workflow, fees, document requirements, business rules, notification triggers, and output templates. Adding a new service type requires only configuration files; no application code changes are needed.

## Available Service Packs

| Directory | Service |
|-----------|---------|
| `no_due_certificate/` | Issue of No Due Certificate |
| `sanction_of_water_supply/` | Sanction of Water Supply Connection |
| `sanction_of_sewerage_connection/` | Sanction of Sewerage Connection |
| `registration_of_architect/` | Registration of Architect |
| `_shared/` | Shared form sections (reusable across packs) |

## Directory Structure

Each service pack follows this structure:

```
<service_key>/
├── service.yaml       # Service metadata and SLA
├── form.json          # Multi-page form definition
├── workflow.json      # State machine (states + transitions)
├── fees.json          # Fee schedule
├── documents.json     # Required document types
├── rules.json         # Business rules (conditional logic)
├── notifications.json # Notification triggers per lifecycle event
└── templates/         # HTML output templates (approval letters, etc.)
```

## File Reference

### service.yaml

Top-level service metadata.

```yaml
serviceKey: no_due_certificate          # Unique identifier (snake_case)
displayName: Issue of No Due Certificate
category: PROPERTY_SERVICES
description: Issue of No Due Certificate for property dues clearance

applicableAuthorities:                  # Which authorities offer this service
  - PUDA
  - GMADA
  - GLADA
  - BDA

sla:
  totalDays: 5
  calendarType: WORKING_DAYS
  workingCalendar: PUNJAB_GOVT

applicantTypes:
  - INDIVIDUAL

physicalDocumentRequired: false
physicalVerificationRequired: false

submissionValidation:
  propertyRequired: true               # Citizen must link a property
  enforcementMode: enforce             # "enforce" | "warn"
```

### form.json

Defines the multi-page application form rendered by the shared `FormRenderer` component.

```json
{
  "formId": "FORM_NO_DUE_CERTIFICATE",
  "version": "1.0.0",
  "pages": [
    {
      "pageId": "PAGE_APPLICATION",
      "title": "Application Details",
      "sections": [
        {
          "sectionId": "SEC_AUTHORITY",
          "title": "Authority",
          "fields": [
            {
              "key": "authority_id",
              "label": "Select Authority",
              "type": "enum",
              "required": true,
              "ui": {
                "widget": "select",
                "options": [
                  { "value": "PUDA", "label": "PUDA" }
                ]
              }
            }
          ]
        },
        {
          "sectionId": "SEC_APPLICANT",
          "title": "Applicant Details",
          "fields": [
            { "sharedSection": "applicant" }
          ]
        }
      ]
    }
  ]
}
```

**Field types**: `string`, `number`, `enum`, `date`, `boolean`, `textarea`, `file`

**Shared sections**: Use `{ "sharedSection": "applicant" }` to reference reusable field groups from `_shared/applicant.section.json`.

### workflow.json

Defines the application lifecycle as a finite state machine.

```json
{
  "workflowId": "WF_NO_DUE_CERTIFICATE",
  "version": "1.0.0",
  "states": [
    { "stateId": "DRAFT", "type": "DRAFT", "taskRequired": false },
    { "stateId": "PENDING_AT_CLERK", "type": "TASK", "taskRequired": true, "systemRoleId": "CLERK", "slaDays": 1 },
    { "stateId": "APPROVED", "type": "SYSTEM", "taskRequired": false },
    { "stateId": "CLOSED", "type": "END", "taskRequired": false }
  ],
  "transitions": [
    {
      "transitionId": "SUBMIT",
      "fromStateId": "DRAFT",
      "toStateId": "SUBMITTED",
      "trigger": "manual",
      "allowedActorTypes": ["CITIZEN"]
    },
    {
      "transitionId": "CLERK_FORWARD",
      "fromStateId": "PENDING_AT_CLERK",
      "toStateId": "PENDING_AT_SR_ASSISTANT_ACCOUNTS",
      "trigger": "manual",
      "allowedSystemRoleIds": ["CLERK"],
      "actions": ["ASSIGN_NEXT_TASK"]
    }
  ]
}
```

**State types**: `DRAFT` (initial), `SYSTEM` (auto-transition), `TASK` (requires officer action), `QUERY` (awaiting citizen response), `END` (terminal).

**Triggers**: `manual` (user action) or `system` (automatic).

**Actions**: `ASSIGN_NEXT_TASK`, `RAISE_QUERY`, `RECORD_DECISION`, `GENERATE_OUTPUT_*`.

### fees.json

Fee schedule with optional authority/property-type overrides.

```json
{
  "default": [
    {
      "feeType": "NDC_PROCESSING_FEE",
      "amount": 250,
      "description": "No Due Certificate processing fee"
    }
  ]
}
```

### documents.json

Required and conditional document uploads.

```json
{
  "documentTypes": [
    {
      "docTypeId": "DOC_PAYMENT_RECEIPT",
      "name": "Payment receipt",
      "mandatory": false,
      "requiredWhenRuleId": "RECEIPT_REQUIRED_WHEN_PAYMENT_NOT_UPDATED",
      "allowedMimeTypes": ["application/pdf", "image/jpeg", "image/png"],
      "maxSizeMB": 10
    }
  ]
}
```

Conditional documents reference a rule in `rules.json` via `requiredWhenRuleId`.

### rules.json

Business rules evaluated at runtime using JSON Logic syntax.

```json
{
  "rules": [
    {
      "ruleId": "RECEIPT_REQUIRED_WHEN_PAYMENT_NOT_UPDATED",
      "description": "Require receipt upload when payment not updated",
      "logic": {
        "==": [{ "var": "data.payment_details_updated" }, false]
      }
    }
  ]
}
```

### notifications.json

Notification triggers mapped to lifecycle events.

```json
{
  "events": [
    {
      "event": "APPLICATION_SUBMITTED",
      "channels": ["sms", "email", "in_app"],
      "recipients": ["applicant"]
    }
  ]
}
```

### templates/

HTML templates for generated output documents (approval letters, rejection notices, certificates). These are rendered by PDFKit at the output-generation stage.

## Creating a New Service Pack

1. **Create a directory** under `service-packs/` with a `snake_case` name matching the service key:

   ```bash
   mkdir service-packs/your_new_service
   ```

2. **Create `service.yaml`** with the service metadata, SLA, and applicable authorities.

3. **Create `form.json`** defining the application form pages, sections, and fields. Reuse shared sections from `_shared/` where possible.

4. **Create `workflow.json`** with states (DRAFT → processing stages → APPROVED/REJECTED → CLOSED) and transitions. Ensure every state is reachable and every terminal state has an outgoing system transition to CLOSED.

5. **Create `fees.json`** with the fee schedule.

6. **Create `documents.json`** listing required and conditional document types.

7. **Create `rules.json`** for any conditional business logic.

8. **Create `notifications.json`** mapping lifecycle events to notification channels.

9. **Add output templates** in `templates/` if the service produces approval letters or certificates.

10. **Run the preflight check**:

    ```bash
    npm --workspace apps/api run preflight:service-packs
    ```

11. **Seed a service version** by running the seed script or adding an entry to the `service_versions` table.

12. **Restart the API** — service packs are loaded at startup.
