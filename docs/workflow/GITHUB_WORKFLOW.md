# GitHub Workflow Guide

This document outlines the standard workflow for managing work in the OpenSchool repository using GitHub Projects, Issues, and Pull Requests.

## Overview

We use a structured approach to track work:
- **Epics**: Large features or initiatives (parent issues)
- **Stories**: User-facing features or requirements (linked to epics)
- **Tasks**: Implementation steps (checklists in issues, or separate issues if large)
- **Bugs**: Defects that need fixing
- **Spikes**: Research/exploration work
- **Chores**: Maintenance and non-feature work

## GitHub Projects

### Board Structure

We use GitHub Projects V2 with a kanban-style board. See [PROJECTS_V2_SETUP.md](./PROJECTS_V2_SETUP.md) for detailed setup instructions.

### Status Flow

```
Backlog → Ready → In Progress → In Review → Done
                                    ↓
                                 Blocked
```

- **Backlog**: Work identified but not yet prioritized
- **Ready**: Work is prioritized, scoped, and ready to start
- **In progress**: Actively being worked on
- **In review**: PR is open and awaiting review
- **Done**: Merged and deployed
- **Blocked**: Waiting on dependencies or external factors

## Issue Lifecycle

### 1. Create Issue

Use the appropriate template:
- Epic → `epic.yml`
- Story → `story.yml`
- Bug → `bug.yml`
- Spike → `spike.yml`
- Chore → `chore.yml`

### 2. Label and Categorize

Apply labels (see [LABELS.md](./LABELS.md)):
- **Type**: `type:epic`, `type:story`, `type:bug`, etc.
- **Priority**: `P0`, `P1`, `P2`, `P3`
- **Area**: `area:frontend`, `area:backend`, `area:db`, etc.
- **Status**: `status:triage` (initially)

### 3. Link to Epic (if applicable)

For stories, add to the Epic issue:
```
- [ ] #123 Story title
```

### 4. Move to Project Board

Add issue to the GitHub Project and set:
- Status: `Backlog` or `Ready`
- Priority: `P0`–`P2` (P3 if configured)
- Size: `XS`, `S`, `M`, `L`, or `XL`
- Epic: Link to parent epic (if applicable)
- Area: Select appropriate area

### 5. Start Work

When ready to begin:
1. Move status to `Ready` (if not already)
2. Assign yourself
3. Create branch: `issue-123-short-description`
4. Move status to `In progress`

## Branch Naming

Format: `issue-{number}-{short-description}`

Examples:
- `issue-45-add-student-enrollment`
- `issue-67-fix-grade-calculation`
- `issue-89-refactor-auth-middleware`

**Rules:**
- Always include issue number
- Use kebab-case
- Keep description short (3-4 words max)
- No special characters except hyphens

## Pull Request Process

### Creating a PR

1. **Reference the issue**: Include `Closes #123` or `Fixes #123` in PR description
2. **Use PR template**: Fill out all sections in `.github/pull_request_template.md`
3. **Link to Epic**: If the issue is part of an epic, mention it
4. **Update Project**: Move issue status to `In review`

### PR Requirements

- [ ] All acceptance criteria met
- [ ] Tests pass (if applicable)
- [ ] Linting passes
- [ ] Type checking passes
- [ ] Documentation updated (if needed)
- [ ] No console errors or warnings
- [ ] Screenshots included (for UI changes)
- [ ] Self-review completed

### Review Process

1. **Automated checks**: CI/CD must pass
2. **Code review**: At least one approval required
3. **QA**: Test the changes locally (if applicable)
4. **Merge**: Squash and merge (preferred) or rebase

### After Merge

1. Issue automatically closes (via `Closes #123`)
2. Move Project status to `Done`
3. Delete branch (if not auto-deleted)

## Definition of Done (DoD)

An issue is considered done when:

- [ ] All acceptance criteria met
- [ ] Code merged to main branch
- [ ] Tests pass in CI/CD
- [ ] No linting or type errors
- [ ] Documentation updated (code comments, README, API docs)
- [ ] Security considerations addressed (if applicable)
- [ ] Performance acceptable (if applicable)
- [ ] Accessibility requirements met (for UI changes)
- [ ] Audit logging added (for mutations)
- [ ] Permission checks verified (for RBAC changes)
- [ ] Issue moved to `Done` in Project board

