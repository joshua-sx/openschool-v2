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

## Migration path and rollback

Disable production open sign-up before onboarding real users. Add invitation and session-version records, migrate existing development Accounts as explicitly accepted fixtures, then enforce MFA by privilege tier. Rollback can pause new invitations but must preserve revocations and audit evidence.
