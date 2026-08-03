# Privileged MFA and identity revocation

This runbook covers the Tenant-administrator portion of story #101: recent-authentication evidence, self-service TOTP, Account and session lifecycle controls, Affiliation and role revocation, audit evidence, and local access invalidation. Platform Tenant suspension is governed separately by [Platform Tenant lifecycle control plane](./PLATFORM_TENANT_LIFECYCLE.md). Neither path authorizes support access.

## Security boundary

Privileged Account operations require all of the following at the same time:

1. a Supabase access token whose signature and standard claims pass `getClaims()`;
2. signed `aal2` assurance plus an interactive non-refresh AMR timestamp no more than 15 minutes old;
3. the canonical active OpenSchool Account, Account Session, Account Link, Person, Tenant, Affiliation, Role Template, organization/school scope, membership version, and security version;
4. an allowed `tenant.accounts.manage` Policy Decision with its current version and query constraints;
5. a runtime database transaction carrying exactly the same context and policy evidence;
6. successful mutation, Audit Ledger insert, and `security.context.invalidate` outbox insert in one transaction.

The application runtime does not receive direct update privileges on Accounts, sessions, Affiliations, or role assignments. It can execute only `openschool_private.apply_identity_revocation`. That `SECURITY DEFINER` function is owned by the fixed `openschool_identity_revoker` role, which is `NOLOGIN`, `NOSUPERUSER`, and `NOBYPASSRLS`. The function revalidates the live actor session and target scope before applying one named transition.

## Supported operations

| Operation | Local effect | Version invalidation | Provider effect |
| --- | --- | --- | --- |
| Revoke one session | marks one active session revoked with evidence | session status | none |
| Revoke all sessions | revokes active sessions | increments Account security version | none |
| Disable Account | disables Account and revokes active sessions | increments Account security version | none |
| Reset MFA | revokes active sessions before provider work | increments Account security version | deletes current Supabase factors after commit |
| Revoke Affiliation | revokes its active role assignments and the Affiliation | increments linked Account membership version | none |
| Revoke role | revokes one current role assignment | increments linked Account membership version | none |

Account-wide actions fail closed when the target Account has another active Tenant link. A Tenant administrator cannot disable a shared identity or reset its global MFA on behalf of another Tenant. Account self-disable is also denied. Affiliation and role operations are limited to the administrator's approved organization subtree or School scope.

Refresh tokens and JWT role metadata cannot restore access. Every request reloads the server-side Account, session, Tenant status, membership version, and security version. Session and Account security transitions are monotonic, and inactive session evidence is immutable.

## Administrator error contract

| Code | Meaning | Administrator action |
| --- | --- | --- |
| `MFA_REQUIRED` | no verified second factor | enroll and verify an authenticator |
| `REAUTHENTICATION_REQUIRED` | interactive proof is absent or older than 15 minutes | verify current password and TOTP in Account security |
| `SECURITY_CONTEXT_STALE` | membership, security, or session state changed | reload and retry from a new context |
| `SECURITY_TARGET_UNAVAILABLE` | target is missing or already inactive | refresh the target view |
| `SECURITY_TARGET_OUT_OF_SCOPE` | target is outside the allowed Tenant/scope or is shared across Tenants | use the correct delegated administrator or platform recovery process |
| `SELF_DISABLE_DENIED` | administrator attempted to disable the current Account | use a separate authorized administrator |
| `SECURITY_CHANGE_FAILED` | safe internal failure | retry once, then escalate with the request ID |

Failure details from PostgreSQL or Supabase are never returned to administrators. A denied or failed attempt receives separate audit evidence. If the success audit or invalidation outbox insert fails, the security mutation rolls back.

## MFA enrollment and recovery

The Account security page supports Supabase TOTP enrollment, QR and manual setup keys, six-digit verification, explicit factor removal confirmation, and recent password-plus-TOTP verification. Administrative routes remain unavailable at `aal1` even when the UI is bypassed.

Supabase does not provide recovery codes. Schools need a verified service-desk recovery procedure with two-person approval before production. Administrator MFA reset first invalidates all OpenSchool sessions and increments the Account security version; only then does it call the provider administration API. Provider factor deletion is idempotent. A provider outage returns a `pending` result while local access remains denied, and the security outbox records that reconciliation is required. Automated reconciliation and alerting are a production blocker; operators must not treat `pending` as completed recovery.

Passkeys are not part of this control because the current provider capability is experimental. They may be added behind the same assurance/session/version boundary after provider maturity, browser/device coverage, enrollment recovery, and accessibility are proven.

## Tenant suspension boundary

Tenant suspension now uses a separately credentialed control plane, global effective-dated access grants, a platform Policy Context with no Person, a narrow private lifecycle authority, and a platform Audit actor. Runtime and worker transactions recheck and lock current Tenant status before product work. Organization and School roles cannot cross into that control plane, and platform roles still receive no implicit Tenant data access. See the dedicated runbook for bootstrap, operation, proof, and rollback rules.

## Verification

Run unit and static checks normally. The PostgreSQL proof is destructive and accepts only an explicitly opted-in loopback database:

```bash
ALLOW_IDENTITY_REVOCATION_POC=true bun run identity:revocation-poc
```

The proof covers MFA and recent-login denials, rollback on a simulated audit failure, one/all session revocation, MFA reset adapter behavior, membership-version invalidation, stale-context denial, cross-Tenant Account denial, Account disablement, and durable invalidation outbox evidence. CI provisions the real runtime, worker, private-owner, and migration roles before running it.

## Operational checklist

- [ ] Supabase secret is isolated to server/worker deployments and has a tested rotation procedure.
- [ ] At least two factors and the approved service-desk recovery process are rehearsed for privileged operators.
- [ ] Provider MFA reconciliation consumes or alerts on pending `account.mfa` invalidations.
- [ ] Security invalidation publishing meets the approved latency objective across every application node.
- [ ] Audit failure, stale-context race, provider outage, and shared-Account recovery drills pass.
- [x] Platform Tenant suspension has a separate access store, database role, atomic lifecycle authority, and guarded real-role proof.
- [ ] Story #102 support/break-glass controls are complete.
- [ ] Accessibility testing covers keyboard, screen reader, zoom, mobile, and authenticator recovery flows.

Safe rollback may hide new MFA enrollment UI or pause new lifecycle operations. It must not weaken existing MFA/recent-auth obligations, re-enable direct runtime mutation, ignore local session/version state, delete audit evidence, or accept stale JWT authorization.
