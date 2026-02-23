# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the PUDA Workflow Engine. ADRs document significant architectural decisions, the context that led to them, the options considered, and the rationale for the chosen approach.

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [001](001-declarative-service-packs.md) | Declarative Service Pack Configuration | Accepted | 2025-06-01 |
| [002](002-workflow-locking-strategy.md) | Pessimistic + Optimistic Locking for Workflow Transitions | Accepted | 2025-08-15 |
| [003](003-jwt-revocation-strategy.md) | Dual JWT Revocation (Denylist + Cutoff) | Accepted | 2025-10-01 |
| [004](004-provider-abstraction-with-stubs.md) | Provider Abstraction with Stub Safety | Accepted | 2025-07-01 |
| [005](005-tamper-evident-audit-chain.md) | Tamper-Evident SHA-256 Audit Chain | Accepted | 2025-11-01 |

## Template

When adding a new ADR, use the following template:

```markdown
# ADR-NNN: Title

**Status**: Proposed | Accepted | Deprecated | Superseded  
**Date**: YYYY-MM-DD  
**Deciders**: [names]

## Context
## Decision
## Options Considered
## Consequences
```
