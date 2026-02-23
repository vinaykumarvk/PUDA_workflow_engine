# ADR-004: Provider Abstraction with Stub Safety

**Status**: Accepted  
**Date**: 2025-07-01  
**Deciders**: Architecture team

## Context

The application integrates with external services for payments (Razorpay), email (SMTP), and SMS delivery. During development and testing, these external dependencies create friction:
- Developers need API keys and external accounts to run the application locally.
- Tests become flaky when dependent on external service availability.
- CI environments cannot make real payment or SMS calls.

However, accidentally deploying stub/mock providers to production would be a critical failure — payments would not be processed, notifications would not be sent.

## Decision

We implement a **provider abstraction layer** with pluggable adapters and a runtime safety preflight:

### Provider Interface
Each external integration defines a TypeScript interface:

```typescript
interface PaymentGatewayAdapter {
  createOrder(amount: number, metadata: Record<string, string>): Promise<Order>;
  verifyCallback(payload: unknown, signature: string): boolean;
}
```

### Stub Adapters (default)
Stub implementations return realistic mock data without external calls. They are the default when no provider is configured:

```
PAYMENT_GATEWAY_PROVIDER=stub   # default
EMAIL_PROVIDER=stub             # default
SMS_PROVIDER=stub               # default
```

### Production Adapters
Real adapters (e.g., `RazorpayPaymentGatewayAdapter`) are selected via environment variables:

```
PAYMENT_GATEWAY_PROVIDER=razorpay
EMAIL_PROVIDER=smtp
```

### Runtime Adapter Preflight
At startup, `runtime-adapter-preflight.ts` checks the resolved provider configuration. In production (`NODE_ENV=production`), stub providers cause a **hard failure** unless explicitly overridden:

```
ALLOW_STUB_PAYMENT_PROVIDER_IN_PRODUCTION=false  # default
ALLOW_STUB_EMAIL_PROVIDER_IN_PRODUCTION=false     # default
ALLOW_STUB_SMS_PROVIDER_IN_PRODUCTION=false       # default
```

The CI pipeline runs `npm --workspace apps/api run preflight:runtime-adapters` as a quality gate.

## Options Considered

### 1. Environment-only switching (rejected)
Toggle behavior with `if (process.env.NODE_ENV === 'production')` checks scattered in code.

**Pros**: Simple.  
**Cons**: Error-prone, no single point of enforcement, hard to test, no abstraction boundary.

### 2. Feature flags for provider selection (rejected)
Use feature flags to switch between real and stub providers.

**Pros**: Runtime switchable.  
**Cons**: Overly complex for this use case. Feature flags should control product features, not infrastructure bindings.

### 3. Interface abstraction with preflight (chosen)
Clean interface boundaries, environment-driven selection, and a startup safety check.

## Consequences

**Positive:**
- Developers can run the full application locally with zero external dependencies.
- Tests are fast and deterministic (no network calls).
- Production deployments are protected by the preflight check — a misconfigured deployment fails fast at startup rather than silently dropping payments.
- Adding a new provider (e.g., PayU, Twilio) requires only implementing the interface.

**Negative:**
- Stub behavior may not perfectly match real provider behavior (edge cases in error handling, latency). Mitigated by integration tests against real providers in staging.
