# School and Student forced-RLS slice

Migration `0014_student_school_forced_rls` is the first production-shaped row-security slice. It forces PostgreSQL RLS on `schools` and `students` for fixed `openschool_runtime` and `openschool_worker` roles. It does not approve other Tenant tables or the product for real school data.

## Enforcement chain

1. Verified identity resolves a canonical Account, Person, Tenant, session, and optional organization/School context.
2. The capability policy returns an immutable allow decision and bounded query constraints.
3. `withPolicyTenantTransaction` validates that every constraint belongs to the canonical Tenant and writes the capability, policy version, and constraints with transaction-local `set_config`.
4. Application services retain explicit Tenant/scope predicates.
5. forced RLS independently evaluates the same Tenant, organization subtree, School, assigned class, guardian relationship, or student-self scope.

Missing context, an empty policy scope, another Tenant, another School, an unassigned class, an unlinked Student, and an unsupported platform scope all fail closed. Transaction-local settings clear after commit, rollback, or error.

Identity bootstrap uses one narrower seam before a Policy Decision exists. `bindIdentityTenantResolutionContext` accepts only School or linked-student constraints derived from current Account Link, Affiliation, and Relationship records. It uses the internal `identity.context.resolve` SELECT capability, batches at 16 scopes, and grants no write path.

## Role and operation matrix

| Table | Role | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- | --- |
| `schools` | runtime | selected canonical School or approved School/organization scope | explicit deny | explicit deny | explicit deny |
| `schools` | worker | current Tenant only | explicit deny | explicit deny | explicit deny |
| `students` | runtime | approved capability and Student scope | explicit deny and no table grant | explicit deny and no table grant | explicit deny and no table grant |
| `school_enrollments` | runtime | approved capability and canonical learner scope | explicit deny and no table grant | explicit deny and no table grant | explicit deny and no table grant |
| `school_enrollments` | `openschool_student_admitter` | exact create/update scope inside private function | canonical admission only | reviewed lifecycle seam only | explicit deny |
| `students` | worker | current Tenant only | explicit deny and no table grant | explicit deny and no table grant | explicit deny and no table grant |

The runtime role has only the table privileges needed by current code and proof coverage. Neither execution role owns product tables, has `BYPASSRLS`, can create schema objects, can truncate Students, or can assume migration, backup, emergency, or the other execution role.

## Deployment order

Named roles must exist because migration policies use explicit `TO` clauses:

```bash
ALLOW_ROLE_PROVISIONING=true ROLE_PROVISIONING_PHASE=identities bun run db:provision-roles
bun run db:migrate
bun run db:seed
ALLOW_ROLE_PROVISIONING=true ROLE_PROVISIONING_PHASE=grants bun run db:provision-roles
```

The bundled provisioner is loopback-only. Production must create the same role identities and grants through controlled infrastructure. The migration credential must be operationally isolated and capable of applying owner-level DDL; it is never available to the web or worker process.

Set `OPENSCHOOL_STUDENT_SLICE_MODE=forced_rls` to expose the slice. `disabled` is the application-layer rollback switch. Rollback never routes product traffic through the migration owner or a service-role credential, and forced policies remain installed while the slice is disabled.

## Acceptance evidence

`db:student-rls-poc` runs only against a guarded loopback database through the real named roles. It verifies:

- policy metadata, `ENABLE` plus `FORCE`, helper-function ACLs, and `row_security=off` resistance;
- no-context and policyless default denial;
- organization-subtree, School, assigned-class, guardian-linked, student-self, and second-Tenant visibility;
- deliberately omitted application Tenant predicates;
- identifier probing, aggregate counts, pagination, valid foreign identifiers from other scopes, and indistinguishable `WITH CHECK` failures;
- positive runtime `SELECT`, direct runtime write denial, private canonical mutation evidence, and worker read/write limits;
- representative data volume, use of `students_tenant_school_idx`, and a 1,000 ms CI execution-time budget (53.224 ms in the acceptance run).

The service-level `policy:query-poc` separately proves that application predicates agree with database scope. [`canonical:student-admission-poc`](./CANONICAL_STUDENT_ADMISSION.md) proves the only supported create/update boundary. The automated Isolation Matrix composes these proofs with the API, identity, audit, privileged-operation, backup, and release-evidence boundaries for every implemented path.
