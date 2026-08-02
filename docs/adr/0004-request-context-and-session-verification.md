# ADR-0004: Tenant Request Context and session verification

- Status: Accepted
- Date: 2026-08-02
- Owner: Identity Engineering
- Governs: #68 and every authenticated request path

## Context

The current request path trusts `getSession()`, accepts organization and School headers, guesses a role from the first membership, and can return unauthorized active identifiers. Cookie/session contents and selectors are not authoritative authorization state.

## Decision

Create one deep Request Context module. Its interface accepts a cryptographically verified Account identity, untrusted Tenant/organization/School selectors, request metadata, and required assurance. Its implementation validates active Account Link, affiliation dates, membership version, Organization Tree relationship, School status, session revocation, and MFA assurance, then returns an immutable Tenant Request Context or a typed denial reason.

Verify Supabase access tokens with `getClaims()` when asymmetric signing keys are configured; fall back to `getUser()` when server verification is required. Do not authorize from `getSession()` data alone. Client headers/cookies select context only. When more than one context is possible and none is selected, return `CONTEXT_REQUIRED`; never choose the first membership.

Context is resolved for every request. A short cache is allowed only when keyed by Account, Tenant, membership version, and policy version, with immediate revocation invalidation. Database context is derived from this object inside the transaction wrapper.

## Stable denial reasons

`UNAUTHENTICATED`, `TOKEN_INVALID`, `SESSION_REVOKED`, `ACCOUNT_DISABLED`, `CONTEXT_REQUIRED`, `TENANT_DENIED`, `ORG_DENIED`, `SCHOOL_DENIED`, `SCOPE_MISMATCH`, `AFFILIATION_EXPIRED`, `MFA_REQUIRED`, and `POLICY_DENIED`.

## Options rejected

- **Trust session cookie claims:** can be stale and is not sufficient server verification.
- **Trust role/context headers:** creates a confused-deputy path.
- **Load all accessible identifiers into every context:** grows without bound and becomes stale.
- **Default to first membership:** makes order-dependent authorization decisions.

## Consequences

Callers learn one interface and one error model; verification and context locality improve. Some requests require an explicit context-selection response. Session and membership changes can revoke access predictably.

## Migration path and rollback

Introduce the resolver behind tRPC context, initially compare its result with the legacy resolver in development, then fail closed on disagreement. Rollback can restore legacy reads only in non-production environments because the current resolver is not an acceptable production security control.
