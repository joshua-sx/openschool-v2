# Transaction-scoped RLS proof

This is an isolated, destructive proof against a disposable local/CI PostgreSQL database. It is not an application migration and creates no production policy.

The proof creates a table owned by a non-login owner, separate `NOBYPASSRLS` runtime and worker groups, and logins that inherit only their respective grants. It then verifies:

- runtime and owner are separate roles;
- runtime and worker are non-owners without `BYPASSRLS`;
- explicit table privileges match each role's intended operation set;
- missing Tenant context returns no rows;
- Tenant A and Tenant B cannot see one another;
- cross-Tenant inserts fail through `WITH CHECK`;
- cross-Tenant updates affect no rows;
- same-Tenant DELETE succeeds while cross-Tenant DELETE is filtered by RLS;
- transaction-local context disappears after commit, rollback, policy error, and reuse of the same pooled connection;
- ungranted worker updates/deletes fail at the privilege layer, separately from RLS denial.

Run only through the guarded root command:

```bash
ALLOW_SECURITY_POC=true DATABASE_URL=postgresql://... bun run db:security-poc
```

The command refuses non-loopback database hosts. GitHub Actions runs it against the ephemeral PostgreSQL service after the normal migration and seed idempotence check.

This proof validates the execution mechanics chosen in ADR-0006. It does not approve RLS for actual OpenSchool tables; those policies require the full Tenant Isolation Matrix and separate reviewed migrations.

The runner intentionally uses the raw `postgres` client as a narrow exception to the repository's Drizzle rule. Role creation/introspection, multi-statement DDL, `set_config`, physical-session checks, PostgreSQL error codes, and privilege-vs-policy assertions are the behavior under test; routing those operations through Drizzle would obscure rather than strengthen the proof. Product data access remains governed by ADR-0006's transaction adapter.
