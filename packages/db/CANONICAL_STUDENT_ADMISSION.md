# Canonical learner admission

Migration `0028_greedy_ultimates` moves the supported learner create, update, list, and detail
workflow onto the M2 identity model. A learner record is now anchored by a Tenant-scoped Person,
Student Profile, current School Enrollment, and School-scoped student Affiliation. The legacy
`students` row remains a mechanical compatibility mirror; it is no longer a product write API.

This is a narrow pre-production admission workflow, not a full applications, offers,
re-enrollment, or enrollment-transition module.

## Authority and identifiers

- `people.id` is the canonical learner identifier returned as `student.id` and `personId`.
- `student_profiles` owns the learner number and learner-specific status.
- `school_enrollments` is the forced-RLS read anchor and owns current School membership.
- `affiliations` independently represents the effective School-scoped student role.
- `students.id` is exposed only as `legacyStudentId` during the compatibility window.
- Detail reads accept either canonical Person ID or legacy Student ID so bookmarked pre-cutover
  routes remain usable; every response returns the canonical Person ID.

The model supports primary and high Schools without separate learner tables. Later School
Enrollment transition and academic-structure slices add lifecycle and placement detail to the
same records.

## Mutation boundary

The web runtime has no direct `INSERT`, `UPDATE`, or `DELETE` privilege on the legacy Student or
canonical School Enrollment tables. `createStudent` and `updateStudent` invoke two reviewed
`SECURITY DEFINER` functions in `openschool_private`.

Those functions are owned by `openschool_student_admitter`, a `NOLOGIN`, `NOINHERIT`,
`NOBYPASSRLS` role. The runtime cannot assume that role. The functions require:

1. a real `openschool_runtime` session;
2. transaction-local verified Account, Person, Tenant, request, and policy context;
3. the exact create or update capability;
4. an allowed School or learner scope under forced RLS; and
5. structurally valid canonical and compatibility identifiers.

One transaction writes Person, Student Profile, Affiliation, School Enrollment, compatibility
mirror, append-only parity evidence, Audit Ledger event, and durable audit outbox. Any constraint,
policy, parity, or audit failure rolls the entire mutation back. Failed and denied attempts are
recorded separately without creating partial learner records.

## Compatibility and cutover

Migration order is expand, backfill, compare, cut over, and later contract:

1. add School Enrollment and compatibility-evidence tables;
2. backfill missing canonical identity records and current enrollments deterministically;
3. record canonical-versus-legacy snapshots for every backfilled row;
4. cut supported reads to the forced-RLS School Enrollment anchor;
5. make the legacy representation mechanically derived through the private mutation boundary;
6. revoke raw runtime legacy writes; and
7. retain legacy IDs and append-only evidence until M2 integration explicitly retires them.

The application rollback switch is `OPENSCHOOL_STUDENT_SLICE_MODE=disabled`. Rollback disables the
workflow; it does not restore runtime legacy writes, delete canonical history, bypass RLS, or route
requests through the migration owner. Returning to a prior application release requires a
separately reviewed compatibility release or database restore because older code expects an unsafe
write authority that no longer exists.

## Acceptance evidence

`canonical:student-admission-poc` runs through the real non-owner runtime against disposable
PostgreSQL and proves:

- normalized adult-learner admission and canonical/legacy identifier compatibility;
- exact Person, Profile, Affiliation, current School Enrollment, and legacy mirror linkage;
- create/update parity evidence plus atomic Audit Ledger/outbox records;
- canonical list/detail reads and legacy-ID fallback;
- indistinguishable sibling-School and cross-Tenant denial;
- complete rollback on duplicate learner-number failure; and
- SQLSTATE `42501` for direct runtime writes to legacy Student or School Enrollment storage.

The proof is part of the automated Tenant Isolation Matrix. Passing it authorizes continued
pre-production feature development only; it does not approve real school data or production use.
