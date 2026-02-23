# ADR-005: Tamper-Evident SHA-256 Audit Chain

**Status**: Accepted  
**Date**: 2025-11-01  
**Deciders**: Architecture team, Compliance lead

## Context

Government workflows require a complete, trustworthy audit trail. Every action on an application (submission, officer decision, status change, document upload, payment, query, notification) must be recorded and must be provably untampered with.

Requirements:
- Immutable record of all state-changing events.
- Ability to detect if any audit entry has been modified, deleted, or reordered after the fact.
- Compliance with government record-keeping standards.
- Verifiable by an independent audit process.

## Decision

We implement a **hash-chained audit log** where each audit event includes a SHA-256 hash computed over the event payload and the previous event's hash, forming a linked chain:

```
hash[n] = SHA-256(event_data[n] || hash[n-1])
```

### Schema

The `audit_event` table includes:
- `id` — sequential primary key
- `application_id`, `actor_id`, `event_type`, `event_data` — the audit payload
- `prev_hash` — hash of the previous event in the chain
- `event_hash` — SHA-256 of (event payload + prev_hash)
- `created_at` — immutable timestamp

### Write Path

A database trigger computes `event_hash` on INSERT, chaining it to the previous event's hash. The application code never sets the hash directly.

### Verification

A verification job (configurable via `ENABLE_AUDIT_CHAIN_VERIFICATION_JOB`) periodically re-computes hashes sequentially and compares them. Any mismatch indicates tampering:

```bash
npm --workspace apps/api run audit:verify-chain
```

## Options Considered

### 1. Append-only table with no integrity checks (rejected)
Rely on database access controls and backups for audit integrity.

**Pros**: Simple.  
**Cons**: No way to detect tampering by a privileged database user or during a breach. Does not meet compliance requirements for provable integrity.

### 2. Blockchain/distributed ledger (rejected)
Store audit events on a blockchain for cryptographic immutability.

**Pros**: Strongest tamper resistance.  
**Cons**: Massive overengineering for this use case. High latency, operational complexity, and cost. A single-authority government system does not benefit from distributed consensus.

### 3. SHA-256 hash chain in PostgreSQL (chosen)
Application-level hash linking within the existing database.

**Pros**: Detects tampering (modification, deletion, reordering). Lightweight — no additional infrastructure. Verifiable offline. Existing PostgreSQL operations. Compatible with standard backup/restore.  
**Cons**: Does not prevent tampering by someone with direct database write access (they could recompute the chain). Mitigated by: (a) limiting direct DB access, (b) periodic external hash snapshots, (c) independent verification jobs.

### 4. Merkle tree (considered, deferred)
Group events into Merkle trees for batch verification.

**Pros**: Faster partial verification.  
**Cons**: More complex implementation. Sequential hash chain is sufficient for current event volumes. Can be layered on later if needed.

## Consequences

**Positive:**
- Any modification to an audit event breaks the hash chain and is immediately detectable.
- Deletion of an event is detected (gap in chain).
- Reordering of events is detected (hash mismatch).
- The verification job provides continuous integrity monitoring.
- Audit trail meets government compliance requirements for provable integrity.

**Negative:**
- Sequential hash computation means audit events must be serialized per application (no parallel inserts for the same chain). Handled by the database trigger with linearized insert ordering.
- Chain verification is O(n) in the number of events. For large audit logs, periodic checkpointing may be needed in the future.
- A sufficiently privileged attacker could recompute the entire chain. Mitigated by external hash snapshots and restricted database access.
