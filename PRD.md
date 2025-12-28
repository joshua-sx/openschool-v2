OpenSchool — Product Requirements Document (PRD)
1. Overview

OpenSchool is a School Operating System for K–12 schools that replaces fragmented tools like spreadsheets, paper, and messaging apps with one reliable system for daily school operations.

It is built for school administrators and teachers, with parents as secondary users. OpenSchool focuses on running a school safely, legally, and calmly — not on teaching content or learning management.

The product evolves in clear phases, starting with core daily operations and expanding toward long-term institutional reliability.

2. Problem Statement

Schools rely on too many disconnected tools to manage student records, attendance, grades, schedules, and communication. This fragmentation causes duplicate work, errors, missed communication, safety risks, and compliance stress.

Administrators spend significant time reconciling data instead of managing the school. Teachers rely on paper or spreadsheets because existing systems are slow or overbuilt. Parents receive inconsistent or late information.

Existing solutions fail because they prioritize feature breadth and sales demos over simple, reliable daily workflows.

3. Goals
User Goals

Keep accurate student records without duplication

Mark attendance and grades quickly and correctly

Know schedules and changes without confusion

Receive official communication from one trusted place

Product / Business Goals

Become the single source of truth for school operations

Replace shadow systems (Excel, WhatsApp, paper)

Enable fast onboarding and long-term retention

Scale without becoming bloated or fragile

4. Target User

Primary user: School Administrator / Registrar

Context:
Responsible for student records, schedules, reporting, and communication. Works under time pressure and legal constraints.

Main frustration:
Too much manual reconciliation across systems and too many mistakes caused by unclear or duplicated data.

5. Core User Stories

As an administrator, I want to set up my school quickly so we can start using the system the same day.

As a teacher, I want to mark attendance and enter grades in minutes so I can focus on teaching.

As an administrator, I want one correct student record so I don’t fix the same errors repeatedly.

As a parent, I want to receive clear, official updates from one place.

As an administrator, I want past records preserved so audits and year transitions are stress-free.

6. Functional Requirements
Phase 1 — Core Operations (MVP)

The system must maintain a single, authoritative student record.

The system must prevent or flag duplicate student entries.

The system must allow daily class-based attendance marking.

The system must notify parents automatically when a student is absent.

The system must allow teachers to enter basic grades.

The system must generate report cards from entered grades.

The system must allow administrators to define simple class schedules.

The system must provide a single official communication channel for announcements.

The system must enforce role-based access (admin, teacher, parent).

The system must work without spreadsheets, paper backups, or messaging apps.

Phase 2 — Adoption & Efficiency

The system must support CSV import for students, staff, parents, and classes.

The system must validate imported data and show clear errors.

The system must allow partial onboarding (e.g. students first).

The system must guide users through setup with a clear checklist.

The system must generate required compliance reports from existing data.

The system must track compliance deadlines and warn admins in advance.

The system must support optional secondary-school features (period attendance, credits).

The system must flag attendance or grade risks clearly and simply.

Phase 3 — Trust & Continuity

The system must support end-of-year rollover without rebuilding data.

The system must preserve historical records in read-only form.

The system must log who changed critical data and when.

The system must support approval flows for grades and schedules.

The system must allow parents and students to self-serve official records.

The system must summarize key operational risks without dashboards.

Phase 4 — Longevity & Infrastructure

The system must preserve long-term institutional memory.

The system must protect data integrity across years and staff changes.

The system must support safe recovery and read-only access during failures.

The system must provide predictable, stable behavior over time.

The system must allow schools to export their full data at any time.

7. Non-Goals (Out of Scope)

OpenSchool will NOT include:

Learning Management System (LMS) features

Homework, assignments, or content delivery

Payments or billing

Advanced analytics dashboards

Interoperability with external systems

Hyper-customizable workflows or schemas

8. UX & Interaction Notes

Speed is more important than flexibility

Common actions must take seconds, not minutes

Defaults are preferred over configuration

The system should guide users, not overwhelm them

Interfaces must work well on mobile for daily use

Errors must be explained clearly and immediately

9. Technical Constraints & Assumptions

Schools may have low technical maturity

Data quality from CSV imports may be inconsistent

Users may have limited training time

The system must tolerate incomplete data initially

Reliability is more important than feature richness

10. Success Criteria

OpenSchool is successful if:

Schools stop using Excel, paper, and WhatsApp for core workflows

Attendance and grades are entered consistently and on time

Administrators report reduced manual reconciliation

Parents rely on OpenSchool for official information

Schools continue using OpenSchool across academic years

11. Open Questions & Risks

Which regions’ compliance rules must be supported first?

How much historical data is required at onboarding?

What minimum data is required before daily use?

Risk of scope creep driven by feature requests

Risk of overengineering secondary-school complexity too early