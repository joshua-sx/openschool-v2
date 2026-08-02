# ADR-0007: Atomic audit and privileged operation evidence

- Status: Accepted
- Date: 2026-08-02
- Owner: Security Engineering
- Governs: #68, mutations, exports, support, and audit storage

## Context

Current audit writes are fire-and-forget, outside the business transaction, mutable like ordinary rows, and may copy full records containing sensitive data. A successful mutation can therefore have no audit evidence, while failed or denied privileged attempts are not represented.

## Decision

Security- and business-relevant mutations write an Audit Event in the same database transaction as state change. If required audit evidence cannot be written, the mutation fails. Read, export, notification, and job evidence may use a durable outbox, but the outbox record is committed atomically with the initiating action.

Security-relevant reads and every export, notification campaign, privileged job, migration, backup, restore, support, or break-glass operation require durable pre-operation intent before protected data or side effects are released. The intent records authorization, scope, purpose, actor, correlation identifier, and expected operation; completion/failure evidence links to that receipt. If required evidence cannot be recorded, the operation fails closed. Migration, backup, restore, and break-glass evidence is also written to a separately administered append-only operational sink so restoring or replacing the tenant database cannot erase its own control evidence.

Audit Events include event/schema version, outcome, actor Account and Person, effective Tenant/organization/School, capability and Policy Decision, request/correlation identifiers, support/break-glass grant when present, target type/identifier, redacted change summary, purpose, timestamp, source, and pre-operation receipt/commit linkage. Sensitive values use allowlisted fields, classification-aware redaction, or hashes rather than whole-record snapshots.

The application role can append but cannot update or delete audit rows. Partitioning, retention, legal hold, archival, access reports, and cryptographic batch manifests provide tamper evidence. Audit readers require a dedicated capability and their reads are audited.

## Privileged actions

Access grants/revocations, invitations, MFA changes, Organization Tree edits, School transfers, exports, finance changes, retention actions, support access, break-glass use, policy changes, migration execution, and backup/restore operations require explicit privileged events.

## Options rejected

- **Fire-and-forget application insert:** permits successful unaudited mutations.
- **Database trigger for all meaning:** sees row changes but not purpose, policy decision, or cross-row business action.
- **Full before/after records:** duplicates sensitive data and complicates erasure/retention obligations.
- **Audit administrator can edit records:** defeats evidentiary value.

## Consequences

Mutation modules own business change and audit intent together; append implementation and retention remain deep behind the audit interface. Audit unavailability becomes a visible operational failure and blocks required access/operations. The tenant audit ledger and independently administered operational sink both need capacity, reconciliation, retention, restore, and alerting plans.

## Migration path and rollback

Introduce versioned events and a transactional writer, migrate highest-risk mutations first, then remove asynchronous logging. Rollback may switch event schema versions but cannot disable required audit or delete committed evidence.
