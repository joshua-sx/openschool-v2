# OpenSchool Phase 1 Gap Analysis

**Date:** January 2025  
**Status:** Current Implementation vs. Requirements

This document provides a comprehensive gap analysis between what's currently implemented in the codebase and what's required for Phase 1 MVP.

---

## Executive Summary

**Overall Status:**
- **Foundation (EPIC 1):** ~70% implemented (needs verification and integration)
- **Student Records (EPIC 2):** ~40% implemented (schema exists, needs validation and UI)
- **Attendance (EPIC 3):** 0% implemented (new feature)
- **Gradebook (EPIC 4):** ~20% implemented (schema exists, needs business logic and UI)
- **Scheduling (EPIC 5):** 0% implemented (new feature)
- **Communication (EPIC 6):** 0% implemented (new feature)

**Key Finding:** The database schema and core infrastructure are largely in place, but business logic, validation, and UI layers are mostly missing.

---

## EPIC 1: Foundation & System Setup

### ✅ Implemented

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| System Roles | ✅ Done | `packages/rbac/roles.ts` | 7 roles defined (not 3 as originally planned) |
| Permission Matrix | ✅ Done | `packages/rbac/src/permissions.ts` | Full permission matrix with role modifiers |
| RBAC Functions | ✅ Done | `packages/rbac/src/rbac.ts` | checkPermission(), hasPermission() |
| Tenant Context | ✅ Done | `packages/auth/src/context.ts` | resolveTenantContext() with hierarchy |
| Organizations Table | ✅ Done | `packages/db/src/schema/organizations.ts` | Full schema with settings |
| Schools Table | ✅ Done | `packages/db/src/schema/schools.ts` | Linked to organizations |
| Classes Table | ✅ Done | `packages/db/src/schema/classes.ts` | Linked to schools |
| Teachers_on_Class | ✅ Done | `packages/db/src/schema/memberships.ts` | Many-to-many relationship |
| Enrollments Table | ✅ Done | `packages/db/src/schema/enrollments.ts` | Student-class with status |
| Audit Logs Table | ✅ Done | `packages/db/src/schema/audit.ts` | Comprehensive audit schema |
| Audit Logger | ✅ Done | `packages/audit/src/logger.ts` | logAuditEvent() function |

### ⚠️ Needs Verification/Enhancement

| Component | Status | Gap | Priority |
|-----------|--------|-----|----------|
| Role Validation | ⚠️ Verify | Verify 7 roles match requirements | P0 |
| Permission Testing | ⚠️ Verify | Test permission checks, role modifiers | P0 |
| School Academic Year | ⚠️ Missing | academic_year field not in schema | P0 |
| School Terms | ⚠️ Missing | terms field not in schema | P0 |
| Teacher-Class Queries | ⚠️ Verify | Test queries (teachers by class, etc.) | P0 |
| Student-Class Queries | ⚠️ Verify | Test queries (students by class, etc.) | P0 |
| Audit Integration | ⚠️ Verify | Verify all mutations use audit logging | P0 |
| System Status States | ❌ Missing | No system-wide status enum (active/archived/read-only) | P0 |
| tRPC RBAC Middleware | ⚠️ Verify | Verify/integrate RBAC with tRPC routes | P0 |

### ❌ Not Implemented

| Component | Gap | Priority |
|-----------|-----|----------|
| System-wide Status Enum | Need to create status enum and add to entities | P0 |
| tRPC Middleware Integration | May need to implement if not exists | P0 |

---

## EPIC 2: Student Records (SIS-lite)

### ✅ Implemented

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| Students Table | ✅ Done | `packages/db/src/schema/student.ts` | Basic fields: name, DOB, student_number |
| Parent-Student Link | ✅ Done | `packages/db/src/schema/memberships.ts` | parent_student table with relationships |
| Enrollment Status | ✅ Done | `packages/db/src/schema/enrollments.ts` | Status: active/withdrawn/graduated |

### ⚠️ Needs Implementation

