# ADR-0008: Invitations, MFA, support access, and session lifecycle

- Status: Accepted
- Date: 2026-08-02
- Owner: Identity Engineering
- Governs: #68 and privileged identity operations

## Context

The prototype allows open sign-up and infers roles from database rows. Production schools need controlled onboarding, verified relationship claims, strong privileged authentication, rapid revocation, and support workflows that do not create invisible platform superusers.

## Decision

Tenant access begins with a scoped Invitation issued by an authorized Policy Decision. Store only a hashed single-use token with Tenant, intended identity, proposed Person/Affiliation, issuer, expiry, status, and acceptance evidence. Acceptance verifies email or configured enterprise identity, prevents Account confusion, links or creates the Person, and activates only the approved effective-dated Affiliations.

Require MFA for platform operators, organization administrators, school administrators, finance, safeguarding, exports, policy administration, support, and break-glass actions. Policy Decisions may require recent reauthentication or a stronger assurance level.

Sessions carry a server-side session identifier and membership/security version. Password reset, Account disablement, affiliation revocation, Tenant suspension, MFA reset, and support-grant expiry invalidate affected sessions. Verified identity claims are refreshed; roles and capabilities are never trusted from stale JWT metadata.

Platform operators have control-plane capabilities only. Support Access requires a ticket, tenant approval or documented emergency rule, narrow scope, purpose, start/end, MFA, visible indicator, tenant notification, and audit review. Break-glass credentials are separately held, short-lived, monitored, and followed by mandatory incident review.

## Options rejected

- **Open production sign-up:** does not prove school relationship or authority.
- **Invite grants permanent role immediately:** acceptance and expiry cannot be controlled.
- **Global support super-admin:** creates an invisible cross-tenant disclosure path.
- **MFA optional for administrators:** account takeover impact is too high.
- **Wait for access tokens to expire after revocation:** leaves a predictable stale-access window.

## Consequences

Onboarding is a state machine rather than an auth callback side effect. Schools can delegate invitations without platform access. Support operations become slower but explainable and reviewable. Customer SSO can become another identity adapter at the Account seam.

The invitation slice is implemented by migration 0016, the invitation services/router, a durable encrypted delivery adapter, the acceptance page, and the guarded PostgreSQL proof. Its private function is owned by a dedicated `NOLOGIN`, `NOBYPASSRLS` role so forced RLS does not depend on a superuser migration owner. Known-invitation denials are redacted Tenant audit events; invalid random tokens remain aggregate security telemetry because no Tenant can be derived safely.

Platform Tenant suspension is implemented by migration 0023, a global maximum-90-day access-grant store, a distinct no-table-access control-plane login, separate `NOLOGIN` access, admission, and lifecycle owners, a Person-free platform Policy Context, and an atomic Tenant/audit/invalidation transaction. Runtime and worker transactions call a fixed private admission function that locks and returns only the Tenant status, so they need no Tenant update authority; a suspension waits for admitted work and denies every later transaction. This authority does not provide support access to Tenant records.

Provider MFA reset is implemented by migrations 0024–0025. The identity mutation, Audit/invalidation evidence, and a provider-security reconciliation row commit atomically. A forced-RLS queue holds no provider subject or factor identifier; a separately owned resolver releases the immutable provider identity only to an actively leased worker row. Failed work retries with bounded backoff and dead-letter evidence. Identity bootstrap uses another narrow resolver to deny new Account Sessions until the latest reset completes, closing the provider-outage login window without granting runtime queue access.

Tenant-approved support and break glass are implemented by migration 0026. Support remains Person-free and cannot inherit Tenant roles. A dedicated resolver intersects the current support Account, AAL2 Account Session, platform role, Tenant status, short-lived grant, allowed read capability, and exact scope on every operation; first use binds the grant to one Account Session. Tenant administrators approve, revoke, review, and see durable notifications. Break glass uses a separate platform role and control-plane entry point, incident purpose, emergency-rule reference, and 30-minute maximum. Close, revoke, expiry, Account/session changes, platform-role changes, and Tenant suspension deny the next operation. External notification delivery remains an injected worker adapter so deployment can select an approved provider without placing its credentials or delivery semantics in the access boundary.

## Migration path and rollback

Disable production open sign-up before onboarding real users. Add invitation and session-version records, migrate existing development Accounts as explicitly accepted fixtures, then enforce MFA by privilege tier. Rollback can pause new invitations but must preserve revocations and audit evidence.

Operational configuration, delivery, key rotation, incident response, and rollback are defined in [Invitation-only account onboarding](../security/INVITATION_ONBOARDING.md), [Privileged MFA and identity revocation](../security/IDENTITY_REVOCATION.md), and [Tenant-approved support and break-glass access](../security/SUPPORT_ACCESS.md). Implementation does not satisfy the production-provider, scheduler, monitoring, incident-rehearsal, or jurisdiction-specific approval gates.
