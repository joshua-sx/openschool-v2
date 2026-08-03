# Platform Tenant lifecycle control plane

This runbook covers the platform portion of story #101: global platform access, Tenant suspension/reactivation, immediate request and worker denial, and atomic audit/invalidation evidence. It does not grant support access to school records. The separately merged story #102 path still requires a Tenant-approved, purpose-bound grant for every support operation.

## Security boundary

Platform Tenant lifecycle operations require all of the following at the same time:

1. a Supabase token accepted by the verified-claims adapter;
2. a canonical active Account and Account Session registered through the ordinary identity-bootstrap role;
3. one current, non-overlapping, maximum-90-day `platform_access_grants` record;
4. the `super_admin` Role Template loaded from that global store, never from a Tenant Affiliation;
5. signed `aal2` assurance and interactive reauthentication no more than 15 minutes old;
6. an allowed `platform.tenants.manage` Policy Decision with exactly the `platform` query constraint;
7. the isolated `openschool_control_plane` connection, which has no direct table privileges;
8. live Account, session, grant, and Tenant revalidation inside the mutation transaction; and
9. a Tenant update, platform Audit event, and `security.context.invalidate` outbox row that all commit or all roll back.

Tenant and organization administrators cannot call this path. The runtime and worker roles cannot execute its private functions. Conversely, `super_admin` has no Tenant Person and no implicit School, Student, file, search, export, or analytics access.

## Database authorities

| Identity | Login | Direct product tables | Private authority |
| --- | --- | --- | --- |
| `openschool_control_plane` | yes | none | execute the two reviewed platform functions |
| `openschool_platform_access_resolver` | no | read Account/session/grant anchors | own `resolve_platform_access()` |
| `openschool_tenant_lifecycle_manager` | no | narrow locked reads, Tenant status update, platform audit/outbox inserts | own `apply_tenant_lifecycle(...)` |

Neither private owner can log in, bypass RLS, create roles/databases, or be assumed by an application login. Migration ownership remains separate.

## Access-grant lifecycle

Platform grants are global Account authority, not Tenant memberships. They are half-open effective periods with a hard 90-day maximum. A GiST exclusion constraint rejects overlapping active grants for the same Account, including future schedules. Account, role, time window, issuer, and issuance evidence are immutable; an active grant may only become terminally revoked with timestamp, actor, and reason.

The current release deliberately provides no self-service grant-issuance endpoint. Production bootstrap and renewal must be performed through a reviewed migration/operations change with:

- a pre-existing, identity-proofed active Account;
- two-person approval and a ticket/change reference in `issuance_reason`;
- the least role and shortest validity period required;
- a second operator verifying the resulting row and Account identity;
- an expiry alert before `valid_until`; and
- prompt terminal revocation when duties end or credentials are suspected.

An expired or revoked grant is rejected on the next control-plane transaction. Revoking a platform grant does not alter any Tenant data or create a Tenant relationship.

## Tenant suspension semantics

`platform.suspendTenant` changes `active` to `suspended`; `platform.reactivateTenant` changes `suspended` to `active`. Archived Tenants are terminal and cannot be reactivated through this seam. Every request requires a 3–512 character operational reason.

Runtime and worker transactions call `openschool_private.resolve_tenant_admission_status`, whose dedicated `NOLOGIN` owner acquires a shared lock on the canonical Tenant row and returns only its status. Neither execution role receives Tenant update authority. Suspension takes the conflicting update lock. Work already admitted is allowed to finish, suspension waits for it, and every transaction beginning after the suspension commit receives `TENANT_SUSPENDED` before reading or mutating product data. Placement state is not repurposed: Tenant lifecycle and infrastructure placement remain independent controls.

A Tenant suspension does not increment Account security versions because an Account may belong to other Tenants. Tenant status is the authoritative revocation anchor; unaffected Tenants continue operating.

## Operator error contract

| Code | Meaning | Operator action |
| --- | --- | --- |
| `PLATFORM_ACCESS_DENIED` | no current platform grant or canonical Account/session | verify the Account and approved grant; do not create a Tenant role workaround |
| `SESSION_REVOKED` | the Account Session is no longer active | sign in again from a new verified session |
| `ACCOUNT_DISABLED` | the operator Account is disabled | escalate to Account recovery; do not reissue a platform grant |
| `MFA_REQUIRED` | current verified token is below `aal2` | complete MFA |
| `REAUTHENTICATION_REQUIRED` | interactive proof is missing or older than 15 minutes | reauthenticate and retry |
| `SECURITY_CONTEXT_STALE` | Account, session, security version, or platform grant changed | reload from a new verified context |
| `TENANT_UNAVAILABLE` | Tenant is missing or archived | verify the target; archived recovery requires a separate approved process |
| `TENANT_STATUS_CONFLICT` | requested transition does not match current status | refresh and choose the correct operation |
| `TENANT_LIFECYCLE_CHANGE_FAILED` | atomic internal operation failed | retry once, then escalate with the request ID |

Raw PostgreSQL details are never returned to the operator. A failed audit or outbox insert rolls the status change back.

## Verification

The proof is destructive and accepts only an explicitly opted-in loopback database after migrations, seed data, and final role grants:

```bash
ALLOW_PLATFORM_TENANT_LIFECYCLE_POC=true bun run platform:tenant-lifecycle-poc
```

It proves login/table/function privilege separation, AAL1 denial, stale-reauthentication denial, immediate platform-grant revocation, in-flight lock ordering, post-commit runtime and worker denial, unaffected-Tenant continuity, audit/outbox evidence, induced outbox-failure rollback, and reactivation. Cleanup is best-effort across every resource: it terminally revokes the synthetic grant and disables the synthetic Account so append-only audit attribution remains intact, then reports any incomplete cleanup as a combined failure.

## Operational checklist

- [ ] Control-plane credentials are stored separately from runtime, worker, migration, backup, and provider-admin credentials.
- [ ] At least two identity-proofed operators have separately expiring grants; no shared Account is used.
- [ ] Grant expiry and Tenant suspension events alert the named security/operations owners.
- [ ] `security.context.invalidate` publishing meets the approved latency target across every node and worker.
- [ ] Suspension/reactivation, provider outage, database lock contention, stale context, and outbox failure drills pass in the target environment.
- [ ] Audit review reconciles every lifecycle event with its change ticket and invalidation delivery.
- [x] Story #102 support/break-glass has separate Tenant approval, purpose, expiry, notification, audit, and Isolation Matrix evidence; target-environment operations remain a production gate.

Rollback may hide the platform UI or pause new lifecycle operations. It must not grant direct table access, weaken MFA/recent-auth checks, revive expired grants, ignore Tenant status, or delete audit evidence.
