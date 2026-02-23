# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in the PUDA Workflow Engine, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

1. **Email**: Send a detailed report to the project security team at the address designated by PUDA administration.
2. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Suggested fix (if any)
3. **Response time**: We aim to acknowledge reports within 48 hours and provide an initial assessment within 5 business days.

### What to Expect

- We will confirm receipt of your report.
- We will investigate and determine the severity.
- We will develop and test a fix.
- We will coordinate disclosure timing with you.
- We will credit you in the advisory (unless you prefer anonymity).

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x (current) | Yes |

## Security Measures in Place

### Authentication and Authorization

- JWT-based authentication with configurable expiration
- Per-token denylist and user-wide cutoff timestamp for revocation
- Multi-factor authentication (MFA) step-up for sensitive officer actions
- Role-based access control (RBAC) scoped by authority (PUDA, GMADA, GLADA, BDA)
- Argon2 password hashing
- OTP lockout after configurable failed attempts

### Data Protection

- Tamper-evident audit chain using SHA-256 hash linking
- PII redaction in structured logs
- Database SSL/TLS enforcement in production
- File upload validation and sandboxed storage

### Infrastructure

- Hardened HTTP security headers (CSP, HSTS, COOP, COEP) via Nginx
- Rate limiting on all API endpoints
- Runtime adapter preflight prevents stub/test providers in production
- Non-root Docker containers
- Configurable graceful shutdown with forced exit timeout

### Automated Security Scanning

- **SAST**: Semgrep (OWASP Top 10, Node.js, secrets) and CodeQL in CI
- **DAST**: OWASP ZAP baseline scans (weekly + CI smoke gate)
- **Dependency audit**: `npm audit` on every CI run
- **OpenAPI contract checks**: Verifies security schemes on protected endpoints

### Secure Configuration

All secrets and sensitive values should be provided via environment variables or a secrets manager (e.g., Google Cloud Secret Manager for Cloud Run). The `.env.example` file documents every variable and its purpose. Production-unsafe defaults (like stub providers) are blocked by the runtime adapter preflight.

## Security-Related Files

| File | Purpose |
|------|---------|
| `apps/api/src/auth.ts` | JWT authentication and password handling |
| `apps/api/src/token-security.ts` | Token revocation (denylist + cutoff) |
| `apps/api/src/mfa-stepup.ts` | MFA challenge/verify flow |
| `apps/api/src/audit-chain.ts` | Tamper-evident audit hash chain |
| `apps/api/src/middleware/` | Auth guards, rate limiting, RBAC |
| `apps/api/src/runtime-adapter-preflight.ts` | Stub provider safety checks |
| `nginx.citizen.conf` / `nginx.officer.conf` | Security headers (CSP, HSTS) |
| `.github/workflows/security.yml` | CodeQL + Semgrep CI pipeline |
| `.github/workflows/dast.yml` | OWASP ZAP DAST scans |
