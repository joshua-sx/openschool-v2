# M1 tenant security implementation plan

- Milestone: [M1 — Tenant security foundation](https://github.com/joshua-sx/openschool-v2/milestone/2)
- Epic: [#81](https://github.com/joshua-sx/openschool-v2/issues/81)
- Governing decision package: #68
- Product state throughout: pre-production; no real school data

## Dependency graph

```mermaid
flowchart TD
  I82["#82 Tenant and Organization Tree"] --> I83["#83 Account, Person, Affiliations"]
  I82 --> I84["#84 Tenant Request Context"]
  I83 --> I84
  I84 --> I85["#85 Capability Policy Decisions"]
  I84 --> I86["#86 Runtime Roles and Transaction Adapter"]
  I82 --> I86
  I85 --> I87["#87 Student Forced-RLS Slice"]
  I86 --> I87
  I82 --> I87
  I84 --> I88["#88 Atomic Audit and Outbox"]
  I86 --> I88
  I83 --> I89["#89 Invitations, MFA, Revocation, Support"]
  I84 --> I89
  I85 --> I89
  I88 --> I89
  I87 --> I90["#90 Full Isolation Matrix Harness"]
  I88 --> I90
  I89 --> I90
```

## Implementation phases

| Phase | Issues | Deliverable | Merge/rollback boundary |
| --- | --- | --- | --- |
| 1. Isolation keys | #82 | Tenant, placement, Organization Tree, School governance, staged backfill | stop before non-null cutover; after cutover restore or forward-fix |
| 2. Identity records | #83 | Account/Person separation and effective Affiliations/Relationships | dual-read; legacy records remain until parity |
| 3. Trusted context | #84 | verified identity and canonical Tenant Request Context | compare in development; production fails closed |
| 4. Enforcement modules | #85 and #86 | Policy Decision module plus non-owner transaction adapter | versioned policy rollback; never owner-bypass DB access |
| 5. Evidence and audit | #87, #88, and #99 | forced-RLS student vertical slice, atomic audit/outbox, and partition lifecycle | slice feature flag; audit never disabled/deleted |
| 6. Privileged identity | #89 (#100, #101, #102) | invitation, MFA, revocation, support/break-glass | pause invites only; revocation/MFA/audit remain |
| 7. System proof | #90 | full cross-path Isolation Matrix and automated NO-GO gate | security failures disable feature/release, not tests |

## Execution rules

1. No issue changes production RLS/schema behavior before its governing ADR is merged.
2. Every schema migration has clean, existing-fixture, negative-constraint, rollback, and second-run evidence.
3. Every authorization/data-path issue includes valid identifiers from another Tenant and sibling scope.
4. Each pull request is independently reviewable and keeps the application pre-production.
5. Product epics #2–#6 do not expand protected data paths until #87 proves the first complete slice.
6. Jurisdiction-specific privacy/legal decisions remain named human approvals in the Production Gate, never inferred from passing code.

## Phase 5 and 6 status

- #100 invitation-only onboarding: merged with guarded live PostgreSQL/CI evidence; production
  provider delivery rehearsal remains a launch gate.
- #101 privileged MFA and immediate revocation: merged with Tenant administrator controls, isolated
  platform Tenant lifecycle, provider reconciliation, and guarded live PostgreSQL/CI evidence;
  production provider deletion/reconciliation rehearsal remains a launch gate.
- #102 tenant-approved support and break-glass access: merged with exact-scope diagnostics, separate
  break-glass authority, visible workflows, durable notifications, worker seams, and guarded live
  PostgreSQL/CI evidence; deployed scheduler, delivery provider, and paging drills remain launch
  gates.
- #99 Audit Ledger partition lifecycle: implementation includes a least-privilege daily maintenance
  seam, 45-day engineering gate, critical default-occupancy alert, and disposable recovery proof;
  target-environment scheduling, paging, and runbook exercise remain launch gates.
