# ADR-0003: Person, Account, and effective-dated affiliations

- Status: Accepted
- Date: 2026-08-02
- Owner: Identity Engineering
- Governs: #68 and people/identity schema work

## Context

The current `users` row is simultaneously a Supabase login, staff identity, parent, and policy subject; students are separate records and role membership has no validity period. Schools need People who cannot log in, one Account serving multiple schools or Tenants, multiple simultaneous roles, guardianship history, and safe deactivation.

## Decision

Separate globally authenticated Account from tenant-scoped Person. An Account Link associates an Account with one Person in a Tenant after invitation or identity proof. Person profiles express student, guardian, employee, and teacher facts without requiring login.

Use effective-dated Affiliations and Relationships. A Person may hold multiple role templates across organization, School, and class scopes. Student enrollment, guardian relationships, employment, teaching assignments, and Account Links have status, `valid_from`, optional `valid_until`, issuer, and revocation evidence. Authorization evaluates all currently valid grants; it never picks the first membership.

Keep sensitive Person attributes out of identity-provider metadata and JWTs. JWTs identify Account and assurance only; the authoritative Person and affiliation state is loaded server-side.

## Options rejected

- **One user row for login and human:** prevents non-login People and creates cross-tenant PII coupling.
- **One effective role per Account:** loses legitimate multi-role and multi-school duties.
- **A platform-global Person record by default:** links PII across customer realms without a lawful product requirement.
- **Roles embedded permanently in JWT claims:** creates stale authorization and token-size growth.

## Consequences

People workflows become independent from account provisioning. Duplicate-person resolution is tenant-scoped and audited. A single Account can switch between authorized tenant Person records without merging their data. Expiry and revocation become first-class policy inputs.

## Migration path and rollback

Create Accounts, People, links, affiliations, and relationships beside current tables. Backfill one Person per current user/student fixture, reconcile duplicates, then move reads behind a Person directory module. Existing tables remain read-only fallback until parity and isolation tests pass.
