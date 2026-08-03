# Invitation-only account onboarding

This runbook covers the first production-shaped onboarding slice. It does not make OpenSchool ready for real school users: privileged MFA and revocation (#101), support/break-glass access (#102), the full Isolation Matrix, operational recovery, and human legal/security approval remain blocking.

## Security model

An authorized organization or school administrator issues one invitation for an existing active Tenant `Person`. The approved affiliation, exact scope, and one Role Template are immutable after issuance. The invitation never authorizes a caller-selected Person, Tenant, School, Class, or role during acceptance.

The flow has four boundaries:

1. The capability Policy Decision and forced-RLS runtime transaction validate issuer, delegation, Tenant scope, Person, and expiry.
2. PostgreSQL stores a SHA-256 token hash. A delivery outbox temporarily stores an AES-256-GCM ciphertext bound to Tenant, invitation, and delivery IDs; it never stores plaintext.
3. A separately credentialed worker decrypts only a claimed delivery and asks the identity provider to send the verified-email link. The invitation credential travels in a URI fragment, so browsers do not send it in application request targets or access logs; the acceptance page removes the fragment immediately. Successful or terminal delivery erases the ciphertext, IV, tag, and key ID.
4. A verified identity invokes a private `SECURITY DEFINER` function owned by the `NOLOGIN`, `NOBYPASSRLS` `openschool_invitation_acceptor` role. The function locks the token row, verifies identity and lifecycle state, and atomically creates the Account if needed, Account Link, Affiliation, exact Role Template assignment, session anchor, invitation evidence, and redacted audit/outbox evidence.

Known-invitation theft, replay, expiry, cancellation, and Account-conflict denials create Tenant-scoped system audit evidence without storing the attempted email, provider subject, session identifier, or token. Random invalid tokens cannot be attributed to a Tenant and belong in aggregate security telemetry rather than a Tenant ledger.

## Supported invitation mappings

| Role Template | Required affiliation | Required scope |
| --- | --- | --- |
| `org_admin` | administrator | Education Organization |
| `org_viewer` | member | Education Organization |
| `school_admin` | administrator | School |
| `staff` | employee | School |
| `teacher` | teacher | Class |
| `parent` | guardian | School |
| `student` | student | School |

Organization administrators may delegate the listed Tenant roles within their selected Organization subtree. School administrators may delegate school administrator, staff, teacher, parent, and student roles only within their selected School. Issuance requires AAL2 because `tenant.accounts.invite` and `tenant.accounts.manage` carry the privileged MFA obligation.

## Required configuration

- `OPENSCHOOL_ALLOW_OPEN_SIGNUP=false` in every shared or production-like environment. Production ignores a `true` override and remains invitation-only.
- `INVITATION_TOKEN_ENCRYPTION_KEY_ID` names the active encryption key.
- `INVITATION_TOKEN_ENCRYPTION_KEYS` is a server/worker-only JSON keyring of key IDs to 32-byte base64url keys.
- `SUPABASE_SECRET_KEY` is available only to the delivery worker. Never expose it through a `NEXT_PUBLIC_` variable or application bundle.
- `NEXT_PUBLIC_APP_URL` is the exact application origin used in invitation redirects.
- Supabase Auth allows the exact `${NEXT_PUBLIC_APP_URL}/auth/callback` redirect. Production email templates, custom SMTP, sender authentication, bounce handling, and rate limits must be verified before launch.
- PostgreSQL role provisioning runs before migration so `openschool_runtime`, `openschool_worker`, and `openschool_invitation_acceptor` exist. The acceptor role must remain `NOLOGIN`, `NOSUPERUSER`, and `NOBYPASSRLS`.

Generate keys with an approved secret manager or cryptographically secure 32-byte generator. Do not place real key material in `.env.example`, source control, CI logs, tickets, or documentation.

## Delivery operation

Run `bun run invitation:deliver -- <tenant-id>` from a protected scheduler or worker deployment for each active Tenant. The command emits aggregate counts only. Schedule often enough to meet the approved email service objective and prevent concurrent duplicate schedulers for the same Tenant where practical; row leases and attempt fencing still protect concurrency.

The worker retries provider failures with bounded exponential delay and dead-letters after five attempts. Alert on:

- pending deliveries older than the email service objective;
- any `dead_letter` transition;
- repeated provider failures or rate limits;
- missing/unknown encryption key IDs;
- acceptance identity mismatches, replays, and conflicts above the approved baseline.

Dead-lettered invitations are not manually replayed because their encrypted credential has been erased. Cancel the invitation and issue a new one after correcting the delivery problem.

## Key rotation

1. Add the new key to `INVITATION_TOKEN_ENCRYPTION_KEYS` on every issuer and worker.
2. Change `INVITATION_TOKEN_ENCRYPTION_KEY_ID` to the new key and deploy issuers/workers together.
3. Keep old keys while any retryable delivery references them.
4. Confirm there are no `pending`, `processing`, or `failed` delivery rows for the old key.
5. Remove the old key and perform the documented secret-rotation verification.

If a key is suspected compromised, pause issuance, rotate immediately, cancel every pending invitation encrypted by the key, issue replacements, review acceptance/denial evidence, and follow the incident plan. Accepted or terminal invitations are single-use and their delivery ciphertext is already erased.

## Rollback and recovery

Safe rollback pauses issuance and delivery. It does not re-enable production open signup, delete invitation/audit evidence, unlink accepted Accounts, or weaken session and future revocation controls. A delivery provider outage leaves retryable ciphertext encrypted in the outbox. A database transaction failure rolls back the Account, link, affiliation, role, session, invitation transition, and success audit together.

The disposable proof is guarded by `ALLOW_INVITATION_ONBOARDING_POC=true` and loopback-only database URLs:

```bash
bun run invitation:onboarding-poc
```

It proves the non-login/non-bypass acceptor owner, forced-RLS issuance and delivery, encrypted-at-rest/erased-at-terminal credentials, success atomicity, redacted denial evidence, wrong-identity rejection, replay, cancellation, expiry, duplicate-pending prevention, cross-Tenant denial, and post-acceptance rollback.

## Operational launch checklist

- [ ] Open signup is disabled and verified from an external production session.
- [ ] Redirect allowlist, custom SMTP, sender domain, templates, expiry messaging, and bounce handling pass rehearsal.
- [ ] Encryption keys and Supabase secret are in the approved secret manager with rotation owners.
- [ ] The delivery scheduler, dead-letter alert, and provider outage drill pass.
- [ ] Administrator issue/cancel UX is implemented and accessibility-tested; the current backend API is not sufficient for customer launch.
- [ ] Invitee acceptance works on mobile, expired/cancelled/replayed links show safe generic recovery guidance, and URLs are scrubbed immediately.
- [ ] #101 and #102 are complete; invitation onboarding alone is not a privileged-identity launch approval.