## Epic Management

### Creating an Epic

1. Use `epic.yml` template
2. Define scope and goals clearly
3. Break into stories (as separate issues)
4. Link stories to epic using checklists

### Epic Checklist Format

In the Epic issue, maintain a checklist:

```markdown
## Stories

- [ ] #124 Student enrollment UI
- [ ] #125 Enrollment API endpoint
- [ ] #126 Enrollment validation logic
- [ ] #127 Enrollment tests
```

### Epic Completion

An epic is done when:
- All linked stories are `Done`
- Epic acceptance criteria met
- Documentation updated
- Epic issue moved to `Done`

## Task Management

### Small Tasks (Checklists)

For implementation steps within a story, use checklists in the issue:

```markdown
## Implementation Tasks

- [ ] Create database migration
- [ ] Add service layer function
- [ ] Create tRPC router endpoint
- [ ] Build React component
- [ ] Add tests
- [ ] Update documentation
```

### Large Tasks (Separate Issues)

If a task is large enough to be worked on independently:
1. Create a separate issue
2. Link to parent story/epic
3. Use `type:task` label
4. Follow normal issue lifecycle

## Labels

See [LABELS.md](./LABELS.md) for complete label system.

Quick reference:
- **Type**: `type:epic`, `type:story`, `type:bug`, `type:spike`, `type:chore`, `type:task`
- **Status**: `status:triage`, `status:ready`, `status:blocked`
- **Priority**: `P0`, `P1`, `P2`, `P3`
- **Area**: `area:frontend`, `area:backend`, `area:db`, `area:infra`, `area:docs`, `area:auth`, `area:audit`

## Best Practices

1. **One issue per PR**: Keep PRs focused and reviewable
2. **Small increments**: Break large work into smaller stories
3. **Clear acceptance criteria**: Make success measurable
4. **Link everything**: Epics → Stories → PRs → Issues
5. **Update status**: Keep Project board current
6. **Communicate blockers**: Move to `Blocked` and add comment
7. **Document decisions**: Use issue comments or ADRs
8. **Review regularly**: Triage backlog weekly

## Workflow Diagram

```
┌─────────┐
│  Idea   │
└────┬────┘
     │
     ▼
┌─────────┐     ┌─────────┐
│  Epic  │────▶│ Stories │
└────────┘     └────┬────┘
                    │
                    ▼
              ┌─────────┐
              │  Issue  │
              └────┬────┘
                   │
                   ▼
              ┌─────────┐
              │ Branch  │
              └────┬────┘
                   │
                   ▼
              ┌─────────┐
              │   PR    │
              └────┬────┘
                   │
                   ▼
              ┌─────────┐
              │  Done   │
              └─────────┘
```

## AI-Assisted Development

This project uses AI assistants (Claude, etc.) for development. When working with AI:

### Work Loop (from CLAUDE.md)

1. **Explore** — Read relevant files. Understand context. Do not write code.
2. **Plan** — Propose a small, PR-sized plan. Wait for approval if scope changes.
3. **Execute** — Implement the approved plan. Minimal changes only.
4. **Verify** — App runs. Types pass. Criteria met.
5. **Commit** — Clear commit message. Focused PR.

### Approval Gates

AI assistants must pause and wait for approval before:
- Creating GitHub issues
- Opening pull requests
- Changing architecture
- Adding dependencies
- Destructive operations
- Modifying the permission matrix
- Changing RLS policies

### AI Interaction with Issues

- AI can read and analyze issues
- AI should reference issue acceptance criteria
- AI should follow the Definition of Done
- AI should use `Closes #123` in commits/PRs
- AI should respect hierarchical tenancy and RBAC requirements

See [CLAUDE.md](../../CLAUDE.md) for complete AI guidelines.

## Questions?

- See [ISSUE_WRITING_GUIDE.md](./ISSUE_WRITING_GUIDE.md) for writing great issues
- See [PROJECTS_V2_SETUP.md](./PROJECTS_V2_SETUP.md) for Project board setup
- See [LABELS.md](./LABELS.md) for label definitions
- See [CLAUDE.md](../../CLAUDE.md) for AI-assisted development guidelines

