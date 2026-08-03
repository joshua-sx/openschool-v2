# M1 tenant isolation matrix

- Owner: Security Engineering
- Status: Required test contract; first School/Student forced-RLS and atomic Audit Ledger slices implemented, full cross-path enforcement pending
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
| Identity/session | valid verified Account resolves explicit Tenant | forged/expired/revoked token and disabled Account denied | membership/security version invalidates active session | all M1 |
| Context selection | valid organization/School pair resolves | arbitrary Tenant, sibling subtree, mismatched School denied | no selector with multiple options returns `CONTEXT_REQUIRED` | tenant context |
| API/tRPC | capability and scope allow request | IDOR with Tenant B/sibling/resource-type IDs is indistinguishable and denied | batch inputs validate every element | first vertical slice |
| Policy module | role template plus active affiliation grants capability | expired/future/revoked/wrong-scope grant denied with stable reason | policy version included in decision | authorization |
| Query module | approved Scope constrains query | missing/wrong resource scope returns no foreign row | every query requires transaction adapter | data access |
| PostgreSQL/RLS | `db:student-rls-poc` proves runtime `SELECT`/`INSERT`/`UPDATE`/`DELETE` for the first School/Student slice and worker Tenant reads | no context, wrong Tenant/scope, cross-Tenant writes, probing, aggregate, pagination, and ungranted worker writes fail closed | named role/policy assertions, transaction cleanup, forced-RLS metadata, accepted index, and 1,000 ms CI budget; remaining tables move to #90 | full RLS matrix |
| Organization Tree | versioned insert, descendants, siblings, and reparenting pass in the domain and real PostgreSQL proof | cycles, incomplete closure, sealed-version mutation, overlap, and cross-Tenant references fail by constraint/trigger | reparenting changes current resolution while prior tree and School governance remain available as-of time | hierarchy authorization remains pending |
| School/class | assigned teacher reaches assigned classes | another School/class in same Tenant denied | assignment expiry invalidates access | academics |
| Guardian/student | active verified relationship reaches linked student | unlinked sibling/student denied | relationship expiry/revocation invalidates access | portals |
| Platform control plane | operator manages placement metadata | operator cannot read school records without support grant | grant creation/use/expiry audited | operations |
| Support/break glass | approved scoped grant permits named purpose | missing, expired, broader, or reused grant denied | Tenant notified; every read/action and closure audited | support launch |
| Files/object store | authorized record issues short-lived URL | changed object ID/Tenant metadata/signed URL replay denied | expiry and deletion/retention honored | documents |
| Cache | same Tenant/policy version hit returns correct data | Tenant B cannot receive Tenant A key/value | revocation/policy changes invalidate | caching |
| Search | indexed Tenant A results scoped correctly | crafted query cannot return Tenant B/sibling results or counts | deletion and permission change propagate | search |
| Jobs/queues | signed job resolves Tenant and capability | forged Tenant, stale grant, replay, cross-placement job denied | idempotency and dead-letter evidence retain context | background work |
| Notifications | recipient relationship and Tenant validated | stale guardian/address or cross-Tenant recipient denied | content minimized and delivery audited | communications |
| Import | staged Tenant A rows and references apply atomically | Tenant B IDs, duplicate IDs, formula payloads, oversized files denied | preview, rollback, and error report scoped | bulk import |
| Export/report | approved fields and scope produce Tenant A file | cross-Tenant filters, hidden columns, stale support grant denied | step-up auth, expiry, download and deletion audited | reporting |
| Analytics | approved aggregate respects Tenant/data product | row-level cross-Tenant drill-through denied | lineage, purpose, retention recorded | cross-tenant analytics |
| Audit | `audit:poc` proves Student/Account Link mutation evidence, audited reads/exports, and outbox retry; `audit:partition-poc` proves least-privilege quarterly partition creation | fault-injected audit failure rolls back mutation; Tenant/sibling visibility is scoped; runtime and owner tampering fail; default occupancy records a critical alert and NO-GO | hashes, redaction, denied/failed/support evidence, correlation, idempotent publish, 45-day partition horizon, exact bounds, indexes, RLS, triggers, idempotence, and non-destructive recovery are asserted; remaining mutations move through #90 | privileged mutations |
| Backup/restore | full isolated restore matches counts/checksums | wrong-Tenant restore target and RLS-filtered backup fail | scheduled drill records RPO/RTO evidence | production |
| Placement routing | Tenant maps to correct pooled adapter | unknown/tampered placement fails closed | move supports verification and rollback | bridge/silo |

## Test mechanics

- Use random identifiers and deliberately valid foreign identifiers from another Tenant; malformed IDs alone do not prove isolation.
- Test SELECT, INSERT, UPDATE, DELETE, aggregate counts, existence checks, pagination, bulk operations, and error messages.
- Run RLS tests through the actual non-owner login role, never only as migration owner.
- Verify query plans and indexes using production-shape row counts before accepting hierarchy or RLS policies.
- Record test name, commit, migration version, PostgreSQL version, role attributes, policy definitions, and CI run as evidence.
