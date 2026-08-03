# Audit Ledger operating contract

The Audit Ledger is the required evidence boundary for protected mutations, privileged attempts,
audit reads, and exports. It is not an application log and must never contain whole records,
credentials, free-form sensitive notes, or raw request payloads.

## Invariants

1. A required mutation and its successful Audit Event commit in one database transaction. If
   sanitization, hashing, the event insert, or the outbox insert fails, the mutation rolls back.
2. A denied or failed privileged attempt is appended in a new transaction after the failed business
   transaction. If that evidence also fails, the caller receives both failures and must alert.
3. `openschool_runtime` can insert and read only policy-scoped events; it cannot update or delete
   events or change outbox delivery state. `openschool_worker` may claim and complete outbox rows,
   but cannot change their evidence anchors or delete them.
4. Every event is versioned, Tenant-bound, actor-bound, classified, correlation-bound, and hashed
   by a database trigger. Archive manifests provide a signed batch chain for independently stored
   closed partitions.
5. Audit reads append an intent receipt before reading and a linked completion event in the same
   transaction. Export requests append their intent and durable outbox record atomically.

The low-level `appendSanitizedAuditLedgerEvent` function is a deep infrastructure seam. Product
code uses `appendAuditEventInTransaction`; the database account-link lifecycle is the sole fixed
schema-level caller. The repository boundary check rejects new direct product callers.

## Event contract

Event version 1 records:

- event type and outcome (`attempted`, `succeeded`, `denied`, or `failed`);
- Tenant, education organization, and School context;
- actor Account, Person, actor type, and optional support grant;
- capability, policy version, and a minimized Policy Decision reference;
- request, correlation, causation, and pre-operation receipt identifiers;
- target type and opaque target identifier;
- data classes, redacted change summary, coded purpose, source, retention class, and legal hold;
- occurrence/creation timestamps and a database-computed SHA-256 content hash.

Schema-version rollback may select the last reader-compatible event version. It may never disable
required audit, rewrite committed events, or remove evidence created by the newer version.

## Redaction and classification

`sanitizeAuditChangeSummary` is default-deny. Value-bearing `before` and `after` fields require an
event-specific allowlist. Health, safeguarding, and credential-class events cannot contain any
generic before/after values; they may record safe field labels only. Student events currently allow
only School ID and status values. Account-link events use fixed status/version labels without raw
credential values.

New event types must add tests before receiving a value allowlist. Free-form reasons belong in a
purpose-built, access-controlled evidence record, not the generic change summary.

## Durable outbox

The outbox stores only an event reference, minimized delivery payload, Tenant/request/correlation
context, topic, and deduplication key. Its database-computed payload hash covers those immutable
anchors.

Allowed state transitions are:

```text
pending -> processing -> published
                     -> failed -> processing
                     -> dead_letter
```

Claims use `FOR UPDATE SKIP LOCKED`. Every claim increments the attempt count. Completion is
idempotent after `published`; retries retain the original event, Tenant, request, correlation,
payload, and hash. An invalid transition or anchor change raises SQLSTATE `55000`.

## Partition, retention, legal hold, and archive procedure

`audit_events` is range-partitioned on `occurred_at` with a current quarterly partition and a
default safety partition. Operations must create the next partition before each quarter and alert
on any rows entering the default partition.

Retention class is a routing label, not an authorization to delete. Before production, qualified
privacy/legal owners must approve jurisdiction-specific schedules for operational, security,
financial, and safeguarding evidence. `legal_hold=true` and the `legal_hold` retention class always
override ordinary expiry.

A closed-partition archive job must:

1. refuse a partition containing held evidence unless the hold owner approves a non-destructive
   copy;
2. verify every content hash and compute the ordered batch root;
3. write encrypted evidence to a separately administered immutable store;
4. sign a manifest with a separately controlled key and append it to
   `audit_archive_manifests`, chaining the previous manifest hash;
5. reconcile source count, first/last hash, root, signature, and archive-location hash;
6. detach or remove local data only under an approved retention action and recoverable runbook.

The schema defines and protects the manifest contract. Provisioning the immutable store, signing
service, keys, alerts, and approved retention schedules remains a deployment go-live requirement.

## Proof and operations

- `bun test packages/audit/src/redaction.test.ts` proves default-deny redaction.
- `bun run audit:poc` proves atomic rollback, forced RLS/privileges, append-only triggers, hashes,
  Tenant isolation, denied/failed/support evidence, audited reads/exports, and outbox retry.
- Monitor pending/failed/dead-letter counts, oldest available row, publish latency, default-partition
  occupancy, hash/manifest reconciliation, read/export volume, and evidence-write failures.
- Required mutation failure caused by audit unavailability is an availability incident, not a
  reason to bypass the ledger.
