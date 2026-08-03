# Audit Ledger partition operations

| Field | Required value |
| --- | --- |
| Owner | Platform Operations |
| Security escalation | Security Engineering on-call |
| Schedule | Daily |
| Minimum future horizon | 45 days |
| Launch status | NO-GO until the target scheduler, paging route, and recovery drill have accepted evidence |

## Operating contract

Run `bun run audit:partition-maintain` once every 24 hours against the target database with the
non-owner worker credential. `AUDIT_PARTITION_MIN_HORIZON_DAYS` may raise the horizon from its
default of 45 days, but values below 45 or above 366 are rejected. Only one job may run at a time;
the database advisory lock serializes concurrent attempts.

The job emits one structured JSON result. A healthy result must report `status=ready`, zero rows in
the default partition, `horizonDays >= 45`, the expected migration version, and the dedicated
`openschool_audit_partition_manager` role. Each created quarterly partition must have the exact
quarter bounds, manager ownership, enabled and forced RLS, all valid indexes attached to the
partitioned parent, and all four immutable Audit Ledger triggers.

The scheduler must page the Security Operations route on:

- any non-zero process exit;
- `AUDIT_DEFAULT_PARTITION_OCCUPIED`;
- `AUDIT_PARTITION_HORIZON_INSUFFICIENT`; or
- `AUDIT_PARTITION_MAINTENANCE_UNHEALTHY`.

Default-partition occupancy is critical even when a future partition can be created. Do not silence
the alert, lower the horizon, disable RLS or triggers, modify an Audit Event, or route new events
around the ledger. Record job ID, request ID, commit, migration, PostgreSQL version, role evidence,
partition bounds, default-row count, and paging delivery in the incident record.

## Deployment and production gate

1. Provision the NOLOGIN manager role before migration `0027` and verify runtime, worker, and
   control-plane roles cannot assume it.
2. Apply migrations and role grants, then run `bun run audit:partition-maintain` with the worker
   credential.
3. Configure the daily scheduler with bounded retries and a unique job/request ID per attempt.
4. Route stderr/non-zero exit to the named Security Operations paging destination.
5. Run `bun run audit:partition-poc` only against an approved disposable loopback database; retain
   its evidence with the release candidate.
6. Trigger a safe synthetic job failure in the target environment and confirm page receipt,
   acknowledgement, escalation, and incident timestamps.
7. Keep the Production Gate at NO-GO until the job, page, and recovery drill all have accepted
   evidence. Passing CI is engineering evidence, not proof of deployed scheduling or monitoring.

## Default-partition recovery

Treat any row in `audit_events_default` as an incident and preserve all evidence. A qualified
database operator and Security Engineering must execute and peer-review the following procedure:

1. Stop the maintenance job and prevent concurrent schema changes. Capture a database snapshot or
   point-in-time recovery marker before DDL.
2. Identify the occupied timestamp ranges and reconcile row counts, event IDs, content hashes, and
   legal-hold flags. Never update or delete the source rows.
3. In a reviewed transaction, detach the occupied default partition and rename it to a dated
   quarantine table. Immediately attach a new empty default partition with the required owner,
   RLS, indexes, and immutable triggers so current writes retain a safety destination.
4. Create exact non-overlapping quarterly partitions for every quarantined timestamp. Refuse the
   operation if any existing bound overlaps or if required controls cannot be reproduced.
5. Copy rows from quarantine through the partitioned parent in bounded batches. Preserve the
   quarantine source until destination counts, event IDs, ordered content hashes, Tenant totals,
   legal holds, and downstream outbox/archive references reconcile.
6. Re-run `bun run audit:partition-maintain`, require a ready 45-day horizon and zero default rows,
   and verify a fresh Audit Event remains append-only under the runtime boundary.
7. Resume the scheduler only after peer review. Retain quarantine and backup according to the
   incident/legal-hold decision; removal requires a separate approved retention action.
8. Complete root-cause analysis, customer/legal notification assessment, paging-gap review, and a
   post-incident action owner with due date.

The guarded `audit:partition-poc` rehearses this algorithm on a disposable partition tree: it
detaches and preserves the source, installs a new default and exact quarter, copies without deleting
the source, reconciles rows, and proves append-only triggers still reject mutation. The proof does
not authorize running destructive recovery steps against production without the approvals above.

## Routine evidence review

Platform Operations reviews daily job freshness and horizon. Security Engineering reviews critical
alerts and the quarterly evidence sample. Before every release, the accountable operator records
the last successful job, next uncovered boundary, default count, page health, and runbook-drill date
in the Production Gate decision record.
