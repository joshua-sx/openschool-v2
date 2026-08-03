# Canonical academic structure

Migration `0029_overconfident_iron_lad` establishes School-scoped Academic Years, ordered Terms,
and ordered Learner Levels as the canonical instructional structure. The same aggregate supports a
primary School, a high School, and an all-through School through local labels and configuration;
there is no school-type branch in the schema or authorization policy.

This slice does not implement periods, courses, sections, timetables, events, grading periods, or
enrollment placement. Those modules consume this structure later.

## Authority and lifecycle

- `academic_years` owns stable code/name, School time zone, inclusive local dates, and lifecycle.
- `academic_terms` owns the chronological instructional divisions inside one Academic Year.
- `learner_levels` owns School-local codes, labels, order, and optional education-stage metadata.
- `academic_compatibility_evidence` retains legacy School, Term, and Class labels during migration.
- `draft` structures can be reviewed and published; `published` structures can only be closed;
  `closed` structures remain immutable history.
- “Current” is derived when a published Academic Year's local School date falls inside its date
  range. It is not a mutable flag.

Published and closed date ranges cannot overlap within a School. PostgreSQL exclusion constraints
and an advisory publication lock enforce that invariant under concurrent requests. Term ranges
must be contained within their Academic Year, must be ordered, and cannot overlap. Codes and
ordinals are unique inside their aggregate.

## Migration evidence

The legacy `schools.academic_year`, `schools.terms`, and `classes.academic_year` fields do not
contain authoritative Academic Year boundaries. Migration records each value as append-only
unmapped evidence and creates no canonical Academic Year from it. Administrators must review the
legacy labels and explicitly enter authoritative dates, Terms, and Learner Levels. This avoids
silently turning an inferred earliest/last Term date into operational authority.

New representative seed data includes published primary, high, and all-through structures. The
upgrade fixture proves that every legacy label is retained while the canonical table remains empty
until an authorized administrator makes the date decision.

## Mutation authority

The web runtime has `SELECT` only on the four academic tables. Create, migration-review approval,
publish, and close operations call narrow `SECURITY DEFINER` functions in `openschool_private`.
Those functions are owned by `openschool_academic_configurator`, a `NOLOGIN`, `NOINHERIT`,
`NOBYPASSRLS` role that the runtime cannot assume.

Every private operation requires:

1. a real `openschool_runtime` session;
2. transaction-local verified Account, Person, Tenant, request, assurance, and policy context;
3. the exact `tenant.academic_structure.manage` capability;
4. an allowed active School under forced RLS; and
5. a valid lifecycle transition and complete aggregate.

The application transaction writes the structure change, Audit Event, and durable audit outbox as
one unit. Audit failure rolls back the entire mutation. Denied and failed attempts are recorded
separately. `org_admin` and `school_admin` can manage within their explicit scopes and must satisfy
MFA; `org_viewer` has read-only visibility within its Organization subtree.

## Acceptance evidence

`academic:structure-poc` runs through the real non-owner runtime on disposable PostgreSQL and
proves:

- the same schema and service represent primary Terms/Grades and high-School Semesters/Forms;
- local-time current-year derivation returns exactly one published year for the proof date;
- sibling-School and cross-Tenant identifiers fail with an indistinguishable denial;
- overlapping publication fails and two concurrent overlapping publications cannot both win;
- closed structure and child records remain immutable;
- direct runtime insert/update receives SQLSTATE `42501`;
- successful mutations have atomic Audit Ledger and outbox evidence; and
- the Tenant/School-leading Academic Year list index appears in the analyzed query plan.

The proof joins the automated Tenant Isolation Matrix. Passing it authorizes continued
pre-production development only and does not approve real school data or production use.
