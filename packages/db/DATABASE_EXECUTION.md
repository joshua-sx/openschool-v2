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
| `openschool_backup` | future restore delegation | `NOLOGIN`; never granted to runtime or worker |
| `openschool_emergency` | future controlled break-glass delegation | `NOLOGIN`; never granted to runtime or worker |

Migration, runtime, and worker configuration are parsed separately so the web process never needs the owner or worker credential. Local validation/provisioning rejects reused database usernames. Runtime startup also checks the connected PostgreSQL role, ownership, schema creation, truncation, privileged memberships, and the configured migration-role relationship before exposing an operation callback.

## Transaction interfaces

- `withIdentityTransaction` is the narrow pre-Tenant bootstrap seam. It accepts only verified provider subject/session/request evidence and is used to resolve an Account and its selectable Tenant contexts.
- `withTenantTransaction` validates canonical Account, Person, Tenant, session, organization, School, assurance, and request context. It resolves the exact active pooled Tenant Placement before invoking product code.
- `withPolicyTenantTransaction` additionally binds the allowed capability, policy version, and one to sixteen same-Tenant query constraints for database enforcement.
- `withWorkerTenantTransaction` requires a Tenant, job ID, job type, and request ID and uses the separately credentialed worker pool.

During identity bootstrap, `bindIdentityTenantResolutionContext` can narrow the same transaction only to assignment-derived Schools or guardian-linked Students. It cannot grant writes or general Tenant scope. See [the first forced-RLS slice](./STUDENT_RLS.md).

Every context value is parameterized through `set_config(..., true)` inside the transaction. Commit, rollback, PostgreSQL errors, and connection reuse therefore cannot retain request context. The callback is the only product-visible database handle; there is no exported global runtime client. Bridge and silo placements fail closed until their adapters and threat-model evidence exist.

## Grants and provisioning

`db:provision-roles` is a guarded, loopback-only development/CI provisioner. Its `identities` phase creates or rotates the named roles before migrations containing explicit `TO` clauses. Its `grants` phase resets runtime/worker table and schema privileges after migration and applies the reviewed minimum. Production roles must be created by controlled infrastructure using the same contract; this local script intentionally refuses remote databases.

Every new product table or operation requires an explicit grant review. Do not add `GRANT ... ON ALL TABLES`, schema `CREATE`, table ownership, `BYPASSRLS`, a service-role credential, or migration-role membership to runtime infrastructure.

## Reviewed raw SQL allowlist

Raw SQL is limited to:

- parameterized transaction-local `set_config` and PostgreSQL role evidence in `tenant-transaction.ts`;
- guarded local role provisioning in `provision-database-roles.ts`;
- disposable `*-poc.ts` files that prove PostgreSQL behavior.

The `db:boundary-check` CI gate scans tracked TypeScript under `apps`, `packages/auth`, `packages/audit`, and `packages/rbac`. It rejects owner/global clients, migration credentials, direct postgres-js access, raw `.unsafe()` calls, and use of the pre-policy binder outside the Tenant context resolver. Infrastructure-only database files remain governed by the explicit allowlist above and migration-journal checks.

## Evidence and rollback

`db:execution-poc` runs through real runtime and worker logins. It proves role separation and grants, unknown-placement denial before the operation, identity/Tenant/worker settings, cleanup after commit/rollback/SQL error, reuse of the same physical session, and queued work through an exhausted one-connection pool. `db:student-rls-poc` adds forced-policy, scope, write, side-channel, and query-plan evidence for the first slice.

The application may disable the School/Student slice with `OPENSCHOOL_STUDENT_SLICE_MODE=disabled`. Owner or service-role application access is not an accepted rollback path. Platform-wide RLS remains #90; atomic audit/outbox work remains #88.
