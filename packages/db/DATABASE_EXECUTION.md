# Database execution boundary

OpenSchool separates schema ownership from product and background execution:

| Credential | Purpose | Required properties |
| --- | --- | --- |
| `DATABASE_MIGRATION_URL` | migrations, seed fixtures, restore operations | owns or can create the application schema; never available to the web runtime |
| `DATABASE_MIGRATION_ROLE` | non-secret runtime assertion input | exact PostgreSQL role name used by the migration URL; safe to provide without the owner credential |
| `DATABASE_RUNTIME_URL` | verified identity bootstrap and request-scoped product work | login, non-owner, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOBYPASSRLS`, no DDL or `TRUNCATE` |
| `DATABASE_WORKER_URL` | explicitly typed Tenant jobs | distinct login with the same safety attributes and narrower table grants |
| `openschool_backup` | future restore delegation | `NOLOGIN`; never granted to runtime or worker |
| `openschool_emergency` | future controlled break-glass delegation | `NOLOGIN`; never granted to runtime or worker |

Migration, runtime, and worker configuration are parsed separately so the web process never needs the owner or worker credential. Local validation/provisioning rejects reused database usernames. Runtime startup also checks the connected PostgreSQL role, ownership, schema creation, truncation, privileged memberships, and the configured migration-role relationship before exposing an operation callback.

## Transaction interfaces

- `withIdentityTransaction` is the narrow pre-Tenant bootstrap seam. It accepts only verified provider subject/session/request evidence and is used to resolve an Account and its selectable Tenant contexts.
- `withTenantTransaction` validates canonical Account, Person, Tenant, session, organization, School, assurance, and request context. It resolves the exact active pooled Tenant Placement before invoking product code.
- `withWorkerTenantTransaction` requires a Tenant, job ID, job type, and request ID and uses the separately credentialed worker pool.

Every context value is parameterized through `set_config(..., true)` inside the transaction. Commit, rollback, PostgreSQL errors, and connection reuse therefore cannot retain request context. The callback is the only product-visible database handle; there is no exported global runtime client. Bridge and silo placements fail closed until their adapters and threat-model evidence exist.

## Grants and provisioning

`db:provision-roles` is a guarded, loopback-only development/CI provisioner. It resets runtime/worker table and schema privileges before applying the reviewed minimum for the current code paths. Production roles must be created by controlled infrastructure using the same contract; this local script intentionally refuses remote databases.

Every new product table or operation requires an explicit grant review. Do not add `GRANT ... ON ALL TABLES`, schema `CREATE`, table ownership, `BYPASSRLS`, a service-role credential, or migration-role membership to runtime infrastructure.

## Reviewed raw SQL allowlist

Raw SQL is limited to:

- parameterized transaction-local `set_config` and PostgreSQL role evidence in `tenant-transaction.ts`;
- guarded local role provisioning in `provision-database-roles.ts`;
- disposable `*-poc.ts` files that prove PostgreSQL behavior.

The `db:boundary-check` CI gate rejects owner/global clients, migration credentials, direct postgres-js access, and raw `.unsafe()` calls in product packages. Schema migrations remain journal-controlled separately.

## Evidence and rollback

`db:execution-poc` runs through real runtime and worker logins. It proves role separation and grants, unknown-placement denial before the operation, identity/Tenant/worker settings, cleanup after commit/rollback/SQL error, reuse of the same physical session, and queued work through an exhausted one-connection pool.

The application may roll back one query module at a time only to the prior non-owner adapter in a protected non-production environment. Owner or service-role application access is not an accepted rollback path. Forced RLS for the student vertical slice remains #87; atomic audit/outbox work remains #88.
