# ADR-003: Dual JWT Revocation (Denylist + Cutoff)

**Status**: Accepted  
**Date**: 2025-10-01  
**Deciders**: Architecture team, Security lead

## Context

JWT tokens are stateless by design — once issued, they are valid until expiry. This creates challenges for:
- **Logout**: Users expect that clicking "logout" immediately invalidates their session.
- **Incident response**: Admins need to force-logout compromised accounts instantly.
- **Password changes**: All prior sessions should be invalidated when a user changes their password.

We needed a revocation mechanism that handles both individual token revocation (logout) and bulk revocation (force-logout-all) without abandoning JWTs entirely.

## Decision

We implement **two complementary revocation mechanisms**:

### 1. Per-Token Denylist
Each JWT includes a unique `jti` (JWT ID) claim. On logout, the `jti` is added to a `jwt_denylist` database table with the token's expiration time. The auth middleware checks the denylist on every request.

```
POST /api/v1/auth/logout → adds jti to denylist
```

A background job periodically cleans up expired entries (configurable via `JWT_DENYLIST_CLEANUP_INTERVAL_MS`).

### 2. User-Wide Cutoff Timestamp
Each user record has a `jwt_cutoff_at` timestamp. When set, any JWT issued before this timestamp is rejected — regardless of whether it appears in the denylist. This enables bulk revocation:

```
POST /api/v1/auth/logout-all → sets jwt_cutoff_at = NOW()
POST /api/v1/admin/users/:userId/force-logout → sets jwt_cutoff_at = NOW()
```

The auth middleware checks: `token.iat >= user.jwt_cutoff_at` (if cutoff is set).

## Options Considered

### 1. Short-lived tokens + refresh tokens (rejected)
Issue very short-lived access tokens (5 min) with a longer-lived refresh token.

**Pros**: Limits exposure window.  
**Cons**: Does not provide instant revocation. A compromised token is still valid for its lifetime. Adds complexity with refresh flow. Government workflows may have long idle periods between actions.

### 2. Denylist-only (rejected)
Store every revoked `jti` in a database table.

**Pros**: Simple per-token revocation.  
**Cons**: Force-logout-all requires enumerating and inserting every active token — expensive and incomplete if tokens are not tracked. Denylist table grows linearly with logout frequency.

### 3. Cutoff-only (rejected)
Only use the user-wide cutoff timestamp.

**Pros**: Efficient bulk revocation.  
**Cons**: Cannot revoke a single token without invalidating all sessions. Logging out on one device logs out all devices.

### 4. Dual approach (chosen)
Denylist for single-token revocation, cutoff for bulk revocation.

## Consequences

**Positive:**
- Single logout is instant and surgical (denylist).
- Bulk revocation is instant and O(1) (cutoff timestamp update).
- Admin force-logout works for incident response without enumerating tokens.
- Background cleanup keeps the denylist table bounded.

**Negative:**
- Every authenticated request requires one additional DB lookup (denylist check). Mitigated by indexing on `jti` and the cleanup job keeping the table small.
- Requires `jti` claim enforcement (`JWT_ENFORCE_JTI=true` in production).
