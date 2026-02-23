# ADR-002: Pessimistic + Optimistic Locking for Workflow Transitions

**Status**: Accepted  
**Date**: 2025-08-15  
**Deciders**: Architecture team, Backend lead

## Context

The workflow engine processes state transitions on applications. Multiple officers may attempt to act on the same application concurrently (e.g., two clerks both trying to claim and forward an application). Additionally, citizens may update their application data while an officer is reviewing it.

Without proper concurrency control:
- Two officers could both claim the same task, leading to duplicate processing.
- A state transition could execute on stale data, violating workflow invariants.
- Lost updates could silently corrupt application state.

## Decision

We use a **dual locking strategy**:

### Pessimistic Locking (workflow transitions)
All workflow state transitions execute within a database transaction that acquires `SELECT ... FOR UPDATE` on the application row. A `lock_timeout` of 5 seconds prevents indefinite blocking:

```sql
SET LOCAL lock_timeout = '5s';
SELECT * FROM applications WHERE id = $1 FOR UPDATE;
```

If the lock cannot be acquired within 5 seconds, the transaction fails with a clear error, and the officer can retry.

### Optimistic Concurrency (application data updates)
Every `applications` row has a `row_version` column (integer, incremented on each write). Update queries include a `WHERE row_version = $expected` condition:

```sql
UPDATE applications SET ..., row_version = row_version + 1
WHERE id = $1 AND row_version = $2;
```

If the version has changed (another concurrent write occurred), the update returns zero rows and the API returns a `409 Conflict`, prompting the client to refresh and retry.

## Options Considered

### 1. Optimistic-only (rejected for transitions)
Use `row_version` for everything, including state transitions.

**Pros**: No lock contention, simpler SQL.  
**Cons**: High retry rate under concurrent officer activity on popular tasks. State transitions are not idempotent — a retry after partial side effects (notifications, task creation) could cause inconsistencies.

### 2. Pessimistic-only (rejected for data updates)
Use `FOR UPDATE` for all writes.

**Pros**: Strong consistency.  
**Cons**: Excessive locking for simple data updates (citizen editing their draft). Higher contention and potential for deadlocks on complex operations.

### 3. Dual strategy (chosen)
Pessimistic for state transitions (high-integrity, side-effect-producing operations), optimistic for data updates (low-contention, idempotent operations).

## Consequences

**Positive:**
- State transitions are strictly serialized per application — no double-processing.
- The 5-second lock timeout prevents deadlocks from becoming indefinite hangs.
- Data updates are non-blocking for the common case (citizen editing their own draft).
- `409 Conflict` responses give the frontend a clear signal to refresh.

**Negative:**
- Officers may occasionally see a "task already claimed" error under high concurrency (acceptable — retry is fast).
- The dual approach requires developers to understand which strategy applies in each context.
