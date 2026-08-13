# Tenant Isolation Matrix gate

| Field | Value |
| --- | --- |
| Owner | Security Engineering |
| Runtime owner | Platform Engineering |
| Product stage | Pre-production; no real school data |

## Decisions and scope

`bun run isolation:matrix-poc` is the continuously enforced implemented-surface system proof. It executes every
implemented security boundary in dependency order and emits one machine-readable
`ISOLATION_MATRIX_REPORT` record.

The report intentionally contains two different decisions:

1. `implemented_surface_only` is GO only when every implemented/evidence-only row has its
   same-scope positive proof and valid cross-scope negative proof.
2. `production_launch` is always NO-GO in this automated gate. Code cannot supply named
   engineering, security/privacy, operations/support, or legal/customer-owner approval. Disabled
   product paths and evidence-only backup/restore remain listed as launch blockers.

An engineering GO therefore means the implemented foundation is safe enough for reviewed
feature development. It does not authorize real school data, pilots, a jurisdiction, or production.

## Proof order

The guarded runner executes:

1. Tenant-bound cache/job/file contracts;
2. database execution and generic real-role RLS;
3. Tenant/Organization Tree and Account/Person foundations;
4. verified Tenant Request Context and capability query constraints;
5. actual tRPC School/Student IDOR and error-shape proof;
6. canonical learner admission, legacy compatibility, and direct-write denial proof;
7. canonical Academic Year/Term/Learner Level lifecycle, concurrency, and primary/high proof;
8. learner enrollment schedule/apply/cancel, within-Tenant transfer, history, concurrency, and authorization-version proof;
9. Account-optional guardian/emergency contacts, explicit powers, portal context, invalidation, and scope-denial proof;
10. forced-RLS School/Student aggregate, pagination, and plan proof;
11. atomic Audit Ledger/outbox;
12. invitation, revocation/MFA, platform Tenant lifecycle, support, and notification proofs;
13. backup/restore isolation rehearsal;
14. release metadata capture; and
15. Audit Ledger partition lifecycle last, because its default-occupancy alert fixture is immutable.

The runner stops at the first failed proof, emits engineering NO-GO with the missing evidence, and
returns non-zero. Cross-Tenant, privilege, audit, backup, or bulk-output failures cannot be
quarantined or bypassed. Disable the feature or release and fix the boundary.

## Release evidence

The report records the immutable commit and CI run, latest migration and applied count, PostgreSQL
version, actual role attributes, complete public/platform policy definitions, SHA-256 digests of
role and policy evidence, and the runtime School/Student query plan with its accepted Tenant-leading
index and execution time. The full role/policy/plan evidence is retained in CI logs; digests are the
compact comparison anchors.

The proof requires explicit opt-in variables and refuses every non-loopback database URL. It is
destructive to disposable proof data and must never be pointed at a shared or production database.

## Implemented and disabled paths

Identity/session, context selection, tRPC API, policy/query modules, School/Student/academic/enrollment/contact-lifecycle
PostgreSQL RLS, Organization Tree, School/class, guardian/student, platform control plane, support/break glass,
short-lived context cache, current durable jobs, support notifications, Audit Ledger, and pooled
placement routing are implemented rows. Backup/restore is evidence-only: the drill detects an
RLS-filtered full backup, rejects a wrong-Tenant target, and reconciles a disposable Tenant restore,
but production backup infrastructure is not configured by this repository.

Files/object storage, search, bulk import, general report/export delivery, and analytics remain
disabled. The Tenant key contracts exist so those adapters fail safely when implemented; a contract
without a real adapter is never counted as positive product evidence.

## Adding a data path or placement adapter

Before merge:

1. add or change the machine-readable row in `packages/isolation/src/matrix.ts`;
2. reuse the two-Tenant/sibling-School fixtures and test same-scope allow plus valid foreign-ID deny;
3. prove omitted Tenant cache, job, file, index, export, and tracing keys fail before adapter access;
4. run through the real runtime identity/credential and deployment adapter;
5. cover aggregates, existence checks, batch items, pagination, errors, retries, cleanup, and
   revocation as applicable;
6. record the new evidence ID in the runner; and
7. update capability status, the threat model, and the Production Gate.

Bridge and silo placements remain unsupported until this entire behavioral suite passes through
their real routing, credentials, backup/restore, and operations paths.
