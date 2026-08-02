# Account, Person, and affiliation foundation

This package implements the additive identity-record foundation governed by ADR-0003 and ADR-0008. It does not yet establish a trusted request context, capability authorization, forced RLS, production invitations, MFA, or the final audit/outbox. Those controls remain blocking work in #84 through #90.

## Domain and privacy boundaries

- `accounts` is the global authenticated principal. It stores identity-provider, session-version, and Account status fields, but no school role.
- `people` is a human record inside exactly one Tenant. Names, dates of birth, school contact details, and profiles never become a platform-global Person record by default.
- `account_links` is the effective-dated, revocable association from an Account to one Person in one Tenant.
- `student_profiles`, `guardian_profiles`, `employee_profiles`, and `teacher_profiles` attach domain facts to People. None requires an Account.
- `affiliations` assigns a Person to a Tenant, Education Organization, School, or class scope. `role_template_assignments` names the role template carried by that affiliation.
- `person_relationships` records tenant-contained guardian, parent, emergency-contact, and family relationships.
- `person_merge_evidence` records an explicit, human-reviewable duplicate proposal. Candidate matching never merges People automatically.

One Account can link to separate People in separate Tenants. Those People have different identifiers and tenant-scoped foreign keys; a Tenant-scoped directory query cannot discover the other Person. This supports shared staff and guardians without creating a cross-customer PII directory.

## Authorization input contract

An Account Link, Affiliation, Role Template assignment, or Relationship is current only when all of the following are true at evaluation time:

1. `status = 'active'`;
2. `valid_from <= evaluation_time`;
3. `valid_until IS NULL OR evaluation_time < valid_until`.

Periods are half-open: `[valid_from, valid_until)`. Pending, future, expired, suspended, and revoked rows never authorize. Authorization must evaluate every current affiliation and assignment in the selected Tenant; it must not choose the first row. Story #84 will load these authoritative records into Tenant Request Context, and #85 will convert them into Policy Decisions.

PostgreSQL exclusion constraints reject overlapping active Account Links and duplicate effective assignments for the same identity/scope. Tenant and identity anchor columns are immutable. A grant is ended and replaced instead of being repointed. `identity_migration_events` is append-only and validates that its Account, Person, Tenant, and link agree.

## Atomic Account Link lifecycle

`activateAccountLink` and `revokeAccountLink` each run one database transaction that:

1. locks the Account Link and Account;
2. validates the lifecycle transition;
3. changes the Account Link;
4. increments `accounts.membership_version`;
5. inserts the matching append-only identity migration event.

Any failure rolls back all five effects. The interim event is deliberately narrow; #88 replaces it with the complete atomic audit/outbox contract without deleting this migration evidence.

## Staged migration

- `0009` creates Accounts, tenant-scoped People, Account Links, profiles, affiliations, role assignments, relationships, merge evidence, and interim events beside the legacy model.
- `0010` locks the relevant legacy tables, imports one Account per legacy user, creates one Person per `(tenant_id, user_id)` and one per legacy student, imports profiles and effective records, emits backfill events, and aborts if parity or Tenant checks fail.
- `0011` adds non-overlap constraints, immutable identity anchors, Account-Link/event consistency, and append-only event enforcement.

The backfill intentionally creates separate People when one legacy user belongs to multiple Tenants. It does not infer that same-name or same-email student and user rows are the same Person.

## Dual-read, comparison, and rollback

Legacy `users`, `students`, `users_on_org`, `users_on_school`, `teachers_on_class`, and `parent_student` rows are retained unchanged. No application read is cut over in this story. The upgrade CI job compares:

- legacy users to Accounts and distinct linked legacy-user People;
- legacy students to student People and profiles;
- membership/relationship row counts to Affiliations, Role Template assignments, and Relationships;
- Account Links to backfill events;
- student profiles to Account Links, proving login is optional;
- every Account Link Person reference to its Tenant.

Cutover is allowed only after the comparison remains green for the intended environment and #84 provides verified Tenant Request Context. During the comparison window, callers may keep using the legacy read path while the Person directory is exercised in shadow mode.

Rollback switches the read feature flag back to the unchanged legacy path. It does **not** drop new tables, delete migration events, decrement membership versions, or merge People. New rows remain reconciliation evidence for a corrected forward migration. Because this story performs no destructive legacy rewrite, no down migration is required for application rollback.

## Evidence and limitations

`db:identity-foundation-poc` is guarded to a disposable loopback PostgreSQL database. It proves cross-Tenant Account/Person separation, multi-School roles, non-login student profiles, non-authorizing invalid periods/statuses, atomic activation/revocation and rollback, membership-version changes, duplicate review, temporal exclusions, immutable keys, and append-only events.

The Person directory normalizes names and emails for tenant-scoped candidate discovery. These values are hints, not identity proof. Production merge approval, retention, lawful-basis, safeguarding, and correction workflows require product, privacy, and legal decisions outside this schema.