| Component | Gap | Priority |
|-----------|-----|----------|
| Required Field Validation | Add validation for required student fields | P1 |
| Duplicate Detection | Implement duplicate detection algorithm | P1 |
| Duplicate Resolution UI | Admin UI to merge/resolve duplicates | P1 |
| Soft Delete Prevention | Prevent deletion of active students | P1 |
| Historical Read-only Views | Read-only views for past academic years | P1 |
| Student Profile UI | Admin UI for managing student records | P1 |

### ❌ Not Implemented

| Component | Gap | Priority |
|-----------|-----|----------|
| Household Entity | May need household table (currently only parent_student) | P1 |
| Duplicate Detection Logic | Algorithm to detect potential duplicates | P1 |
| Duplicate Resolution Workflow | Merge/resolve duplicate records | P1 |

---

## EPIC 3: Attendance & Safety

### ❌ Not Implemented (New Feature)

| Component | Gap | Priority |
|-----------|-----|----------|
| Attendance Table | Create daily attendance schema | P1 |
| Attendance Entry UI | Teacher UI for marking attendance | P1 |
| Attendance States | Present/Absent/Tardy support | P1 |
| Attendance Corrections | Correction workflow with audit trail | P1 |
| Attendance History | Student attendance history view | P1 |
| Parent Notifications | Automatic email for absences | P1 |
| Admin Overview | Daily attendance completion dashboard | P1 |
| Day Closure Warning | Warn if attendance incomplete | P1 |

**Prerequisites:** ✅ Students, Classes, Enrollments, Audit Logging exist

---

## EPIC 4: Gradebook & Report Cards

### ✅ Implemented

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| Grades Table | ✅ Done | `packages/db/src/schema/grades.ts` | Linked to enrollments |

### ⚠️ Needs Implementation

| Component | Gap | Priority |
|-----------|-----|----------|
| Grading Scales | Letter and numeric scale configuration | P1 |
| Grade Entry UI | Teacher UI for entering grades | P1 |
| Bulk Grade Entry | Enter grades for multiple students | P1 |
| Grade Locking | Lock grades after reporting period | P1 |
| Report Card Templates | Template structure definition | P1 |
| Report Card Generation | Generate from stored grades | P1 |
| Admin Review Workflow | Review before release | P1 |
| Parent Access | Read-only report card access | P1 |
| Report Card Immutability | Preserve as immutable records | P1 |

**Prerequisites:** ✅ Grades table exists with basic structure

---

## EPIC 5: Scheduling (Simple, Primary-First)

### ❌ Not Implemented (New Feature)

| Component | Gap | Priority |
|-----------|-----|----------|
| Schedule Table | Class-level schedule schema | P1 |
| Teacher-Schedule Assignment | Link teachers to schedules | P1 |
| Teacher Schedule View | Read-only schedule for teachers | P1 |
| Parent Schedule View | Read-only schedule for parents | P1 |
| Conflict Detection | Detect scheduling conflicts | P1 |
| Conflict Warnings | Warn admin before publishing | P1 |
| Schedule Locking | Lock published schedules | P1 |
| Schedule Management UI | Admin UI for managing schedules | P1 |

**Prerequisites:** ✅ Classes, Teachers_on_Class, Enrollments exist

---

## EPIC 6: Official Communication

### ❌ Not Implemented (New Feature)

| Component | Gap | Priority |
|-----------|-----|----------|
| Announcements Table | Announcement schema | P1 |
| School-wide Announcements | Admin can create school-wide | P1 |
| Class-level Announcements | Teachers can create class-level | P1 |
| App + Email Delivery | Deliver via app and email | P1 |
| Read/Seen Tracking | Track announcement views | P1 |
| Announcement History | Preserve announcement history | P1 |
| Permission Enforcement | Restrict by role | P1 |
| Announcement UI | UI for admins and teachers | P1 |

**Prerequisites:** ✅ RBAC, Audit Logging exist

---

## Cross-Cutting Concerns

### ✅ Implemented

- Database schema (Drizzle ORM)
- Type generation (`bun run db:generate`)
- Migration system
- Audit logging infrastructure
- RBAC permission system
- Tenant context resolution
- Hierarchical tenancy model

### ⚠️ Needs Verification

- RLS (Row Level Security) policies in Supabase
- Service layer organization

### ❌ Missing

