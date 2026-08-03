# Production go/no-go gate

OpenSchool remains **NO-GO** for real school data and users until every blocking item has accepted evidence. A checked code task is not a compliance certification or customer launch approval.

## Decision record

| Field | Required value |
| --- | --- |
| Candidate version/commit | immutable release identifier |
| Target deployment and region | named environment and residency region |
| Customer profile | school types, scale, tenancy/placement, integrations |
| Launch jurisdiction(s) | explicitly named; cannot be inferred |
| Engineering approver | named person and timestamp |
| Security/privacy approver | named qualified person and timestamp |
| Operations/support approver | named person and timestamp |
| Legal/customer owner approval | named accountable human and timestamp |
| Decision | GO, CONDITIONAL GO with expiry, or NO-GO |

## A. Engineering and security evidence — blocking

- [ ] All production code uses verified Account identity; no authorization from unverified session data.
- [ ] Request Context and Policy Decision modules pass the complete positive/negative suite.
- [ ] Tenant schema, Organization Tree, Person/Account, affiliations, and relationships are migrated with rollback evidence.
- [ ] Every tenant table has reviewed forced RLS for named non-owner roles, `USING`/`WITH CHECK`, and tenant/scope indexes.
- [ ] The target Tenant Placement adapter is implemented and covered by the current threat model and complete Isolation Matrix; bridge/silo placement remains disabled until placement-specific evidence is accepted.
- [ ] Runtime startup/CI proves `NOBYPASSRLS`, non-ownership, least privilege, and no service-role credential.
- [ ] The [Isolation Matrix](./security/TENANT_ISOLATION_MATRIX.md) passes across API, query, DB, files, jobs, cache, search, import, export, analytics, and support paths.
- [ ] `bun run isolation:matrix-poc` records GO for the implemented M1 surface at the exact release commit; every disabled/evidence-only production path is either completed and added to the matrix or remains feature-disabled.
- [ ] Every privileged mutation and durable worker path uses the accepted atomic audit/outbox boundary; the first Student and Account Link integrations, immutable runtime boundary, and replay proof are complete.
- [ ] Audit partition maintenance runs daily, maintains at least 45 days of future coverage, pages on default occupancy or job failure, and has a successful target-environment recovery drill recorded under the [operations runbook](./operations/AUDIT_PARTITIONS.md).
- [ ] MFA, reauthentication, invitation, session revocation, support, and break-glass controls pass security tests.
- [ ] Threat model is reviewed after penetration test; all critical/high findings are closed or launch is blocked.
- [ ] Dependency, secret, artifact, image, CI, and deployment supply-chain controls pass.
- [ ] Encryption, key rotation, secret rotation, and credential compromise exercises pass.

## B. Privacy, safeguarding, and legal approval — blocking and jurisdiction-specific

- [ ] Launch jurisdictions, controller/processor roles, lawful bases, and contractual responsibilities are approved by qualified counsel/privacy leadership.
- [ ] Data inventory and classification cover student, family, staff, health, safeguarding, discipline, finance, communication, file, biometric, and analytics data actually enabled.
- [ ] Required impact assessments, parental/learner notices, consent where applicable, and data-subject/education-record rights workflows are approved and tested.
- [ ] Retention, deletion, legal hold, correction, transfer, and customer offboarding schedules are approved per data class and jurisdiction.
- [ ] Subprocessors, residency, international transfer, government access, and school contracts are approved.
- [ ] Safeguarding confidentiality, mandated reporting, emergency access, and restricted-note policies have named school/legal owners.
- [ ] Accessibility obligations and evidence for the target jurisdictions are accepted.
- [ ] No public FERPA, GDPR, COPPA, HIPAA, PCI, SOC, ISO, or jurisdiction-specific claim exceeds documented evidence and scope.

## C. Reliability and recovery evidence — blocking

- [ ] Service levels, RPO, RTO, maintenance windows, support hours, and capacity assumptions are approved.
- [ ] Encrypted backup and point-in-time recovery are enabled; full and tenant-specific restoration drills meet approved RPO/RTO.
- [ ] Multi-AZ/region failure modes, provider outages, queue replay, idempotency, data reconciliation, and degraded operation are tested.
- [ ] Monitoring covers authentication, cross-tenant denials, privileged actions, RLS/policy errors, audit lag, export volume, backup health, saturation, and customer-impact symptoms.
- [ ] Alert ownership, escalation, incident command, evidence preservation, customer/legal notification, and post-incident review are exercised.
- [ ] Capacity/load tests use high-school scheduling/reporting peaks and national hierarchy/query shapes where applicable.

## D. Customer operations and product readiness — blocking

- [ ] Admissions/enrollment or approved import provisions authoritative People, Accounts, affiliations, academic structure, and guardians without manual database work.
- [ ] School-year rollover, transfers, withdrawal, graduation, staff departure, account recovery, and tenant offboarding are tested end to end.
- [ ] Admin, teacher, guardian, and student experiences meet accessibility and usability acceptance criteria for enabled modules.
- [ ] Data migration validation, reconciliation, customer sign-off, rollback, and deletion of staging copies are documented.
- [ ] Support runbooks, permission model documentation, training, status communication, release notes, and customer escalation are ready.
- [ ] Feature flags and capability status prevent access to incomplete modules and keep public claims truthful.

## E. Pre-launch and post-launch controls

- [ ] Production change freeze begins after accepted rehearsal.
- [ ] Final secrets/configuration/domain/email/redirect/backup/monitoring checks pass in the target environment.
- [ ] Launch roster and Tenant placement are reconciled against contract and migration approval.
- [ ] Conditional approvals have explicit owner, expiry, compensating control, and rollback trigger.
- [ ] First-day and first-week observation plans name on-call owners and decision thresholds.
- [ ] A failed blocking check automatically records NO-GO; only the accountable approvers above may change it after evidence is supplied.

## Current status

NO-GO. The [internal M1 tenant-security review](./security/M1_SECURITY_REVIEW.md) closes the pre-production engineering milestone with no open Critical or High finding, but it is not independent or target-environment production evidence. The M0 repository foundation plus the implemented M1 Tenant, identity, policy, non-owner database, first forced-RLS School/Student, atomic Audit Ledger, privileged identity/support, partition, and continuously enforced Isolation Matrix surfaces are not sufficient production evidence. Files, search, import, general export/report delivery, and analytics remain disabled; backup/restore is an evidence-only disposable drill. Invitation delivery, provider MFA deletion, support notifications, and support/partition scheduled jobs still need production-provider rehearsal, deployed monitoring, named paging ownership, and recorded drills. Forced RLS for every future Tenant table/path, production credentials, independently administered audit archival/signing, remaining privileged mutation integrations, durable cross-node invalidation, production backup/recovery, independent security review, and jurisdiction-specific approvals remain blocking.
