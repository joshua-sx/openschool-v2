# Verified Tenant Request Context

This package implements the request identity and context boundary governed by ADR-0004. Every authenticated application request now resolves through the same fail-closed module before the existing role-template compatibility checker runs.

## Verified identity

`verifySupabaseIdentity` calls Supabase `getClaims()`. Supabase verifies asymmetric access tokens against JWKS and, for symmetric signing or unavailable WebCrypto, verifies with the Auth server before returning claims. OpenSchool accepts only non-anonymous `authenticated` tokens with a subject, session identifier, `aal1`/`aal2`, valid issue time, and future expiry.

`getSession()` remains a browser convenience export only. Middleware, auth callback, tRPC, server-rendered application layout, and context-selection routes never authorize from unverified session claims.

## Resolution contract

Tenant, Education Organization, and School identifiers from headers or HTTP-only cookies are selectors only. The resolver independently validates:

1. active Account and matching identity-provider subject;
2. active, version-current Account Session and token assurance;
3. exactly one current Account Link and active Person in the selected Tenant;
4. active Tenant;
5. current Affiliation and Role Template assignment periods;
6. active Education Organization and School records;
7. current Organization Tree ancestry and School governance;
8. guardian-to-student relationship before a parent context selects a School;
9. absence of unexplained allow expansion in legacy comparison mode.

When an Account has multiple Tenants or a Person has multiple valid organization/School contexts, no row ordering is used. Multiple active Account Links inside one Tenant are treated as invalid identity state. Guardian School contexts are derived only from current `parent_of`/`guardian_of` relationships to active students. The resolver returns `CONTEXT_REQUIRED` until the caller supplies an explicit valid selector. The server-derived context selector UI lists at most 50 options and re-runs the complete resolver before setting selector cookies.

## Bounded immutable context

The returned object contains one Account, Person, Tenant, optional selected Education Organization and School, a bounded deduplicated set of current Role Template keys, Account membership/security versions, assurance, session, policy version, request identifier, and expiry. It never contains arrays of every accessible School, class, student, or Organization.

The temporary RBAC adapter preserves the same boundary: one selected scope and every recognized current role. Resource modifiers such as assigned class or linked student fail closed unless a resource lookup supplies positive evidence. Story #85 replaces this adapter with capability Policy Decisions.

## Session and invalidation behavior

`account_sessions` records the provider session, Account, captured security version, assurance, expiry, and revocation evidence. A newly verified provider session is registered on first use. A revoked/expired row, Account mismatch, or security-version mismatch returns `SESSION_REVOKED`; a database transition guard prevents inactive sessions from being reactivated or their evidence being rewritten. Account Link changes already increment membership version atomically.

A five-second bounded cache implementation and Account/session invalidation hooks exist, and cache keys include Account, Tenant, session, membership version, security version, assurance, context-policy version, comparison mode, and selectors. The resolver does not enable the cache by default. Durable cross-node invalidation for affiliation, policy, MFA, support, and audit state must be proven in #88/#89 before production enables any cache.

## Stable denial reasons

`UNAUTHENTICATED`, `TOKEN_INVALID`, `SESSION_REVOKED`, `ACCOUNT_DISABLED`, `CONTEXT_REQUIRED`, `TENANT_DENIED`, `ORG_DENIED`, `SCHOOL_DENIED`, `SCOPE_MISMATCH`, `AFFILIATION_EXPIRED`, `MFA_REQUIRED`, and `POLICY_DENIED` are the only public reason vocabulary. Interfaces translate these into actionable language and do not expose exception details.

## Comparison and rollback

Development/pre-cutover resolution defaults to enforced comparison for migrated Accounts. New Role Template keys must be a subset of legacy roles for the same Tenant and selected School; an expansion fails with `POLICY_DENIED`. Native Accounts are marked not applicable. An observe mode exists for diagnostics but is never a production fallback.

After cutover, production uses the new resolver alone and fails closed. Rollback may restore the legacy resolver only in non-production comparison environments. Production may disable the affected feature or release, but must not return to header-trusting, first-membership authorization.

## Evidence and remaining blockers

`auth:tenant-context-poc` is guarded to a disposable loopback PostgreSQL database and cleans up its mutations so it can be repeated against the same seeded fixture. It proves multi-Tenant and multi-School explicit selection, guardian and non-guardian relationship boundaries, database prevention of ambiguous active Account Links, separate Tenant People, bounded roles, wrong-Tenant and sibling-School denial, subtree mismatch, MFA, immediate session revocation, Account disablement, immutable revocation evidence, and scope-aware legacy allow-expansion enforcement. The resolver also rejects multiple matching links defensively if an imported or corrupted dataset ever bypasses the database invariant.

This work does not make OpenSchool production-ready. Capability Policy Decisions, non-owner transaction-scoped database roles, forced RLS, atomic audit/outbox and durable invalidation, production invitation/MFA/support lifecycle, and the complete Isolation Matrix remain #85–#90.
