# Tenant isolation contracts

`@openschool/isolation` owns the cross-path vocabulary used by OpenSchool's M1 system proof. It is
deliberately independent from auth, database, UI, storage, and queue implementations so every
placement adapter and future product path can consume the same Tenant boundary contract.

## Contracts

- `ISOLATION_FIXTURES` supplies valid identifiers for two Tenants, sibling Schools, known foreign
  records, and unknown controls. Negative tests use valid foreign identifiers; malformed values are
  tested separately and never substitute for isolation evidence.
- Tenant cache keys, ordinary job envelopes, and object keys require an explicit canonical Tenant.
  Missing, mismatched, or unsafe keys fail before an adapter is called. The global Audit partition
  job is a reviewed system-worker exception with its own separate context type.
- `ISOLATION_MATRIX` classifies each path as implemented, evidence-only, or disabled and names its
  required positive and negative evidence.
- `evaluateIsolationMatrixGate` returns two decisions. `implemented_m1_surface_only` may become GO
  when every implemented M1 path has current evidence. `production_launch` remains NO-GO and lists
  disabled/evidence-only paths plus the named human approvals code cannot grant.

Run the non-database contract tests with:

```bash
bun run isolation:boundary-contract
```

The guarded full runner is documented in the
[Isolation Matrix gate](../../docs/security/ISOLATION_GATE.md).
