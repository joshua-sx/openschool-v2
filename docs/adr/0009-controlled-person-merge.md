# ADR-0009: Controlled duplicate Person merge

- Status: Accepted
- Date: 2026-08-13
- Owner: Identity Engineering
- Governs: #119 and duplicate Person remediation

## Context

A duplicate Person is not just a duplicate profile. A Person anchors Account links, effective
Affiliations and relationships, households, School enrollment, rosters, invitations, academic
history, authorization history, and immutable audit evidence. Repointing foreign keys directly can
silently widen access, erase provenance, create impossible overlapping records, or make a later
correction unverifiable.

The existing `person_merge_evidence` prototype records a developer assertion only. It is not an
approved production merge authority and must not become one by incremental expansion.

## Decision

Person merge is a separately authorized, staged workflow:

1. An administrator starts from a current duplicate-review case in
   `merge_approval_requested` state and explicitly chooses source and target People.
2. A locked preview inventories every canonical dependency, assigns a deterministic disposition,
   blocks conflicts, and stores only non-sensitive record keys, bounded metadata, fingerprints, and
   a digest.
3. A different administrator approves the exact current digest. Preview and approval both require
   AAL2 and interactive reauthentication no more than 15 minutes old.
4. A later execution authority will revalidate the case, People, dependency fingerprints, and
   approval under stable locks before moving compatible current facts in one transaction. Historical
   facts remain immutable. The source becomes a durable merged alias and is never hard-deleted.
5. Reversal is a new, separately authorized operation. It succeeds only when every recorded
   precondition still holds; otherwise the operation enters manual recovery without partial writes.

The control plane uses three forced-RLS tables: operations, append-only preview items, and
append-only events. A dedicated `NOLOGIN`, `NOBYPASSRLS` manager role owns future guarded
functions, while runtime retains read-only table grants and cannot inherit that role. Product
authorization is versioned independently from duplicate review through the
`tenant.people_merges.read`, `.preview`, `.approve`, and `.execute` capabilities.

Execution adds a forced-RLS alias registry and append-only move ledger. The alias identifies the
durable source-to-canonical mapping without deleting either Person. Each moved, ended, recreated,
preserved, invalidated, or archived record receives a non-sensitive ledger key plus before/after
fingerprints. The operation stores a plan version so execution can refuse approvals created before
the planner could enumerate transitive authorization dependencies such as role assignments and
sessions.

This foundation intentionally exposes no execution function. Preview/approval, execution, and
reversal ship as independently reviewable security increments; an intermediate deployment cannot
merge People accidentally.

## Options rejected

- **Delete the source Person:** destroys lineage and breaks immutable historical references.
- **Rewrite every foreign key:** falsifies history and can create authorization or academic-record
  conflicts.
- **Treat duplicate review as merge permission:** identifying a likely duplicate is weaker than
  approving a specific dependency plan.
- **One-person approval:** makes a compromised or mistaken administrator sufficient for a
  high-impact identity mutation.
- **Application-only orchestration:** cannot guarantee locks, atomicity, RLS authority, or a durable
  failure boundary across all dependencies.
- **Automatic merge from similarity score:** probabilistic evidence is not authority to combine
  school identities.

## Consequences

Merge is deliberately slower than ordinary profile editing. Administrators receive an explainable
dependency inventory and conflict codes instead of a best-effort action. Immutable histories retain
the original Person and are connected through the alias and merge ledger rather than rewritten.
Execution must invalidate affected sessions and authorization caches in the same transaction as the
identity changes and must emit atomic audit/outbox evidence.

The preview metadata contract must never include names, emails, addresses, provider identifiers, or
other sensitive values. UI labels are resolved through separately authorized Person reads.

## Migration path and rollback

Migration 0040 establishes the role, forced-RLS tables, immutable anchors, versioned capabilities,
and a no-execution safety boundary. Migration 0041 adds guarded preview and approval functions.
Migration 0042 adds the versioned execution plan, durable alias registry, and immutable move ledger
without yet exposing an executor. A later migration adds the guarded executor, followed by
reversal/manual-recovery authority. The legacy `person_merge_evidence` prototype remains
non-authoritative until its development callers are removed.

Rollback may disable creation and approval, but must preserve operations, preview items, events,
aliases, and audit evidence. Once execution exists, rollback must never restore a source Person by
deleting ledger data or rewriting history.
