# M1 tenant isolation matrix

- Owner: Security Engineering
- Status: Implemented M1 surfaces continuously enforced; disabled product paths and production approvals remain NO-GO
- Governing ADRs: [0001](../adr/0001-tenant-isolation-and-placement.md), [0004](../adr/0004-request-context-and-session-verification.md), [0005](../adr/0005-capability-authorization.md), [0006](../adr/0006-database-execution-and-rls.md)

Each implementation issue converts the relevant rows below into automated tests. Positive tests are necessary but never sufficient: every path requires same-Tenant allow and cross-scope deny evidence.

## Test personas and fixtures

- Tenant A: ministry/root organization, Board A1 and Board A2 siblings, Primary A1, High A1, High A2
- Tenant B: independent School B1
- Accounts: platform operator, Tenant A org admin with subtree scope, School A1 admin, multi-school teacher, guardian linked to one student, student, expired staff member, Tenant B admin, support agent without/with grant
- placements: pooled Tenant A and Tenant B; a future bridge adapter uses the same behavioral suite

## Required matrix

| Path | Positive evidence | Negative evidence | Context/cleanup evidence | Blocks |
| --- | --- | --- | --- | --- |
| Identity/session | verified Account resolves its explicit Tenant through identity/revocation proofs | forged/expired/revoked token, disabled Account, stale membership/security, and valid foreign Account targets denied | provider reconciliation, session races, and invalidation retain durable evidence | M1 gate |
| Context selection | valid organization/School pair resolves through the non-owner runtime | arbitrary Tenant, sibling subtree, mismatched School, and ambiguous selector denied | no selector with multiple options returns `CONTEXT_REQUIRED`; cache includes every security/scope input | M1 gate |
| API/tRPC | actual tRPC middleware, service, pooled placement, and runtime role return same-scope School/Student fixtures | valid Tenant B and sibling IDs match unknown-record errors; concurrent batch-equivalent requests return no foreign rows | forged Request/Policy Context binding fails before query; malformed input remains a separate validation case | M1 gate |
| Policy module | role template plus active affiliation grants capability | expired/future/revoked/wrong-scope grant denied with stable reason | policy version and exact query constraints included in decision | M1 gate |
| Query module | approved Scope constrains actual School/Student services | missing/wrong/cross-Tenant resource scope returns no foreign row | every product query uses the placement-aware transaction adapter | M1 gate |
| PostgreSQL/RLS | `db:student-rls-poc` proves runtime `SELECT`/`INSERT`/`UPDATE`/`DELETE` for the first School/Student slice and worker Tenant reads | no context, wrong Tenant/scope, cross-Tenant writes, probing, aggregate, pagination, and ungranted worker writes fail closed | named role/policy assertions, transaction cleanup, forced-RLS metadata, accepted index, and 1,000 ms CI budget; every future Tenant table must join the automated gate before enablement | M1 gate; future paths fail closed |
| Organization Tree | versioned insert, descendants, siblings, and reparenting pass in domain and PostgreSQL | cycles, incomplete closure, sealed mutation, overlap, and cross-Tenant references fail | current resolution changes without rewriting historical governance | M1 gate |
| School/class | assigned teacher reaches assigned class students | valid sibling School/class denied | assignment expiry is covered by policy/effective-period evidence | M1 gate |
| Guardian/student | active verified relationship reaches linked student | valid unlinked sibling and cross-Tenant students denied | relationship scope is resolved at query time | M1 gate |
| Platform control plane | operator manages isolated Tenant lifecycle metadata | Tenant roles/runtime/worker cannot assume platform authority or read another Tenant | suspension/reactivation, provider evidence, audit, and outbox are atomic | M1 gate |
| Support/break glass | approved, exact-scope, MFA/reauthenticated grant permits named diagnostics | missing, expired, broader, cross-Tenant, reused, or wrong-session grant denied | Tenant notified; every read/action/closure/review audited | M1 gate; deployed operations pending |
| Files/object store | **Disabled:** no product adapter exists; Tenant object-key contract is negative evidence only | missing/mismatched Tenant prefixes and unsafe paths fail contract tests | real URL, retention, malware, and deletion evidence required when implemented | production NO-GO |
| Cache | short-lived Request Context cache keys Tenant, Account, session, versions, assurance, policy, and selectors | mismatched/omitted Tenant key rejected; security changes create a different key | Account/session invalidation and TTL proven; durable cross-node invalidation remains production work | M1 gate |
| Search | **Disabled:** no search adapter/index exists | no synthetic green evidence accepted | full row/count/deletion propagation suite required when implemented | production NO-GO |
| Jobs/queues | invitation, provider security, support, and ordinary job envelopes retain Tenant and request context | omitted Tenant, stale lease/grant, poison row, replay, and cross-Tenant targets denied | retries, fencing, dead-letter, and minimized payload evidence tested | M1 gate; deployed schedulers pending |
| Notifications | support notifications are Tenant-visible and scope-filtered | valid sibling grant notification is hidden; cross-Tenant delivery context denied | durable outbox is minimized/audited; external delivery rehearsal pending | M1 gate; production delivery pending |
| Import | **Disabled:** no bulk import adapter exists | no synthetic green evidence accepted | staging, formula/size, reconciliation, rollback, and error-file suite required | production NO-GO |
| Export/report | **Disabled as a product path:** Audit export requests/outbox are Tenant-scoped, but no general report file delivery exists | Audit export cross-Tenant scope/replay denied; no claim for unbuilt reports | file expiry, step-up, download/deletion audit required when implemented | production NO-GO |
| Analytics | **Disabled:** no governed analytics data product exists | no pooled bypass or synthetic aggregate evidence accepted | lineage, Tenant set, purpose, retention, and drill-through suite required | production NO-GO |
| Audit | `audit:poc` proves Student/Account Link mutation evidence, audited reads/exports, and outbox retry; `audit:partition-poc` proves least-privilege quarterly partition creation | fault-injected audit failure rolls back mutation; Tenant/sibling visibility is scoped; runtime and owner tampering fail; default occupancy records a critical alert and NO-GO | hashes, redaction, denied/failed/support evidence, correlation, idempotent publish, 45-day partition horizon, exact bounds, indexes, RLS, triggers, idempotence, and non-destructive recovery are asserted; every future privileged mutation must add atomic audit/matrix evidence | privileged mutations |
| Backup/restore | disposable Tenant snapshot restores with count and SHA-256 reconciliation | valid wrong-Tenant target and RLS-filtered full backup are detected | evidence-only drill; production PITR, encryption, schedule, RPO/RTO, and off-site restore remain pending | M1 gate; production NO-GO |
| Placement routing | Tenant maps to the real pooled transaction adapter | unknown/disabled/unsupported placement fails before product operation | release evidence records actual roles and pooled plan; bridge/silo disabled | M1 gate |

## Test mechanics

- Use random identifiers and deliberately valid foreign identifiers from another Tenant; malformed IDs alone do not prove isolation.
- Test SELECT, INSERT, UPDATE, DELETE, aggregate counts, existence checks, pagination, bulk operations, and error messages.
- Run RLS tests through the actual non-owner login role, never only as migration owner.
- Verify query plans and indexes using production-shape row counts before accepting hierarchy or RLS policies.
- Record test name, commit, migration version, PostgreSQL version, role attributes, policy definitions, and CI run as evidence.

## Automated gate

The [Isolation Matrix gate](./ISOLATION_GATE.md) and machine-readable registry in
`packages/isolation/src/matrix.ts` are authoritative for automated coverage. A green implemented-M1
decision does not change `docs/PRODUCTION_READINESS.md`: disabled paths, production infrastructure,
independent review, and named jurisdiction/operations/legal approvals remain NO-GO.
