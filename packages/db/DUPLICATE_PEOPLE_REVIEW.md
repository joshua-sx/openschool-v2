# Duplicate People review

This slice provides a conservative, School-scoped review queue for possible duplicate People. It
is a decision-support workflow, not a Person merge facility. Learner admission and guardian contact
creation remain nonblocking, and the application never combines, deletes, or rewrites People.

## Detection contract

- Candidate generation runs inside the same transaction as canonical learner create/update and new
  guardian contact creation.
- The database limits matching to the active Tenant, selected School, and at most 20 candidates.
  Active guardian, parent, and emergency-contact relationships inherit the learner's School scope.
- Signals are deterministic and explainable: normalized email, normalized display name, and date of
  birth. Scores are capped at 100 and require at least 50 points.
- A case stores only the matched signal names, score, and a SHA-256 evidence fingerprint. It does not
  duplicate the matched personal values into case history.
- Confirming People as distinct suppresses identical evidence. Material evidence changes reopen the
  case; disappearing evidence marks an open case `superseded`; returning evidence can reopen it.

## Review contract

School and Organization administrators may read their authorized School queues. Decisions require
AAL2 and an optimistic case version. Reviewers can:

1. confirm that the People are distinct; or
2. request a separately governed merge approval.

Both actions require a reason, append an immutable case event, and atomically append Audit Ledger and
outbox records. There is intentionally no `merge` action in this slice. Issue #119 owns preview,
approval separation, reference reassignment, compensation, and merge execution.

The queue returns no more than 50 cases and the 20 most recent events per case. Personal fields are
shown only when they explain a matched signal.

## Security boundary

`person_duplicate_cases` and `person_duplicate_case_events` use forced RLS. Runtime callers have
read-only table access; guarded `SECURITY DEFINER` functions own candidate refresh and decisions
through a non-login manager role. Context checks require the runtime session identity, Tenant,
Account, capability, School scope, request ID, and AAL2 for review. Sibling-School and cross-Tenant
requests fail through the same policy boundary, direct writes are denied, and events are append-only.

The disposable-database proof at
`apps/web/src/server/duplicate-people-poc.ts` exercises positive and negative paths and contributes
evidence to the Tenant Isolation Matrix. This remains a pre-production preview and is not approval
to process real School data.
