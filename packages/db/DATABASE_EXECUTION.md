# Database execution boundary

OpenSchool separates schema ownership from product and background execution:

| Credential | Purpose | Required properties |
| --- | --- | --- |
| `DATABASE_MIGRATION_URL` | migrations, seed fixtures, restore operations | owns or can create the application schema; never available to the web runtime |
| `DATABASE_MIGRATION_ROLE` | non-secret runtime assertion input | exact PostgreSQL role name used by the migration URL; safe to provide without the owner credential |
| `DATABASE_RUNTIME_URL` | verified identity bootstrap and request-scoped product work | login, non-owner, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOBYPASSRLS`, no DDL or `TRUNCATE` |
| `DATABASE_RUNTIME_ROLE` | non-secret role-separation assertion | fixed `openschool_runtime` role used by named RLS policies |
| `DATABASE_WORKER_URL` | explicitly typed Tenant jobs | distinct login with the same safety attributes and narrower table grants |
| `DATABASE_WORKER_ROLE` | non-secret role-separation assertion | fixed `openschool_worker` role used by named RLS policies |
| `DATABASE_CONTROL_PLANE_URL` | global platform administration | fixed non-owner login with no direct table grants; only reviewed private control-plane functions are executable |
| `DATABASE_CONTROL_PLANE_ROLE` | non-secret role-separation assertion | fixed `openschool_control_plane` role, distinct from every Tenant execution identity |
| `openschool_backup` | future restore delegation | `NOLOGIN`; never granted to an execution identity |
| `openschool_emergency` | future controlled break-glass delegation | `NOLOGIN`; never granted to an execution identity |
| `openschool_identity_revoker` | private Account/session/Affiliation/role transitions | `NOLOGIN`, `NOBYPASSRLS`; runtime may execute its reviewed function but cannot assume the role |
| `openschool_platform_access_resolver` | global Account/session/grant resolution | `NOLOGIN`, `NOBYPASSRLS`; owns the read-only platform resolver |
| `openschool_tenant_lifecycle_manager` | Tenant status plus platform audit/invalidation transaction | `NOLOGIN`, `NOBYPASSRLS`; owns the only lifecycle mutation function |

Migration, runtime, worker, and control-plane configuration are parsed separately so the web process never needs the owner or worker credential. Local validation/provisioning rejects reused database usernames. Runtime/control-plane startup also checks the connected PostgreSQL role, ownership, schema creation, direct table grants, function execution, and privileged memberships before exposing an operation callback.

## Transaction interfaces

- `withIdentityTransaction` is the narrow pre-Tenant bootstrap seam. It accepts only verified provider subject/session/request evidence and is used to resolve an Account and its selectable Tenant contexts.
- `withTenantTransaction` validates canonical Account, Person, Tenant, session, organization, School, assurance, and request context. It resolves the exact active pooled Tenant Placement before invoking product code.
- `withPolicyTenantTransaction` additionally binds the allowed capability, policy version, and one to sixteen same-Tenant query constraints for database enforcement.
- `withWorkerTenantTransaction` requires a Tenant, job ID, job type, and request ID and uses the separately credentialed worker pool.
- `resolvePlatformDatabaseContext` and `withPlatformPolicyTransaction` use the no-table-access control-plane pool. They can execute only reviewed private functions and never expose a general global database handle.

During identity bootstrap, `bindIdentityTenantResolutionContext` can narrow the same transaction only to assignment-derived Schools or guardian-linked Students. It cannot grant writes or general Tenant scope. See [the first forced-RLS slice](./STUDENT_RLS.md).

Every context value is parameterized through `set_config(..., true)` inside the transaction. Commit, rollback, PostgreSQL errors, and connection reuse therefore cannot retain request context. The callback is the only product-visible database handle; there is no exported global runtime client. Bridge and silo placements fail closed until their adapters and threat-model evidence exist.

## Grants and provisioning

`db:provision-roles` is a guarded, loopback-only development/CI provisioner. Its `identities` phase creates or rotates the named roles before migrations containing explicit `TO` clauses. Its `grants` phase resets runtime, worker, and control-plane table/schema privileges after migration and applies the reviewed minimum. Production roles must be created by controlled infrastructure using the same contract; this local script intentionally refuses remote databases.

Every new product table or operation requires an explicit grant review. Identity lifecycle changes use column-level grants held by `openschool_identity_revoker`; runtime receives only `EXECUTE` on the private atomic wrapper. Provider reconciliation gives worker only forced-RLS queue select/update plus a private resolver owned by `openschool_provider_security_resolver`; provider subjects are resolved in memory and never persisted in the queue. Platform lifecycle changes use separate column-level grants held by the platform `NOLOGIN` owners; the control-plane login receives only private-function execution and no product-table grant. Do not add `GRANT ... ON ALL TABLES`, schema `CREATE`, table ownership, `BYPASSRLS`, a service-role credential, or migration-role membership to application infrastructure.

## Reviewed raw SQL allowlist

Raw SQL is limited to:

- parameterized transaction-local `set_config` and PostgreSQL role evidence in `tenant-transaction.ts`;
- guarded local role provisioning in `provision-database-roles.ts`;
- disposable `*-poc.ts` files that prove PostgreSQL behavior.

The `db:boundary-check` CI gate scans tracked TypeScript under `apps`, `packages/auth`, `packages/audit`, and `packages/rbac`. It rejects owner/global clients, migration credentials, direct postgres-js access, raw `.unsafe()` calls, and use of the pre-policy binder outside the Tenant context resolver. Infrastructure-only database files remain governed by the explicit allowlist above and migration-journal checks.

## Evidence and rollback

`db:execution-poc` runs through real runtime and worker logins. It proves role separation and grants, private identity-revocation/provider-resolver execution boundaries, unknown-placement denial before the operation, identity/Tenant/worker settings, cleanup after commit/rollback/SQL error, reuse of the same physical session, and queued work through an exhausted one-connection pool. The identity-revocation proof adds forced-RLS provider queue denial, retry, lease reclaim, dead-letter, and atomic rollback evidence. `db:student-rls-poc` adds forced-policy, scope, write, side-channel, and query-plan evidence for the first slice. `platform:tenant-lifecycle-poc` proves the isolated control-plane login, MFA/reauthentication, concurrent suspension linearization, runtime/worker denial, unaffected-Tenant continuity, audit/outbox rollback, reactivation, and grant revocation.

The application may disable the School/Student slice with `OPENSCHOOL_STUDENT_SLICE_MODE=disabled`. Owner or service-role application access is not an accepted rollback path. The implemented M1 paths now run through the automated Isolation Matrix and atomic audit/outbox boundary. Every future Tenant table, query, worker, or privileged mutation must add its own forced-RLS, least-privilege, audit, and matrix evidence before enablement.
