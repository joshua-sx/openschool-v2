# Guardian and emergency contact operating contract

This contract defines the #115 learner-contact slice. It is a pre-production capability and does
not authorize real school data.

## Domain model

- A contact is a Tenant-scoped **Person**. An **Account** and **Account Link** are optional.
- A **Relationship** links that Person to one learner as `parent_of`, `guardian_of`, or
  `emergency_contact_of`. One Person may have effective relationships to multiple learners in the
  same Tenant.
- Relationship type, legal authority, decision authority, emergency priority, pickup authority,
  and portal eligibility are independent facts. Emergency contacts cannot be portal eligible.
- Contact method and phone belong to the contact profile. Relationship powers belong to the
  effective-dated relationship. Shared Person identity is not silently edited from one learner.
- Ending a relationship revokes and closes it; ordinary workflows do not delete history.

Creating a Person or Relationship never creates an Account, invitation, affiliation, or role.
Invitation remains a separate privileged workflow. A parent/guardian relationship contributes to
portal context only while it is current, active, and explicitly portal eligible; a current Account
Link and parent role are still required.

## Authorization and database execution

`tenant.guardian_contacts.read` and `tenant.guardian_contacts.manage` use the existing Tenant,
Organization subtree, and School scopes. Management requires AAL2 and atomic audit obligations.
The service verifies the exact Policy Decision and binds every query to its constraints.

`person_relationships` and `contact_profiles` enable and force RLS. Normal runtime writes are
denied. Three functions in `openschool_private` perform create, update, and end operations under the
dedicated `openschool_guardian_contact_manager` role. That role is `NOLOGIN`, `NOINHERIT`,
`NOBYPASSRLS`, owns no broad application credential, receives only the table/column privileges the
functions require, and cannot be assumed by runtime, worker, or control-plane logins. Functions:

- require the runtime session, exact capability, AAL2, Account/Tenant/request context, and a
  canonical learner in the approved scope;
- use a fixed empty catalog search path and schema-qualified objects;
- expose execution only to the runtime role after revoking `PUBLIC`;
- preserve forced RLS through the narrow function owner rather than a superuser/schema owner; and
- increment a linked Account's membership version whenever portal authorization is enabled,
  disabled, or ended.

The UI presents operational contact details separately from legal/decision powers and portal or
invitation eligibility. Duplicate matching is Tenant- and scope-local, suggestive only, and never
automatically merges People.

## Audit, privacy, and errors

Successful creation, material permission changes, portal-eligibility changes, and relationship end
commit an Audit Event and outbox row in the same transaction. Change summaries contain allowlisted
field names and safeguarding classification, not names, email addresses, phone numbers, or record
snapshots. Failed and denied privileged attempts use the existing durable attempt path.

Valid sibling-School, cross-Tenant, unavailable Person, and unavailable learner targets return the
same non-enumerating resource shape. Validation errors remain distinguishable from authorization
errors.

## Evidence and rollback

`guardian:contacts-poc` runs through the real non-owner runtime role on disposable PostgreSQL. It
proves Account-optional creation, independent facts, scoped duplicate suggestions, explicit reuse,
sibling/cross-Tenant denial, direct-write denial, portal-only guardian context, immediate
membership invalidation, retained history, and redacted atomic audit/outbox evidence. The proof is
part of the automated Tenant Isolation Matrix.

Policy bundle `2026-08-03.v5` is the accepted rollback before guardian-contact capabilities. A
rollback may disable the new workflow and select that bundle, but it must retain relationships,
revocations, membership-version changes, and Audit evidence. Production remains NO-GO pending the
repository-wide launch gates and jurisdiction-specific safeguarding/privacy approval.
