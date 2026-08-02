# Transaction-scoped RLS proof

This is an isolated, destructive proof against a disposable local/CI PostgreSQL database. It is not an application migration and creates no production policy.

The proof creates a table owned by a non-login owner, a `NOBYPASSRLS` runtime group, and a separate login that inherits only runtime grants. It then verifies:

- runtime and owner are separate roles;
- runtime has no `BYPASSRLS` attribute;
- missing Tenant context returns no rows;
- Tenant A and Tenant B cannot see one another;
- cross-Tenant inserts fail through `WITH CHECK`;
- cross-Tenant updates affect no rows;
- transaction-local context disappears after commit;
- runtime has no `DELETE` privilege.

Run only through the guarded root command:

```bash
ALLOW_SECURITY_POC=true DATABASE_URL=postgresql://... bun run db:security-poc
```

The command refuses non-loopback database hosts. GitHub Actions runs it against the ephemeral PostgreSQL service after the normal migration and seed idempotence check.

This proof validates the execution mechanics chosen in ADR-0006. It does not approve RLS for actual OpenSchool tables; those policies require the full Tenant Isolation Matrix and separate reviewed migrations.
