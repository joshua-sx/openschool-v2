# ADR-0006: Direct Drizzle execution with transaction-scoped RLS

- Status: Accepted
- Date: 2026-08-02
- Owner: Data Platform
- Governs: #68, database access, migrations, RLS, and tenant jobs

## Context

OpenSchool currently connects directly through Drizzle using the schema owner, which bypasses RLS. Supabase Auth can populate `auth.uid()` when requests use its Data API, but the application already uses tRPC and needs multi-step business transactions with atomic audit writes.

## Decision

Keep tRPC as the only product data interface and Supabase as the identity provider. Use direct Drizzle/PostgreSQL access through a deep `withTenantTransaction(context, operation)` module. The module obtains the Tenant Placement adapter, starts a transaction, applies transaction-local verified Account/Tenant/organization/School/request settings, and exposes only a transaction-scoped query interface.

Use distinct PostgreSQL roles:

- migration owner: owns schema changes; never handles product requests;
- runtime role: non-owner, `NOBYPASSRLS`, least-privilege grants, no DDL;
- worker role: non-owner, explicit job type and Tenant context, `NOBYPASSRLS`;
- backup/restore role: operationally isolated and monitored;
- emergency role: unavailable to normal application infrastructure.

Tenant tables enable and force RLS. Policies target named runtime/worker roles, default deny without context, include explicit `USING` and `WITH CHECK`, and use indexed Tenant/scope columns. Context uses `set_config(..., true)` inside a transaction so pooled connections cannot retain it. Runtime code may not use a service-role key, schema-owner connection, user-controlled SQL, or a query outside the wrapper.

RLS is defense in depth against missing or incorrect predicates, not a sandbox for arbitrary SQL executed with the shared runtime credential. Parameterized query construction, raw-SQL review, credential isolation, and silo placement constrain that threat.

## Options rejected

- **Supabase Data API for all domain access:** user-context RLS is strong, but cross-table transactions, atomic audit, typed domain orchestration, and background jobs would move into a second interface or many database RPC functions.
- **Application authorization without RLS:** a missing predicate can disclose a whole Tenant.
- **Direct Drizzle as schema owner/service role:** RLS is bypassed and the defense is illusory.
- **Session-level context:** pooled connections can leak context between requests.
- **One database role per Person:** operationally unbounded and incompatible with ordinary pooling.

## Evidence required before M1 policy migration

The isolated proof under `packages/db/security-poc` must demonstrate separate real runtime and worker roles, non-ownership, `NOBYPASSRLS`, explicit `has_table_privilege` grants/denials, default deny, Tenant A/B SELECT/INSERT/UPDATE/DELETE isolation, `WITH CHECK` rejection, and context reset after commit, rollback, policy error, and same-connection reuse in CI. Missing table privilege failures must be distinguished from RLS policy denials. Actual table policies require a separate reviewed migration and the full isolation matrix.

## Consequences

Every repository/query module receives a transaction-scoped adapter rather than calling a global database client. This concentrates context, transaction, audit, and placement behavior at one seam. Policy indexes and query plans become release evidence. High-assurance customers can move to bridge/silo placement without changing domain callers.

## Migration path and rollback

Create non-login ownership roles and non-owner runtime credentials, add the transaction wrapper, and migrate one vertical slice with dual application predicates plus RLS. Negative tests gate each table family. Rollback routes the slice to the prior code only in a protected non-production environment; production never falls back to owner-bypass access.

## References

- [PostgreSQL row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)
- [PostgreSQL transaction-local settings](https://www.postgresql.org/docs/current/sql-set.html)
- [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)
