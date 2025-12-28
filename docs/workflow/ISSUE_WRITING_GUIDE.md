# Issue Writing Guide

This guide shows how to write clear, actionable issues for OpenSchool. Good issues save time, reduce confusion, and lead to better outcomes.

## Principles

1. **Be specific**: Vague issues lead to wrong solutions
2. **Include context**: Why is this needed?
3. **Define success**: Clear acceptance criteria
4. **Set boundaries**: What's in scope? What's out?
5. **Estimate effort**: Help with planning

## Issue Types

### Epic

**When to use**: Large features, initiatives, or multi-story work.

**Example**:

```markdown
# Student Enrollment System

## Problem / Goal

Currently, students must be manually added to classes via database scripts. We need a self-service enrollment system that allows:
- Students to enroll in available classes
- Teachers to approve/reject enrollments
- Admins to manage enrollment periods
- Automatic waitlist handling

## Scope

### In Scope
- Student enrollment UI
- Enrollment API endpoints
- Approval workflow
- Waitlist management
- Enrollment period configuration
- Email notifications

### Out of Scope
- Payment processing (future epic)
- Course prerequisites (future epic)
- Bulk enrollment (separate story)

## Acceptance Criteria

- [ ] Students can view available classes
- [ ] Students can submit enrollment requests
- [ ] Teachers receive enrollment notifications
- [ ] Teachers can approve/reject from dashboard
- [ ] Waitlist automatically promotes when spots open
- [ ] Admins can configure enrollment periods
- [ ] All enrollment actions are audit logged
- [ ] RBAC permissions enforced (students:enroll, teachers:approve)

## Stories

- [ ] #124 Student enrollment UI
- [ ] #125 Enrollment API endpoint
- [ ] #126 Approval workflow
- [ ] #127 Waitlist management
- [ ] #128 Enrollment period configuration

## Dependencies

- Requires #89 (RBAC system) to be complete
- Blocks #145 (Grade management)

## Risks / Notes

- Need to handle concurrent enrollment requests
- Consider rate limiting for enrollment API
- Waitlist promotion logic needs careful testing

## Estimate

**Size**: L (Large)
**Story Points**: 13

## Labels

`type:epic` `area:frontend` `area:backend` `area:db` `P1`
```

### Story

**When to use**: User-facing features or requirements that can be completed independently.

**Example**:

```markdown
# Student Enrollment UI

## Problem / Goal

Students need a way to browse available classes and submit enrollment requests through the web application.

## Epic

Part of #123 (Student Enrollment System)

## Scope

### In Scope
- Class listing page with filters
- Class detail view
- Enrollment request form
- Success/error messaging
- Loading states

### Out of Scope
- Payment processing
- Enrollment history (separate story)
- Class recommendations

## Acceptance Criteria

- [ ] Students can view all available classes for their school
- [ ] Students can filter classes by subject, grade level, and teacher
- [ ] Students can view class details (description, schedule, capacity)
- [ ] Students can submit enrollment request with one click
- [ ] Success message shown after submission
- [ ] Error handling for full classes or closed enrollment
- [ ] Loading spinner during API calls
- [ ] Responsive design (mobile-friendly)
- [ ] Accessible (WCAG 2.1 AA)

## Dependencies

- Requires #125 (Enrollment API endpoint) to be complete
- Depends on #89 (RBAC) for permission checks

## Risks / Notes

- Need to handle race conditions (multiple students enrolling simultaneously)
- Consider pagination for schools with many classes
- Cache class availability to reduce API calls

## Estimate

**Size**: M (Medium)
**Story Points**: 5

## Labels

`type:story` `area:frontend` `P1`
```

### Bug

**When to use**: Defects, errors, or unexpected behavior.

**Example**:

```markdown
# Grade calculation incorrect for weighted assignments

## Problem / Goal

Final grades are calculated incorrectly when assignments have different weights. A student with 90% on a 50% weighted assignment and 80% on a 50% weighted assignment should get 85%, but the system shows 80%.

## Steps to Reproduce

1. Create a class with two assignments
2. Set Assignment A weight to 50%
3. Set Assignment B weight to 50%
4. Grade student: 90% on A, 80% on B
5. View final grade calculation

## Expected Behavior

Final grade = (90 × 0.5) + (80 × 0.5) = 85%

## Actual Behavior

Final grade shows 80% (appears to be averaging without weights)

## Environment

- Browser: Chrome 120
- OS: macOS 14.2
- User Role: Teacher
- School ID: 5

## Acceptance Criteria

- [ ] Weighted grade calculation uses correct formula
- [ ] Final grade matches manual calculation
- [ ] Edge cases handled (zero weights, missing grades)
- [ ] Unit tests added for grade calculation
- [ ] Existing grades recalculated correctly

## Dependencies

None

## Risks / Notes

- May need to recalculate all existing final grades
- Verify calculation logic in service layer
- Check for similar issues in other calculation functions

## Estimate

**Size**: S (Small)
**Story Points**: 2

## Labels

`type:bug` `area:backend` `P0`
```

