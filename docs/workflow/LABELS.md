# Label System

This document defines the label system for OpenSchool issues and PRs. Labels help organize work, filter views, and track progress.

## Label Categories

We use a hierarchical label system with prefixes for easy filtering and organization.

## Type Labels

Categorize the kind of work.

| Label | Description | When to Use |
|-------|-------------|-------------|
| `type:epic` | Large feature or initiative | Multi-story work, major features |
| `type:story` | User-facing feature or requirement | Features that deliver user value |
| `type:bug` | Defect or error | Something is broken or incorrect |
| `type:spike` | Research or exploration | POCs, technical research, feasibility studies |
| `type:chore` | Maintenance or refactoring | Non-feature work, code cleanup, tooling |
| `type:task` | Implementation task | Large tasks split from stories |

**Usage**: Every issue must have exactly one type label.

## Status Labels

Indicate the current state of work.

| Label | Description | When to Use |
|-------|-------------|-------------|
| `status:triage` | Needs review/prioritization | New issues, unclear requirements |
| `status:ready` | Ready to start | Scoped, estimated, dependencies met |
| `status:blocked` | Waiting on external factor | Dependencies, external teams, decisions |

**Usage**: Apply status labels to indicate workflow state. Remove when status changes.

## Priority Labels

Indicate urgency and business impact.

| Label | Description | When to Use |
|-------|-------------|-------------|
| `P0` | Critical - fix immediately | Production broken, security issue, data loss |
| `P1` | High - fix soon | Major feature blocker, significant user impact |
| `P2` | Medium - normal priority | Standard feature work, minor bugs |
| `P3` | Low - when time permits | Nice-to-have, technical debt, polish |

**Priority Guidelines**:
- **P0**: System down, security vulnerability, data corruption
- **P1**: Feature blockers, major bugs affecting many users
- **P2**: Normal feature development, minor bugs
- **P3**: Enhancements, refactoring, documentation

**Usage**: Every issue should have a priority label. Default to `P2` if unsure.

## Area Labels

Indicate which part of the system is affected.

| Label | Description | When to Use |
|-------|-------------|-------------|
| `area:frontend` | UI, components, client-side | React components, pages, styling |
| `area:backend` | API, services, server-side | tRPC routers, services, business logic |
| `area:db` | Database, schema, migrations | Schema changes, migrations, queries |
| `area:infra` | Infrastructure, DevOps | CI/CD, deployment, monitoring, tooling |
| `area:docs` | Documentation | README, guides, API docs, comments |
| `area:auth` | Authentication, authorization | Auth flows, RBAC, permissions |
| `area:audit` | Audit logging | Audit events, logging, compliance |

**Usage**: Apply one or more area labels. Most issues will have 1-2 areas.

## Special Labels

Additional labels for specific situations.

| Label | Description | When to Use |
|-------|-------------|-------------|
| `breaking-change` | Changes API or behavior | Requires migration, version bump |
| `security` | Security-related | Vulnerabilities, security improvements |
| `performance` | Performance-related | Optimizations, bottlenecks |
| `accessibility` | A11y-related | WCAG compliance, screen reader support |
| `good-first-issue` | Good for new contributors | Well-scoped, clear requirements |
| `needs-design` | Requires design work | UI/UX needs design before implementation |
| `needs-qa` | Requires QA testing | Complex features, critical paths |

## Label Combinations

### Common Patterns

**Feature Story**:
```
type:story
area:frontend
area:backend
P1
status:ready
```

**Critical Bug**:
```
type:bug
area:backend
P0
status:triage
security (if applicable)
```

**Research Spike**:
```
type:spike
area:backend
area:infra
P2
status:ready
```

**Refactoring Chore**:
```
type:chore
area:backend
P3
status:ready
```

## Label Application Rules

1. **Type**: Required, exactly one
2. **Priority**: Required, exactly one
3. **Area**: Optional, one or more (most issues have 1-2)
4. **Status**: Optional, use when workflow state is important
5. **Special**: Optional, use when relevant

## Filtering with Labels

### GitHub Issues

Filter by label:
- `label:type:bug` - All bugs
- `label:P0` - Critical priority
- `label:area:frontend` - Frontend work
- `label:type:story label:status:ready` - Ready stories

### GitHub Projects

Use labels to:
- Group by type in views
- Filter by priority
- Filter by area
- Create custom views

## Label Maintenance

### Adding New Labels

1. Update this document
2. Add to appropriate category
3. Document when to use
4. Announce in team chat (if applicable)

### Removing Labels

1. Check for issues using the label
2. Re-label or close issues
3. Remove label from repository
4. Update this document

## Label Colors (Recommended)

Use consistent colors for visual recognition:

- **Type labels**: Blue shades
- **Status labels**: Yellow/Orange shades
- **Priority labels**: Red (P0) → Orange (P1) → Yellow (P2) → Gray (P3)
- **Area labels**: Green shades
- **Special labels**: Purple/Pink shades

## Quick Reference

```
Required:
- type:* (one)
- P0|P1|P2|P3 (one)

Optional:
- area:* (one or more)
- status:* (as needed)
- Special labels (as needed)
```

## Questions?

- See [GITHUB_WORKFLOW.md](./GITHUB_WORKFLOW.md) for workflow details
- See [ISSUE_WRITING_GUIDE.md](./ISSUE_WRITING_GUIDE.md) for issue examples

