# M1 tenant-security review

| Field | Value |
| --- | --- |
| Review date | 2026-08-03 |
| Reviewed commit | `75aec59f8ad8b18970e80c48d06b361464f91b23` |
| Review class | Internal engineering and architecture review |
| Implemented-M1 decision | **GO** for continued pre-production feature development |
| Production decision | **NO-GO** for real school data or users |

## Scope and method

This review closes the engineering work in milestone M1. It covers the accepted Tenant, Education
Organization, identity, Request Context, Policy Decision, non-owner database, first forced-RLS
School/Student slice, Audit Ledger, onboarding, MFA/revocation, platform lifecycle,
support/break-glass, partition, and Isolation Matrix boundaries.

The review included:

- manual review of the M1 architecture, migrations, runtime/worker/control-plane authorities,
  security-definer seams, audit boundary, rollback contracts, and current product adapters;
- a tracked-source search for migration-owner, service-role, global-client, unreviewed raw-SQL, and
  stale implementation claims;
- the enforced database-boundary scan and high-severity dependency audit;
- the repository typecheck, 141 tests, migration-journal check, build, clean migration/seed
  idempotence, and representative-data upgrade; and
- the complete guarded Isolation Matrix through the actual PostgreSQL 17 runtime roles.

This is not an independent penetration test, privacy/compliance assessment, target-environment
review, disaster-recovery certification, or launch approval.

## Exact-commit evidence

[Quality run 30827678302](https://github.com/joshua-sx/openschool-v2/actions/runs/30827678302)
reran after the squash merge on the exact reviewed `main` commit and recorded:

- all 16 evidence groups successful;
- 17 implemented/evidence-only matrix rows verified and five unbuilt product rows disabled;
- PostgreSQL `17.10`, 28 applied migration records through `0027_audit_partition_lifecycle`;
- non-owner runtime, worker, control-plane, and specialized `NOLOGIN` role attributes;
- complete public/platform policy evidence with stable SHA-256 digests;
- `students_tenant_school_idx` in the real forced-RLS query plan;
- wrong-Tenant and RLS-filtered backup detection plus disposable restore reconciliation; and
- implemented-M1 `GO` with production `NO-GO`.

## Findings

| Severity | Open at M1 close | Disposition |
| --- | ---: | --- |
| Critical | 0 | No finding |
| High | 0 | No finding |
| Medium | 5 residual production risks | Explicitly blocked by the Production Gate; none is represented as implemented production evidence |
| Low | 1 maintenance item | Track during normal framework maintenance |

Residual production risks are:

1. invitation delivery, provider MFA deletion, support notifications, and scheduled maintenance
   need target-provider/scheduler rehearsal, monitoring, paging ownership, and failure drills;
2. cache invalidation is bounded and versioned in-process, but approved cross-node propagation
   latency is not deployed or measured;
3. backup/restore is an evidence-only disposable drill, not encrypted production PITR or an approved
   RPO/RTO recovery system;
4. independent penetration testing, secret/artifact/image provenance, deployment hardening, and
   target-environment credential exercises remain incomplete; and
5. files, search, import, general report delivery, analytics, bridge/silo placement, and every future
   Tenant table remain disabled until they add real-adapter positive/negative matrix evidence.

The maintenance item is the existing Next.js `middleware`-to-`proxy` deprecation warning. It does
not change the current identity or authorization boundary, but should be removed before the
deprecated convention is unsupported.

## M1 exit assessment

- Every child issue meets its documented rollback and negative-test boundary.
- Tracked product code has no migration-owner/global database client or service-role database path.
- The implemented Isolation Matrix is green through real non-owner roles on the exact merge commit.
- No Critical or High internal M1 finding remains open.
- Capability Status and the Production Gate keep unbuilt, operational, legal, privacy, and customer
  approval work explicit.

M1 can therefore close as a pre-production engineering foundation. This decision authorizes the
next dependency-ordered product milestone; it does not authorize pilots, production infrastructure,
real school records, or public compliance claims.
