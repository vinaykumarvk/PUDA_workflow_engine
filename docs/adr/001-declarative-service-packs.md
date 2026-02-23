# ADR-001: Declarative Service Pack Configuration

**Status**: Accepted  
**Date**: 2025-06-01  
**Deciders**: Architecture team

## Context

PUDA administers multiple service types (building permission, no-due certificate, water supply, sewerage connection, architect registration, etc.) across multiple authorities (PUDA, GMADA, GLADA, BDA). Each service has a unique application form, workflow sequence, fee schedule, document requirements, business rules, and notification triggers.

We needed an approach that allows new services to be added without code changes, minimizes developer effort, and enables domain experts (non-developers) to review and validate service configurations.

## Decision

Each service type is defined by a **service pack** — a directory containing YAML and JSON configuration files:

- `service.yaml` — metadata, SLA, applicable authorities
- `form.json` — multi-page form definition (pages, sections, fields)
- `workflow.json` — finite state machine (states, transitions, roles, actions)
- `fees.json` — fee schedule with optional overrides
- `documents.json` — required and conditional document types
- `rules.json` — business rules in JSON Logic format
- `notifications.json` — event-to-channel mappings
- `templates/` — HTML output templates

The API loads all service packs at startup and validates them against the master data model. A shared `FormRenderer` component on the frontend reads `form.json` at runtime to render the correct form.

## Options Considered

### 1. Code-per-service (rejected)
Each service type would have its own route handlers, form components, and workflow logic in code.

**Pros**: Maximum flexibility.  
**Cons**: High duplication, requires developer for every new service, high testing burden, no separation of concerns between config and code.

### 2. Database-driven configuration (deferred)
Store service configurations in database tables with an admin UI.

**Pros**: Runtime-editable without deployments.  
**Cons**: More complex to implement initially, harder to version-control, migration complexity, audit challenges.

### 3. Declarative file-based configuration (chosen)
YAML/JSON files checked into the repository alongside the code.

**Pros**: Version-controlled, reviewable in PRs, validatable at build time, no code changes for new services, domain experts can review YAML/JSON.  
**Cons**: Requires deployment to update, no runtime editing.

## Consequences

**Positive:**
- Adding a new service is a config-only task (typically a few hours, not days).
- Service configurations are version-controlled and subject to PR review.
- The `preflight:service-packs` script validates all packs at build time.
- Shared `FormRenderer` eliminates per-service frontend code.

**Negative:**
- Configuration changes require a deployment (acceptable trade-off for correctness guarantees).
- Complex conditional logic in JSON Logic can be hard to debug.

**Future consideration:** A database-driven approach with an admin UI could be layered on top for runtime configuration changes (ADR pending).
