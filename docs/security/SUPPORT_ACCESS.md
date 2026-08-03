# Tenant-approved support and break-glass access

OpenSchool support operators never receive an ordinary Tenant Person, Affiliation, or administrator role. Diagnostic access is a separate, short-lived security boundary whose authority is the intersection of a current platform role, a current Support Grant, a bound MFA session, one exact Tenant scope, an allowed read capability, and a declared purpose.

## Access models

| Model | Who opens it | Maximum duration | Purpose | Review |
| --- | --- | --- | --- | --- |
| Tenant-approved support | Organization or School administrator with MFA and recent reauthentication | 8 hours | Customer support or incident response | Required after close, revoke, or expiry |
| Break glass | Dedicated `break_glass_operator` through the isolated control plane | 30 minutes | Incident response only, with ticket and emergency-rule reference | Required after close or expiry |

The grant scope is exactly one Tenant, Education Organization subtree, or School. It can allow only read-only School and Student diagnostics. A grant cannot expand to ordinary administrative capabilities, exports, files, health, safeguarding, finance, discipline, or messaging data.

## Enforcement boundary

Migration `0026_tiresome_grey_gargoyle` installs forced-RLS grant, notification, and outbox tables plus dedicated `NOLOGIN`, `NOBYPASSRLS` function-owner roles. Runtime and control-plane logins have no direct grant-table mutation authority. The worker login can expire grants and deliver notifications only under matching transaction-local job types.

Every diagnostic operation revalidates all of the following in one runtime transaction:

1. verified Supabase Account identity, AAL2, recent interactive reauthentication, current Account security version, and live Account Session;
2. active `support_agent` or `break_glass_operator` platform grant;
3. active Tenant and non-expired Support Grant;
4. matching support Account and the Account Session to which first use bound the grant;
5. requested read capability and the exact stored query constraint.

The resolver records a Tenant-visible `opened`/`used` notification and an immutable audit intent before the protected query executes. Close, Tenant revocation, worker expiry, Account/session revocation, platform-role revocation, and Tenant suspension all deny the next operation without waiting for token expiry.

## Operator workflow

Tenant administrators use `/settings/support-access` to approve, inspect, revoke, and review grants and to see the Tenant notification history. The form requires the support Account UUID supplied through the controlled support roster; production operations must verify that roster out of band before approval.

Support operators use `/support`. The page keeps a persistent access indicator visible while diagnostic results are shown, including purpose, expiry, grant ID, and whether the session is ordinary support or break glass. Closing a session is explicit and immediately invalidates it.

Emergency access requires a separately assigned `break_glass_operator` platform role and must follow the organization's incident runbook. It is not a fallback for missing Tenant approval during routine support.

## Background work and notifications

The worker service must schedule these Tenant-partitioned jobs:

- `support_access_expiry`: call `processSupportAccessExpiry` frequently enough to meet the approved revocation objective;
- `support_notification_delivery`: call `processSupportNotificationDelivery` with an idempotent email, SMS, or webhook adapter.

The in-app notification record is the durable source of truth. External delivery has bounded exponential retry, lease recovery, and dead-letter evidence, but this repository intentionally does not choose or configure a production channel provider. Deployment is blocked until a provider, recipient-resolution policy, scheduler, monitoring, and alert owner are approved and rehearsed.

## Verification

CI runs the loopback-only PostgreSQL proof after migration, seed, and least-privilege role provisioning:

```bash
ALLOW_SUPPORT_ACCESS_POC=true bun run support:access-poc
```

The proof covers Tenant approval, exact School scope, cross-Tenant denial, single-session binding, support close, Tenant revocation, mandatory review, separate break-glass authority, worker expiry, audit evidence, and notification/outbox evidence. It refuses any non-loopback database and must never run against shared or production data.

## Rollback and incident response

To stop new access, remove the relevant platform grants and disable the support entry points. Revoke or expire every live Support Grant and preserve its audit, notification, and review evidence. Do not roll back by dropping the tables, weakening forced RLS, deleting audit evidence, or converting operators into Tenant administrators.

If misuse is suspected, suspend the platform Account/session first, revoke affected grants, preserve logs and outbox evidence, notify the Tenant under the approved incident process, and complete the mandatory review with an `incident` or `control_gap` outcome.
