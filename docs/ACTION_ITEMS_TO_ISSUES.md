# Action Items to GitHub Issues Mapping

This document maps the critical action items from the Gap Analysis to specific GitHub issues.

---

## 1. Set Up tRPC Infrastructure (Critical Blocker)

### Related Issues

**Primary Issue:**
- **#15** - [Story] Set up RBAC middleware and permission checks
  - **Status:** Needs work
  - **Scope:** Includes tRPC middleware integration
  - **Gap:** Issue mentions tRPC but tRPC infrastructure doesn't exist yet
  - **Action:** Issue #15 assumes tRPC exists - may need to split or create prerequisite

**Missing Issue:**
- ⚠️ **NO DEDICATED ISSUE** for tRPC setup itself
- **Recommendation:** Create new issue or update #15 to include tRPC setup as first step

### What Needs to Happen

1. **Install tRPC v11 + Hono dependencies** (not in any issue)
2. **Set up tRPC router structure** (not in any issue)
3. **Create tRPC context with tenant resolution** (partially in #15)
4. **Integrate RBAC middleware** (Issue #15)
5. **Create example router** (partially in #15)

### Recommendation

**Option A:** Update Issue #15 to include tRPC setup as first acceptance criteria
**Option B:** Create new issue "Set up tRPC infrastructure" as prerequisite to #15

---

## 2. Complete EPIC 1 Verification Tasks

### Related Issues

All EPIC 1 stories (#7-#15) are verification/enhancement tasks:

| Issue | Title | Status | Priority |
|-------|-------|--------|----------|
| **#7** | Define system roles (Admin, Teacher, Parent) | Verify 7 roles | P0 |
| **#8** | Define permission rules per role | Verify permission matrix | P0 |
| **#9** | Create school entity (name, academic year, terms) | Verify + add fields | P0 |
| **#10** | Create class / homeroom entity | Verify entity | P0 |
| **#11** | Assign teachers to classes | Verify assignments | P0 |
| **#12** | Assign students to classes | Verify enrollments | P0 |
| **#13** | Implement audit logging for critical actions | Verify integration | P0 |
| **#14** | Define system-wide status states | **IMPLEMENT** (missing) | P0 |
| **#15** | Set up RBAC middleware and permission checks | Verify/integrate | P0 |

### Dependencies

- **#7** → **#8** (roles before permissions)
- **#9** → **#10** (schools before classes)
- **#10** → **#11, #12** (classes before assignments)
- **#8** → **#15** (permissions before middleware)
- **#13** → **#14** (audit for status changes)

### Suggested Order

1. **#7** - Verify roles (foundational)
2. **#8** - Verify permissions (depends on #7)
3. **#9** - Verify schools + add academic_year/terms
4. **#10** - Verify classes
5. **#11** - Verify teacher-class assignments
6. **#12** - Verify student-class enrollments
7. **#13** - Verify audit logging
8. **#14** - Implement status states (new work)
9. **#15** - Verify/integrate RBAC middleware (depends on #8, blocks API work)

---

## 3. Create Service Layer Patterns

### Related Issues

**No Direct Issue:**
- ⚠️ **NO DEDICATED ISSUE** for service layer patterns
- This is a cross-cutting architectural concern

**Related Issues:**
- **#15** - RBAC middleware (service layer will use this)
- **#16-#24** (EPIC 2) - Will need service layer for student operations
- **#25-#32** (EPIC 3) - Will need service layer for attendance
- **#33-#41** (EPIC 4) - Will need service layer for grades
- **#42-#49** (EPIC 5) - Will need service layer for scheduling
- **#50-#57** (EPIC 6) - Will need service layer for announcements

### What Needs to Happen

1. **Establish service layer structure** (not in any issue)
2. **Create example service with permission checks** (not in any issue)
3. **Document patterns** (not in any issue)

### Recommendation

**Option A:** Create new issue "Establish service layer patterns"
**Option B:** Add to Issue #15 as part of RBAC middleware work
**Option C:** Create as part of first feature story (e.g., #16 or #18)

---

## Summary

### Issues That Exist

✅ **EPIC 1 Stories (#7-#15):** All exist and are mapped to verification tasks
- These cover most of "Complete EPIC 1 Verification Tasks"

✅ **Issue #15:** Covers RBAC middleware integration
- Partially covers "Set up tRPC Infrastructure" (but assumes tRPC exists)

### Issues That Don't Exist

❌ **tRPC Infrastructure Setup:** No dedicated issue
- **Action:** Create new issue or update #15

❌ **Service Layer Patterns:** No dedicated issue
- **Action:** Create new issue or add to #15

---

## Recommended Actions

### Immediate (This Week)

1. **Create Issue:** "Set up tRPC v11 infrastructure"
   - Install dependencies
   - Set up router structure
   - Create context with tenant resolution
   - **Blocks:** Issue #15

2. **Update Issue #15:** Add dependency on tRPC setup issue
   - Focus on RBAC middleware integration only
   - Remove tRPC setup from scope

3. **Create Issue:** "Establish service layer patterns"
   - Define service layer structure
   - Create example service
   - Document patterns
   - **Blocks:** All feature stories (#16+)

### Short-term

4. **Work through EPIC 1 stories in order:**
   - #7 → #8 → #9 → #10 → #11 → #12 → #13 → #14 → #15

---

## Issue Creation Template

If creating new issues, use these templates:

### Issue: Set up tRPC v11 Infrastructure

```markdown
## Problem / Goal

Set up tRPC v11 with Hono integration to enable type-safe API development. This is a critical blocker for all API work.

## Epic

#1 Foundation & System Setup

## Scope

### In Scope
- Install tRPC v11 and Hono dependencies
- Set up tRPC router structure
- Create tRPC context with tenant resolution (resolveTenantContext)
- Set up tRPC client in Next.js app
- Create example router to validate setup

### Out of Scope
- RBAC middleware integration (separate issue #15)
- Service layer patterns (separate issue)

## Acceptance Criteria

- [ ] tRPC v11 and Hono installed
- [ ] tRPC router structure created
- [ ] tRPC context includes tenant resolution
- [ ] Example router created and working
- [ ] tRPC client configured in Next.js app
- [ ] Types flow correctly (end-to-end type safety)

## Dependencies

None - this is foundational

## Risks / Notes

- Must integrate with existing auth system (Supabase)
- Must support hierarchical tenancy
- Type safety is critical

## Estimate

**Size**: M (Medium)

## Priority

P0 - Critical (blocks all API development)
```

### Issue: Establish Service Layer Patterns

```markdown
## Problem / Goal

Establish consistent service layer patterns for business logic. All feature stories will need services, so we should define patterns early.

## Epic

#1 Foundation & System Setup

## Scope

### In Scope
- Define service layer structure (apps/web/src/services/)
- Create example service with permission checks
- Document service patterns
- Create service utilities (error handling, validation)

### Out of Scope
- Specific feature services (covered in feature stories)
- UI components

## Acceptance Criteria

- [ ] Service layer structure defined
- [ ] Example service created (e.g., student service)
- [ ] Service uses checkPermission() correctly
- [ ] Service verifies tenant access
- [ ] Service uses audit logging
- [ ] Patterns documented
- [ ] Example can be used as template for other services

## Dependencies

- Requires #15 (RBAC middleware) to be complete

## Risks / Notes

- Patterns must be simple and consistent
- Should follow CLAUDE.md patterns
- Must enforce permissions and audit logging

## Estimate

**Size**: S (Small - pattern definition)

## Priority

P0 - Critical (needed before feature development)
```

---

**Last Updated:** January 2025

