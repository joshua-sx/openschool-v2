# OpenSchool Capability Status

**Last verified:** 2026-08-02
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
| Organization and school data model | Partial | [Education Organizations](../packages/db/src/schema/education-organizations.ts), [schools](../packages/db/src/schema/schools.ts), [hierarchy tests](../packages/db/src/organization-tree.test.ts) | Versioned hierarchy and effective School governance exist; placement expansion, forced RLS, and full isolation evidence remain incomplete |
| Accounts, People, and affiliations | Partial | [Identity schema](../packages/db/src/schema/identity.ts), [identity evidence](../packages/db/IDENTITY_FOUNDATION.md) | Staged legacy compatibility remains; invitations, lifecycle operations, merge UX, support access, and production approvals are incomplete |
| Tenant Request Context | Partial | [Tenant-context resolver](../packages/auth/src/tenant-request-context.ts), [contract](../packages/auth/TENANT_REQUEST_CONTEXT.md) | Verified session and explicit context selection exist; durable invalidation, production identity operations, RLS, and full isolation are not approved |
| Capability Policy Decisions | Partial | [Policy package](../packages/rbac), [focused tests](../packages/rbac/src/policy.test.ts), [contract](../packages/rbac/POLICY_DECISIONS.md) | Versioned decisions and application query constraints exist; non-owner forced RLS, atomic audit obligations, support provisioning, and full matrix evidence remain blocking |
| Basic student records | Preview | [Student pages](../apps/web/app/%28app%29/students), [router](../apps/web/src/server/routers/students.ts), [service](../apps/web/src/services/students.ts) | Limited fields and workflows; no production isolation, duplicate resolution, history, households, or complete enrollment lifecycle |
| Classes, enrollments, and grade schema | Partial | [Classes](../packages/db/src/schema/classes.ts), [enrollments](../packages/db/src/schema/enrollments.ts), [grades](../packages/db/src/schema/grades.ts) | Schema presence only; no complete supported gradebook or scheduling workflow |
| Audit helper | Partial | [Audit package](../packages/audit), [student service calls](../apps/web/src/services/students.ts) | Writes are not yet atomic with business mutations and coverage is incomplete |
| Repository quality gate | Preview | [Quality workflow](../.github/workflows/quality.yml), [workspace type configs](../tsconfig.base.json), [policy tests](../packages/rbac/src/policy.test.ts) | Covers build-time quality and targeted disposable-database proofs; it is not a security, performance, accessibility, compliance, or disaster-recovery certification |

## Not currently available

The following areas are planned and must not be described as working product features:

- admissions, applications, enrollment offers, and re-enrollment;
- full student information management, households, guardianship, contacts, and documents;
- attendance, absence workflows, corrections, safety notifications, and history;
- assessments, assignments, grade entry, gradebook, report cards, transcripts, and credits;
- academic years, terms, calendars, periods, courses, sections, rooms, and timetables;
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
