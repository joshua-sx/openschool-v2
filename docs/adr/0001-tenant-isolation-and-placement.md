# ADR-0001: Tenant isolation and deployment placement

- Status: Accepted
- Date: 2026-08-02
- Owner: Platform Architecture
- Governs: #68 and all M1 tenant schema work

## Context

OpenSchool must serve a single primary school, a high-school group, a board, a ministry, or a national system. Treating School or Education Organization as the hard tenant would either duplicate workflows or make cross-school administration depend on exceptions. A pooled database is economical for most customers, while residency, scale, and contractual requirements may later require bridged or siloed deployments.

## Decision

Tenant is the immutable isolation, residency, encryption, billing, backup, and deployment realm. Every tenant-owned row carries a non-null `tenant_id`, including leaf rows where Tenant could otherwise be derived by joins. Global/control-plane tables are allowlisted; a table is tenant-owned by default.

Education Organizations and Schools exist inside a Tenant. A national customer can operate one Tenant when all units share one administrative trust and residency realm, or several Tenants when legal, operational, or blast-radius separation requires it. Cross-tenant oversight uses an explicit control-plane/reporting workflow and never weakens tenant RLS.

The data-access seam is tenant placement. Pooled placement is the first adapter. Bridge and silo adapters may be added when a second placement exists; the domain interface must not expose connection strings or placement type. Background work, files, caches, search, exports, and analytics use the same Tenant key.

## Required invariants

- Tenant identifiers come from server-resolved context, never resource input alone.
- Tenant changes are exceptional migrations, not ordinary row updates.
- Unique constraints and indexes begin with `tenant_id` when identity is tenant-local.
- Foreign-key strategies must prevent a child row from referencing a parent in another Tenant.
- A pooled runtime credential has no platform-wide bypass role.
- Placement moves have export/import verification, rollback, and audit evidence.

## Options rejected

- **School as Tenant:** blocks first-class board/ministry workflows and duplicates shared records.
- **Education Organization as Tenant:** cannot represent a hierarchy with different isolation choices.
- **Schema per school:** creates migration fan-out and still fails multi-school Person and reporting needs.
- **Silo every customer immediately:** raises operational cost before requirements justify it.
- **Pooled database with application filters only:** one missing predicate becomes a cross-tenant disclosure.

## Consequences

Tenant is deliberately distinct from Organization Tree and School scope. Pooled data requires RLS, composite constraints, tenant-leading indexes, and negative tests. National cross-tenant analytics becomes a governed data product rather than an unrestricted query. The placement seam stays hypothetical until a second adapter is implemented.

## Migration path and rollback

M1 adds Tenant and placement records, backfills one development Tenant, adds nullable `tenant_id`, verifies consistency, then makes it non-null and immutable in staged migrations. Rollback stops before the non-null/constraint step; after that point, rollback restores from the pre-migration backup rather than dropping isolation columns.
