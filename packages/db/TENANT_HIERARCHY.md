# Tenant and Education Organization foundation

This package implements the first M1 isolation-key and hierarchy slice. It does **not** enable RLS or replace the legacy Account/Person model.

## Domain boundaries

- `tenants` is the immutable isolation, placement, residency, and billing boundary.
- `tenant_placements` selects the pooled adapter. Bridge and silo adapters remain disabled design seams.
- `education_organizations` represents typed ministry, board, district, network, region, or other administrative nodes inside one Tenant.
- `schools` remains one model for primary, secondary, all-through, special, and other profiles.
- legacy `organizations` remains available during dual-read migration; imported records are linked by `legacy_organization_id`.

Every tenant-owned operational row introduced by the existing schema carries a non-null, immutable `tenant_id`. Composite foreign keys prevent a child from combining one Tenant key with another Tenant's parent identifier. The additive Account/Person separation is documented in `IDENTITY_FOUNDATION.md`; legacy global `users` remain available only for migration compatibility. The merged Audit Ledger supplies the atomic audit boundary for implemented privileged mutations.

## Immutable Organization Tree writes

An Organization Tree version consists of:

1. one row per organization in `organization_tree_nodes`;
2. the exact ancestor/descendant expansion in `organization_tree_closure`;
3. one `organization_tree_versions` row that seals the version.

Application code must call `insertOrganizationTreeVersion` inside a database transaction. The service validates roots, parents, duplicates, self-parenting, and cycles, derives closure edges, inserts nodes and closure first, and inserts the version last. Deferred foreign keys make the complete version visible atomically.

PostgreSQL independently validates the same boundary. Before sealing, it requires exactly one root, every parent in the version, and an exact closure match. After sealing, node/closure inserts and all tree updates or deletes fail. A move therefore creates a new effective-dated version; it never rewrites history.

School governance uses separate half-open effective periods (`[valid_from, valid_until)`). A GiST exclusion constraint rejects overlapping assignments for the same Tenant and School.

## Migration and rollback boundary

The migration is deliberately staged:

- `0003` creates the additive Tenant/hierarchy structures and nullable isolation keys.
- `0004` locks tenant-owned legacy tables, creates one Tenant per legacy organization, backfills every key, imports root nodes and School governance, and aborts on nulls or mismatches.
- `0005` makes the keys non-null, replaces single-column relationships with composite Tenant-safe foreign keys, and adds Tenant-leading indexes.
- `0006` adds the shared School profile discriminator.
- `0007` adds immutable-key, version-sealing, cycle/closure, and governance-overlap guards.
- `0008` constrains Tenant, placement, Education Organization, and School profile values at the database boundary.

Before `0005`, an operator can stop and correct the source data without cutover. After `0005`, rollback means restoring the pre-migration backup or shipping a forward repair; isolation keys must not be dropped from live data.

## Evidence

`db:tenant-foundation-poc` is a guarded, destructive proof for a disposable loopback PostgreSQL database. It verifies real SQLSTATE failures for cross-Tenant references, immutable keys, overlapping governance, cycles, incomplete closure, and sealed-tree mutation; it also proves moves, siblings, descendants, historical resolution, shared School profiles, and hierarchy/Tenant index plans. The proof rolls back its temporary hierarchy changes.

CI additionally constructs a representative database at migration `0002`, applies the full migration set twice, and verifies that rows, hierarchy imports, School assignments, and cross-Tenant constraints survive the upgrade.
