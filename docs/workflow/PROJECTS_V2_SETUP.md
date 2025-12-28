# GitHub Projects V2 Setup Guide

This guide explains how to set up and configure a GitHub Project board for OpenSchool using Projects V2.

## Overview

GitHub Projects V2 provides a flexible kanban-style board for tracking work. This guide covers:
- Creating a new project
- Configuring fields
- Setting up views
- Best practices

## Creating a Project

1. Go to your repository on GitHub
2. Click the **Projects** tab
3. Click **New project**
4. Select **Board** layout
5. Name it: **OpenSchool Development**
6. Click **Create**

## Recommended Fields

### Status (Single Select)

Track workflow state.

**Options**:
- `Backlog` - Work identified but not prioritized
- `Ready` - Scoped and ready to start
- `In progress` - Actively being worked on
- `In review` - PR open, awaiting review
- `Done` - Merged and deployed
- `Blocked` - Waiting on dependencies

**Color coding**:
- Backlog: Gray
- Ready: Blue
- In progress: Yellow
- In review: Purple
- Done: Green
- Blocked: Red

### Priority (Single Select)

Indicate urgency.

**Options**:
- `P0` - Critical
- `P1` - High
- `P2` - Medium
- `P3` - Low (optional, add if needed)

**Color coding**:
- P0: Red
- P1: Orange
- P2: Yellow
- P3: Gray (if configured)

### Size (Single Select)

Estimate effort.

**Options**:
- `XS` - Extra Small (< 1 day)
- `S` - Small (1-2 days)
- `M` - Medium (3-5 days)
- `L` - Large (1+ weeks)
- `XL` - Extra Large (2+ weeks)

**Color coding**:
- XS: Blue
- S: Green
- M: Yellow
- L: Orange
- XL: Red

### Epic (Text or Linked Field)

Link to parent epic issue.

**Option 1: Text Field**
- Name: `Epic`
- Type: Text
- Use format: `#123 Epic Name` or just `#123`

**Option 2: Linked Field** (if using Projects for epics)
- Name: `Epic`
- Type: Linked issue
- Link to epic issues

### Area (Single Select)

Indicate system area.

**Options**:
- `Frontend`
- `Backend`
- `Database`
- `Infrastructure`
- `Documentation`
- `Auth`
- `Audit`

**Color coding**: Use distinct colors for each area

### Assignee (People)

Track who's working on what.

- Auto-populated from issue assignee
- Can be set directly on project item

### Milestone (Milestone)

Group work by release or iteration.

- Link to GitHub Milestones
- Useful for sprint planning

## Recommended Views

### 1. By Status (Default Board View)

**Purpose**: Track workflow progress

**Configuration**:
- Group by: `Status`
- Sort by: `Priority` (ascending)
- Filter: None (or `-status:done` to hide completed)

**Columns**:
- Backlog
- Ready
- In progress
- In review
- Done
- Blocked

### 2. By Assignee

**Purpose**: See who's working on what

**Configuration**:
- Group by: `Assignee`
- Sort by: `Priority` (ascending)
- Filter: `status:in-progress,status:in-review`

**Use case**: Daily standups, workload balancing

### 3. By Priority

**Purpose**: Focus on high-priority work

**Configuration**:
- Group by: `Priority`
- Sort by: `Status` (custom order)
- Filter: `-status:done`

**Use case**: Prioritization, triage

### 4. By Area

**Purpose**: See work by system area

**Configuration**:
- Group by: `Area`
- Sort by: `Priority` (ascending)
- Filter: `-status:done`

**Use case**: Planning, resource allocation

### 5. By Epic

**Purpose**: Track epic progress

**Configuration**:
- Group by: `Epic` (if using linked field)
- Sort by: `Status` (custom order)
- Filter: `type:story` (if using labels)

**Use case**: Epic planning, progress tracking

### 6. Sprint/Iteration View

**Purpose**: Focus on current sprint work

**Configuration**:
- Group by: `Status`
- Sort by: `Priority` (ascending)
- Filter: `milestone:"Sprint 2024-01"` (or current milestone)

**Use case**: Sprint planning, daily standups

## Workflow Configuration

### Automation Rules

Set up automation to:
1. **Move to "In progress"** when issue is assigned
2. **Move to "In review"** when PR is opened
3. **Move to "Done"** when PR is merged
4. **Move to "Blocked"** when `status:blocked` label added

### Status Transitions

```
Backlog → Ready → In progress → In review → Done
                              ↓
                           Blocked → (back to Ready/In progress)
```

## Best Practices

### 1. Keep Board Updated

- Update status when starting work
- Move to "In review" when opening PR
- Move to "Done" after merge
- Use automation where possible

### 2. Regular Triage

- Weekly backlog review
- Prioritize new issues
- Close stale issues
- Update estimates

### 3. Use Filters

- Filter by assignee for standups
- Filter by priority for planning
- Filter by area for team focus
- Hide "Done" items in active views

### 4. Link Everything

- Link stories to epics
- Link PRs to issues
- Link related issues
- Use checklists in epics

### 5. Clear Naming

- Use descriptive issue titles
- Include issue number in branch names
- Reference issues in PRs
- Update status comments

## Example Project Structure

```
OpenSchool Development
├── Fields
│   ├── Status (Single Select)
│   ├── Priority (Single Select)
│   ├── Size (Single Select)
│   ├── Epic (Text)
│   ├── Area (Single Select)
│   ├── Assignee (People)
│   └── Milestone (Milestone)
├── Views
│   ├── By Status (Default)
│   ├── By Assignee
│   ├── By Priority
│   ├── By Area
│   ├── By Epic
│   └── Current Sprint
└── Automation
    ├── Auto-move on assignment
    ├── Auto-move on PR open
    └── Auto-move on PR merge
```

## Migration from Other Tools

If migrating from another tool (Jira, Linear, etc.):

1. **Export data**: Get list of issues with status, priority, assignee
2. **Create project**: Set up fields and views
3. **Import issues**: Add issues to project
4. **Set field values**: Update status, priority, etc.
5. **Train team**: Share this guide and workflow docs

## Troubleshooting

### Issue not showing in project

- Check if issue is added to project
- Verify filters aren't hiding it
- Ensure issue is in repository (not organization-level)

### Status not updating

- Check automation rules
- Manually update if needed
- Verify field values are set

### Views not working

- Check grouping field exists
- Verify filter syntax
- Ensure issues match filter criteria

## Questions?

- See [GITHUB_WORKFLOW.md](./GITHUB_WORKFLOW.md) for workflow details
- See [LABELS.md](./LABELS.md) for label usage
- GitHub Docs: [About Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects)

