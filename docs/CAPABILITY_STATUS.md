# OpenSchool Capability Status

**Last verified:** 2026-08-03
**Product stage:** Pre-production development preview

This document is the evidence source for public capability claims. A schema or placeholder does not count as an operational feature. A capability is marked available only when a user-facing workflow exists and the repository contains supporting implementation evidence.

## Status definitions

- **Preview:** A narrow workflow can be exercised locally, but it is not approved for real school data.
- **Partial:** Some schema or code exists, but the workflow, isolation, integrity, or UX is incomplete.
- **Planned:** No supported user workflow exists.
- **Blocked:** Work requires a governing architecture, security, privacy, or product decision.

## Current evidence

| Capability | Status | Evidence | Limits |
|---|---|---|---|
| Marketing and authentication routes | Preview | [Marketing routes](../apps/web/app/%28marketing%29), [auth routes](../apps/web/app/auth) | No supported customer onboarding or tenant provisioning |
| Organization and school data model | Partial | [Education Organizations](../packages/db/src/schema/education-organizations.ts), [schools](../packages/db/src/schema/schools.ts), [hierarchy tests](../packages/db/src/organization-tree.test.ts), [first forced-RLS slice](../packages/db/STUDENT_RLS.md) | Versioned hierarchy, effective School governance, pooled placement, and the implemented M1 isolation gate exist; bridge/silo placements and full school workflows remain incomplete |
| Accounts, People, and affiliations | Partial | [Identity schema](../packages/db/src/schema/identity.ts), [identity evidence](../packages/db/IDENTITY_FOUNDATION.md) | Security-shaped invitations, MFA/revocation, platform lifecycle, and support access exist; staged legacy compatibility, human merge UX, target-provider operations, and production approvals remain incomplete |
| Tenant Request Context | Partial | [Tenant-context resolver](../packages/auth/src/tenant-request-context.ts), [contract](../packages/auth/TENANT_REQUEST_CONTEXT.md), [scoped bootstrap](../packages/db/STUDENT_RLS.md) | Verified session, explicit selection, versioned cache keys, and Account/session invalidation operate through the first forced-RLS slice; deployed cross-node invalidation and production approval remain incomplete |
| Capability Policy Decisions | Partial | [Policy package](../packages/rbac), [focused tests](../packages/rbac/src/policy.test.ts), [contract](../packages/rbac/POLICY_DECISIONS.md) | Versioned decisions and database-bound query constraints govern the first slice, privileged identity, and support; every future module still needs its own reviewed capabilities and matrix evidence |
| Database execution boundary | Partial | [Transaction adapter](../packages/db/src/tenant-transaction.ts), [contract and evidence](../packages/db/DATABASE_EXECUTION.md), [CI proof](../packages/db/src/database-execution-poc.ts) | Distinct non-owner roles, first-slice forced RLS, and the implemented-surface matrix are proven; production infrastructure and every future module/worker path still require their own matrix evidence |
| Basic student records | Preview | [Student pages](../apps/web/app/%28app%29/students), [router](../apps/web/src/server/routers/students.ts), [canonical admission contract](../packages/db/CANONICAL_STUDENT_ADMISSION.md), [system proof](../apps/web/src/server/canonical-student-admission-poc.ts) | Canonical Person/Profile/current School Enrollment admission, update, list, and detail work locally with a measured legacy mirror; no applications, duplicate resolution, enrollment transitions/history, guardians, households, or production approval |
| Academic Years, Terms, and Learner Levels | Preview | [Admin workflow](../apps/web/app/%28app%29/settings/academic), [canonical contract](../packages/db/ACADEMIC_STRUCTURE.md), [system proof](../apps/web/src/server/academic-structure-poc.ts) | Authorized administrators can create, review, publish, and close immutable School-local structures; no periods, courses, sections, timetables, events, or production approval |
| Classes, enrollments, and grade schema | Partial | [Classes](../packages/db/src/schema/classes.ts), [enrollments](../packages/db/src/schema/enrollments.ts), [grades](../packages/db/src/schema/grades.ts) | Schema presence only; no complete supported gradebook or scheduling workflow |
| Audit Ledger foundation | Partial | [Audit contract](../packages/audit/AUDIT_LEDGER.md), [student service calls](../apps/web/src/services/students.ts), [partition runbook](./operations/AUDIT_PARTITIONS.md) | First privileged mutations, reads/exports, durable outbox, immutability, and partition lifecycle are atomic/proven; complete mutation coverage, independent archive/signing, retention approval, and deployed operations remain incomplete |
| Tenant isolation evidence | Preview | [Matrix](./security/TENANT_ISOLATION_MATRIX.md), [gate](./security/ISOLATION_GATE.md), [machine-readable registry](../packages/isolation/src/matrix.ts) | Implemented surfaces run through actual identities/adapters; unbuilt paths are disabled and production/legal/operations approval remains NO-GO |
| Repository quality gate | Preview | [Quality workflow](../.github/workflows/quality.yml), [workspace type configs](../tsconfig.base.json), [Isolation Matrix gate](./security/ISOLATION_GATE.md) | Covers build-time quality and guarded disposable-database system proofs; it is not a penetration test, accessibility/compliance certification, or production disaster-recovery approval |

## Not currently available

The following areas are planned and must not be described as working product features:

- application intake, enrollment offers, re-enrollment, waitlists, and multi-stage admissions;
- full student information management, households, guardianship, contacts, and documents;
- attendance, absence workflows, corrections, safety notifications, and history;
- assessments, assignments, grade entry, gradebook, report cards, transcripts, and credits;
- calendars, periods, courses, sections, rooms, and timetables beyond the preview Academic Year/Term/Learner Level structure;
- parent, student, teacher, staff, and organization-level portals;
- announcements, messaging, email/SMS/push delivery, and notification preferences;
- behavior, discipline, safeguarding, health, medication, accommodations, and student support;
- fees, tuition, invoicing, payments, refunds, and finance reconciliation;
- file storage, official records, e-signatures, retention, and malware scanning;
- operational analytics, statutory/government reporting, EMIS, imports, exports, APIs, webhooks, SSO, OneRoster, and Ed-Fi;
- native mobile applications, offline operation, and a supported production deployment.

## Security, privacy, and compliance

OpenSchool is not certified or represented as compliant with FERPA, GDPR, or any jurisdiction-specific education, privacy, accessibility, finance, health, safeguarding, or records law. The repository must not be used with real school data until tenant isolation, authentication, authorization, RLS, audit integrity, recovery, retention, incident response, and customer operations have been independently reviewed and approved for a selected jurisdiction.

## Commercial status

No free trial, paid plan, customer support package, service level, implementation service, or production hosting offer is currently published. No customer adoption count, testimonial, logo, outcome, or savings claim is retained without evidence.

## Maintenance rule

Any pull request that adds or removes a user-facing capability must update this file and link the implementation evidence. Marketing, README, sales, security, compliance, pricing, and adoption claims must remain consistent with this status.
