# Learner School-enrollment lifecycle

Migration `0030_milky_lord_tyger` establishes the supported School-enrollment transition boundary.
Migration `0031_curved_rumiko_fujikawa` hardens that boundary with transition-specific event
shapes, same-Person and same-School enrollment references, native hierarchy-version evidence, and
a lifecycle-only enrollment update policy.
It builds on canonical learner admission without treating School placement as a mutable field on a
Student row.

## Period and event model

- `school_enrollments` stores effective-dated, half-open `[valid_from, valid_until)` periods.
- A learner may have at most one overlapping primary period. Explicit secondary periods may run
  concurrently.
- An open period is closed once with a reason, evidence reference, actor, operation time, and
  incremented version. Closed periods reject every update and delete.
- `school_enrollment_transition_events` records immutable `scheduled`, `applied`, and `cancelled`
  events under one stable transition ID.
- Transfers create a new period linked through `supersedes_enrollment_id`; re-enrollment starts a
  new period without reopening or rewriting prior history.
- Native enrollment periods always record the Organization Tree version effective at admission;
  legacy backfill rows remain explicitly distinguishable.
- A terminal primary transition keeps the learner active while another current School enrollment
  remains, so concurrent secondary Schools retain an operational learner record.
- A cross-Tenant identifier is never imported, moved, or disclosed by this workflow. Cross-Tenant
  transfer remains a future governed export/import process.

## Supported transitions

| Transition | Source | Result |
| --- | --- | --- |
| withdraw | current primary period | closes the selected period and updates learner compatibility status |
| transfer | current primary period | atomically closes the source and starts a primary period at another authorized School in the same Tenant |
| graduate | current primary period | closes the period and records graduated learner status |
| re-enroll | no primary period at the effective instant | starts a new primary period without reopening history |
| add secondary | learner and destination School | starts a concurrent secondary period |
| end secondary | current secondary period | closes only that secondary period |

Administrators may apply a transition immediately or schedule it for a future instant. Future
transitions remain commands only until an authorized administrator applies them at or after the
effective time. This release intentionally does not introduce an unattended transition worker;
that worker requires its own queue identity, retry, notification, and operations evidence.

## Mutation and authorization boundary

The runtime has read-only table access. Three `SECURITY DEFINER` functions owned by the existing
`openschool_student_admitter` `NOLOGIN`, `NOINHERIT`, `NOBYPASSRLS` role are the only supported
schedule, apply, and cancel path. They require:

1. a real non-owner runtime session and verified Tenant request settings;
2. the exact `tenant.student_enrollments.manage` capability;
3. MFA assurance (`aal2`);
4. current scope over every source and destination School;
5. a current Organization Tree version; and
6. the expected source-period version for stale-write protection.

The database takes a per-Tenant, per-Person transaction lock before validating concurrent state.
Applying a transition atomically updates the period and Affiliation history, compatibility mirror,
Student Profile status, linked learner Account membership versions, compatibility evidence,
transition event, Audit Ledger event, and durable audit outbox. Any failure rolls the complete
transaction back.

Historical reads run under forced RLS. Organization administrators see periods in their approved
subtree. A School administrator sees only periods and transition evidence involving that School.
Valid sibling and cross-Tenant identifiers follow the same unavailable response as unknown IDs.

## User workflow

The learner profile shows authorized current and historical periods plus scheduled/applied/cancelled
transition events. MFA-verified organization and School administrators can plan transitions,
provide a reason and optional evidence reference, apply due work, or cancel a scheduled command.
Other roles receive no management surface; frontend visibility is not an authorization control.

## Evidence and limits

`student:enrollment-lifecycle-poc` runs through the real policy, non-owner transaction adapter,
forced-RLS policies, private functions, service, Audit Ledger, and outbox. It proves primary and
secondary concurrency, transfer, scheduling, cancellation, withdrawal, re-enrollment, graduation,
historical scope, stale and cross-scope denial, authorization-version advancement, audit rollback,
and direct-delete rejection.

The proof authorizes continued pre-production development only. It does not provide admissions
applications, annual progression, automated due-transition processing, cross-Tenant migration,
government reporting, or production/legal/privacy approval.
