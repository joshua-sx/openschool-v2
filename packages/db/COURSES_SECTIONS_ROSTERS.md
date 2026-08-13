# Courses, Sections, and rosters operating contract

This contract defines the #117 academic roster slice. It remains pre-production and does not
authorize real school data.

## One model for primary and high Schools

- A Course is a School-local catalog item. It may represent a subject, elective, support program,
  or general curriculum and may carry optional credit metadata.
- A Section is an effective delivery group within one published Academic Year, an optional Term,
  an optional Learner Level, and an optional Course. Course Sections require a Course; homerooms do
  not. This is the only modeling difference required between primary and high Schools.
- Staff Assignments and Roster Memberships are effective-dated facts. Ending or closing them
  preserves history; ordinary product workflows never delete them.
- Capacity is advisory. The mutation succeeds and returns `capacityExceeded` so administrators can
  resolve legitimate exceptions without weakening the roster authority.

## Authorization and execution

`tenant.sections.read` supports Organization-subtree, School, assigned-class, self, and
linked-student constraints. `tenant.sections.manage` is limited to AAL2 Organization and School
administrators. Teachers receive class scope only from a current canonical Staff Assignment.
Guardians can see only linked learner membership rows; they cannot enumerate the Section roster.

All five tables force RLS. Runtime writes are revoked. A `NOLOGIN`, `NOINHERIT`, `NOBYPASSRLS`
scope resolver owns only read-scope functions, and a separate Section manager owns guarded
mutation functions. Execution roles cannot assume either role. The database validates School,
Academic Year, Term, Learner Level, Course, enrollment, staff eligibility, effective periods, and
non-overlap.

## Compatibility and rollback

Legacy `classes`, `enrollments`, and teacher mappings remain readable until #121. Migration 0035
records every legacy Class and roster count/hash without inventing Academic Year dates. Unmapped
Classes stay on the legacy read path. Native Sections are authoritative only for the new
`tenant.sections.*` capabilities; rollback selects policy v7 and hides the new workflow without
deleting canonical history or audit evidence.

## Verification boundary

`sections:poc` runs through the real non-owner runtime on disposable loopback PostgreSQL. It creates
a high-School Course Section, assigns a teacher, rosters an enrolled learner, proves that future
teacher scope stays inactive until its effective date, sibling-School and cross-Tenant denial,
direct-write denial, closure history, and cleanup. The same schema supports primary homerooms; the
M2 integration story remains responsible for joined portal and legacy-retirement proof.
