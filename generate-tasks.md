OpenSchool — Task Breakdown (From PRD)
Structure

Epics = major product areas

Tasks = concrete, testable pieces of work

Ordered roughly in build sequence, not importance

EPIC 1 — Foundation & System Setup

Goal: Establish the core structure every other feature depends on.

Define system roles (Admin, Teacher, Parent)

Define permission rules per role

Create school entity (name, academic year, terms)

Create class / homeroom entity

Assign teachers to classes

Assign students to classes

Implement audit logging for critical actions

Define system-wide status states (active, archived, read-only)

EPIC 2 — Student Records (SIS-lite)

Goal: Create a single source of truth for student data.

Create student profile structure (basic fields only)

Create household / guardian linkage

Enforce required student fields

Implement duplicate detection rules

Add admin flow to resolve duplicates

Track student status changes (enrolled, withdrawn, graduated)

Prevent deletion of active student records

Add read-only historical student views

EPIC 3 — Attendance & Safety

Goal: Enable fast, reliable daily attendance with parent notification.

Create daily attendance model

Create teacher attendance entry screen

Support Present / Absent / Tardy states

Allow attendance corrections with audit trail

Display attendance history per student

Trigger parent notification for absences

Add admin overview of daily attendance completion

Block day closure if attendance is incomplete (warning only)

EPIC 4 — Gradebook & Report Cards

Goal: Allow schools to record grades and generate reports without spreadsheets.

Define grading scales (letter, numeric)

Create grade entry flow for teachers

Allow bulk grade entry

Lock grades after reporting period ends

Define report card template structure

Generate report cards from stored grades

Allow admin review before release

Allow parent read-only access to report cards

Preserve report cards as immutable records

EPIC 5 — Scheduling (Simple, Primary-First)

Goal: Make schedules clear and conflict-free without complexity.

Create class-level schedule model

Assign teachers to scheduled classes

Display schedules to teachers (read-only)

Display schedules to parents (read-only)

Detect basic scheduling conflicts

Warn admin of conflicts before publishing

Lock published schedules

EPIC 6 — Official Communication

Goal: Replace fragmented messaging with one trusted channel.

Create announcement model

Allow school-wide announcements

Allow class-level announcements

Deliver announcements via app + email

Track read / seen status

Preserve announcement history

Restrict announcement permissions by role

EPIC 7 — Onboarding & CSV Import (Phase 2 Priority)

Goal: Enable same-day onboarding with minimal friction.

Design CSV templates for students

Design CSV templates for staff

Design CSV templates for classes

Build CSV upload flow

Implement column mapping

Validate CSV data before import

Show clear error messages for invalid rows

Support partial imports

Prevent duplicate creation during import

Allow safe re-imports

Add onboarding progress checklist

EPIC 8 — Compliance & Reporting (Phase 2)

Goal: Reduce reporting stress and manual work.

Identify required compliance data fields

Generate attendance summary reports

Generate enrollment summary reports

Highlight missing or invalid data

Add compliance deadline reminders

Allow one-click export of reports

Preserve exported reports for audit reference

EPIC 9 — Academic Year Continuity (Phase 3)

Goal: Support multi-year use without rebuilding data.

Create academic year rollover flow

Advance students to next grade

Archive graduated students

Lock previous academic years as read-only

Preserve historical attendance and grades

Allow viewing past years without editing

EPIC 10 — Approvals & Accountability (Phase 3)

Goal: Make responsibility clear and mistakes rare.

Add approval flow for grade finalization

Add approval flow for schedule publication

Restrict edits after approval

Track approver identity and timestamp

Show pending approvals to admins

EPIC 11 — Parent & Student Self-Service (Phase 3)

Goal: Reduce admin questions through controlled access.

Allow parents to view schedules

Allow parents to view attendance history

Allow parents to view report cards

Allow download of official documents

Display clear contact guidance for support

EPIC 12 — Stability & Longevity (Phase 4)

Goal: Make OpenSchool dependable for years.

Implement long-term data retention rules

Enforce immutability of archived records

Support full data export at any time

Add read-only mode for system outages

Validate data integrity periodically

Document system behavior guarantees

MVP Cut Line (Very Important)

MVP ends at Task 47.
Everything after that is Phase-based and only starts when adoption is proven.