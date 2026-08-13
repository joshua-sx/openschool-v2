# Architecture decision records

ADRs in this directory govern M1 tenant-security implementation. `Accepted` means implementation may proceed within the stated consequences; it does not mean production readiness or legal/privacy approval.

| ADR | Decision | Status | Owner |
| --- | --- | --- | --- |
| [0001](./0001-tenant-isolation-and-placement.md) | Tenant isolation and deployment placement | Accepted | Platform Architecture |
| [0002](./0002-education-organization-hierarchy.md) | Education Organization hierarchy and School scope | Accepted | Product Architecture |
| [0003](./0003-person-account-and-affiliations.md) | Person, Account, and effective-dated access | Accepted | Identity Engineering |
| [0004](./0004-request-context-and-session-verification.md) | Tenant Request Context and session verification | Accepted | Identity Engineering |
| [0005](./0005-capability-authorization.md) | Capability authorization and Policy Decisions | Accepted | Security Engineering |
| [0006](./0006-database-execution-and-rls.md) | Direct Drizzle execution with transaction-scoped RLS | Accepted | Data Platform |
| [0007](./0007-audit-and-privileged-operations.md) | Atomic audit and privileged operation evidence | Accepted | Security Engineering |
| [0008](./0008-invitations-mfa-and-support-access.md) | Onboarding, MFA, support, and session lifecycle | Accepted | Identity Engineering |
| [0009](./0009-controlled-person-merge.md) | Controlled duplicate Person merge | Accepted | Identity Engineering |

Changes that contradict an accepted ADR require a new ADR that explicitly supersedes it. The historical notes in the root `DECISIONS.md` are non-governing where they conflict with these records.