- **tRPC routers/endpoints** - No tRPC routers found in codebase (mentioned in CLAUDE.md but not implemented)
- **tRPC setup** - Need to set up tRPC v11 with Hono integration
- **RBAC middleware integration** - Need to integrate checkPermission() with tRPC middleware
- Service layer functions
- UI components (React/Next.js) - Only basic auth pages exist
- Form validation
- Error handling patterns
- Loading states
- Empty states

---

## Implementation Priority Matrix

### P0 - Critical (Blocking)

1. **EPIC 1 Verification Tasks**
   - Verify 7 roles match requirements (#7)
   - Verify permission matrix (#8)
   - Add academic_year and terms to schools (#9)
   - Verify all entities (#9, #10, #11, #12)
   - Verify audit logging integration (#13)
   - Implement system-wide status states (#14)
   - Verify/integrate tRPC RBAC middleware (#15)

### P1 - High (Phase 1 MVP)

2. **EPIC 2 Enhancement**
   - Required field validation (#18)
   - Duplicate detection (#19)
   - Duplicate resolution (#20)
   - Soft delete prevention (#22)
   - Historical views (#23)
   - Student profile UI (#24)

3. **EPIC 3 Attendance** (New Feature)
   - All 8 stories need implementation

4. **EPIC 4 Gradebook** (Enhancement)
   - All 9 stories need implementation

5. **EPIC 5 Scheduling** (New Feature)
   - All 8 stories need implementation

6. **EPIC 6 Communication** (New Feature)
   - All 8 stories need implementation

---

## Recommendations

### Immediate Actions (This Week)

1. **Set Up tRPC Infrastructure** ⚠️ **CRITICAL**
   - Install tRPC v11 and Hono dependencies
   - Set up tRPC router structure
   - Create tRPC context with tenant resolution
   - Integrate RBAC middleware
   - Create example router with permission checks
   - **This blocks all API development**

2. **Complete EPIC 1 Verification**
   - Start with Story #7 (verify roles)
   - Then Story #8 (verify permissions)
   - Add missing fields to schools (academic_year, terms)
   - Verify all entity relationships
   - Implement system-wide status states (#14)

3. **Create Service Layer Pattern**
   - Establish service layer structure
   - Create example service with permission checks
   - Document patterns

### Short-term (Next 2 Weeks)

4. **EPIC 2 Enhancements**
   - Implement validation
   - Build duplicate detection
   - Create student management UI

5. **Start EPIC 3**
   - Create attendance schema
   - Build attendance entry UI
   - Implement parent notifications

### Medium-term (Next Month)

6. **Complete EPIC 3 & 4**
   - Finish attendance system
   - Build gradebook and report cards

7. **Start EPIC 5 & 6**
   - Build scheduling system
   - Build communication system

---

## Risk Assessment

### High Risk

- **tRPC Infrastructure Missing:** tRPC is mentioned in architecture but not implemented - this blocks all API development
- **RBAC Middleware Integration:** Cannot integrate until tRPC is set up
- **Status States:** Missing system-wide status could cause data integrity issues
- **Audit Integration:** If audit logging isn't used everywhere, compliance is at risk

### Medium Risk

- **Duplicate Detection:** Complex logic, needs careful testing
- **Parent Notifications:** Email delivery reliability critical for safety
- **Report Card Generation:** Complex business logic, needs thorough testing

### Low Risk

- **UI Components:** Can be built incrementally
- **Validation:** Straightforward to implement
- **Queries:** Database queries are well-supported

---

## Success Metrics

### EPIC 1 Complete When:
- [ ] All 9 stories verified/implemented
- [ ] All entities have required fields
- [ ] RBAC middleware integrated
- [ ] Audit logging used everywhere
- [ ] Status states implemented

### Phase 1 MVP Complete When:
- [ ] All 6 epics complete
- [ ] All 51 stories done
- [ ] All acceptance criteria met
- [ ] All tests passing
- [ ] Documentation complete

---

## Notes

- **Database-first approach:** Schema is solid, focus on business logic and UI
- **Incremental delivery:** Can ship features as they're completed
- **Testing critical:** Especially for RBAC, audit logging, and data integrity
- **UI can wait:** Business logic and API should come first

---

**Last Updated:** January 2025  
**Next Review:** After EPIC 1 verification complete