### Spike

**When to use**: Research, exploration, or proof-of-concept work.

**Example**:

```markdown
# Research: Real-time notifications with Supabase Realtime

## Problem / Goal

We need to send real-time notifications to teachers when students submit assignments. Need to evaluate if Supabase Realtime is suitable and how to implement it.

## Questions to Answer

1. Can Supabase Realtime handle our notification volume?
2. What's the latency for real-time updates?
3. How do we handle connection failures?
4. What's the cost impact?
5. Are there alternatives (WebSockets, Server-Sent Events)?

## Scope

### In Scope
- Research Supabase Realtime capabilities
- Build small POC for notification delivery
- Performance testing (latency, throughput)
- Cost analysis
- Comparison with alternatives

### Out of Scope
- Full implementation (separate story)
- Integration with existing notification system

## Acceptance Criteria

- [ ] POC demonstrates real-time notification delivery
- [ ] Performance benchmarks documented
- [ ] Cost analysis completed
- [ ] Recommendation provided (use Supabase Realtime or alternative)
- [ ] Implementation approach outlined (if proceeding)

## Deliverables

- [ ] Research document with findings
- [ ] POC code (in separate branch)
- [ ] Performance test results
- [ ] Recommendation and next steps

## Dependencies

- Requires Supabase project access
- May need to create test data

## Risks / Notes

- Realtime may not scale to our needs
- May need to consider hybrid approach
- Keep POC code for reference but don't merge

## Estimate

**Size**: M (Medium)
**Story Points**: 3

## Labels

`type:spike` `area:backend` `area:infra` `P2`
```

### Chore

**When to use**: Maintenance, refactoring, or non-feature work.

**Example**:

```markdown
# Refactor: Extract grade calculation logic to service

## Problem / Goal

Grade calculation logic is duplicated across multiple components and API routes. Need to centralize in a service layer for maintainability and consistency.

## Scope

### In Scope
- Create `GradeCalculationService`
- Move calculation logic from components
- Move calculation logic from API routes
- Add unit tests
- Update imports across codebase

### Out of Scope
- Changing calculation formulas
- Adding new calculation features
- UI changes

## Acceptance Criteria

- [ ] All grade calculation logic in `GradeCalculationService`
- [ ] No duplicate calculation code
- [ ] All existing tests pass
- [ ] New service has 100% test coverage
- [ ] All components/routes use service
- [ ] No breaking changes to API

## Dependencies

None

## Risks / Notes

- Need to ensure no behavior changes
- May need to update multiple files
- Consider backward compatibility during migration

## Estimate

**Size**: M (Medium)
**Story Points**: 3

## Labels

`type:chore` `area:backend` `P2`
```

## Acceptance Criteria Patterns

### Good Acceptance Criteria

✅ **Specific and measurable**:
- "User can submit form with valid email"
- "API returns 200 status code"
- "Page loads in < 2 seconds"

✅ **Testable**:
- "Clicking 'Submit' shows success message"
- "Invalid input shows error below field"
- "Unauthorized users see 403 error"

✅ **User-focused** (for stories):
- "Student can view their grades"
- "Teacher can filter students by class"

### Bad Acceptance Criteria

❌ **Vague**:
- "It should work"
- "Make it better"
- "Fix the bug"

❌ **Not measurable**:
- "Should be fast"
- "Should look good"
- "Should handle errors"

❌ **Implementation details**:
- "Use React hooks"
- "Add database index"
- "Refactor service layer"

## Estimation Guide

### Size (S/M/L)

- **S (Small)**: 1-2 days, straightforward, minimal dependencies
- **M (Medium)**: 3-5 days, moderate complexity, some dependencies
- **L (Large)**: 1+ weeks, complex, many dependencies

### Story Points (Fibonacci)

- **1**: Trivial, < 1 day
- **2**: Simple, 1-2 days
- **3**: Moderate, 2-3 days
- **5**: Complex, 3-5 days
- **8**: Very complex, 1+ weeks
- **13**: Epic-level, multiple weeks

## Checklist for Every Issue

Before submitting, ensure:

- [ ] Clear problem/goal statement
- [ ] Scope defined (in/out)
- [ ] Acceptance criteria are specific and testable
- [ ] Dependencies listed
- [ ] Risks/notes included
- [ ] Estimate provided
- [ ] Appropriate labels applied
- [ ] Linked to epic (if applicable)
- [ ] Screenshots/attachments (if relevant)

## Tips

1. **Start with the problem**: Why is this needed?
2. **Use examples**: Show, don't just tell
3. **Include edge cases**: What about empty states? Errors?
4. **Link related issues**: Help reviewers understand context
5. **Update as you learn**: Issues are living documents

## Questions?

- See [GITHUB_WORKFLOW.md](./GITHUB_WORKFLOW.md) for workflow details
- See [LABELS.md](./LABELS.md) for label usage

