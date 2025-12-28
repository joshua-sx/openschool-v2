# Contributing to OpenSchool

Thank you for your interest in contributing to OpenSchool! This document outlines our development workflow, conventions, and best practices.

## Getting Started

1. **Fork and Clone**
   ```bash
   git clone https://github.com/joshua-sx/openschool-v2.git
   cd openschool-v2
   ```

2. **Install Dependencies**
   ```bash
   bun install
   ```

3. **Set Up Environment**
   ```bash
   cp .env.example .env.local
   # Fill in your environment variables
   ```

4. **Run Migrations**
   ```bash
   bun run db:migrate
   ```

5. **Start Development Server**
   ```bash
   bun run dev
   ```

## Branch Strategy

We use a **main-only** strategy with feature branches:

- **`main`** - Production-ready code. Always deployable.
- **Feature branches** - Created from `main` for new features or fixes.
- **No long-lived branches** - Merge to `main` as soon as work is complete and tested.

### Branch Naming Conventions

Branches must follow this pattern:

```
<type>/<issue-id>-<short-description>
```

**Types:**
- `feature/` - New features or enhancements
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `chore/` - Maintenance tasks

**Examples:**
- `feature/18-add-student-list-view`
- `fix/45-resolve-grade-calculation-bug`
- `docs/12-update-api-documentation`
- `refactor/67-simplify-auth-middleware`

**Rules:**
- Always include issue number (e.g., `#18`)
- Use kebab-case (lowercase with hyphens)
- Keep description short (3-4 words max)
- No special characters except hyphens

## Commit Message Standard

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat:` - New user-facing functionality
- `fix:` - Bug fixes
- `docs:` - Documentation only changes
- `style:` - Code style changes (formatting, missing semicolons, etc.)
- `refactor:` - Code refactoring without changing functionality
- `perf:` - Performance improvements
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks, dependency updates
- `build:` - Build system or dependency changes

### Scope (Optional)

Scope indicates the area of the codebase:
- `auth` - Authentication/authorization
- `db` - Database schema/migrations
- `api` - API routes/endpoints
- `ui` - UI components
- `rbac` - Role-based access control
- `audit` - Audit logging

### Examples

```bash
# Feature with scope
feat(students): add student list view with pagination

# Bug fix
fix(grades): resolve grade calculation rounding error

# Documentation
docs(api): update tRPC router documentation

# Refactoring
refactor(auth): simplify tenant context resolution

# Breaking change (note the !)
feat(api)!: change student endpoint response format

BREAKING CHANGE: student endpoint now returns paginated results
```

### Commit Body (Optional)

Use commit body to explain:
- **What** changed and **why**
- Any breaking changes
- Migration steps if needed

### Commit Footer (Optional)

Use footer for:
- Breaking changes: `BREAKING CHANGE: <description>`
- Issue references: `Closes #123`, `Fixes #456`
- Co-authors: `Co-authored-by: Name <email>`

## Development Workflow

### 1. Create Issue

Before starting work:
- Check if an issue exists
- If not, create one using the appropriate template
- Link to Epic if applicable

### 2. Create Branch

```bash
# From main
git checkout main
git pull origin main
git checkout -b feature/18-add-student-list-view
```

### 3. Make Changes

- Follow the [Work Loop](CLAUDE.md#work-loop-always-follow) from CLAUDE.md
- Write clear, readable code
- Add comments for complex logic
- Follow existing patterns

### 4. Test Your Changes

```bash
# Type check
bun run typecheck

# Lint
bun run lint

# Build
bun run build

# Run app locally
bun run dev
```

### 5. Commit

```bash
# Stage changes
git add .

# Commit with conventional commit message
git commit -m "feat(students): add student list view with pagination

- Implement student list component
- Add pagination controls
- Integrate with tRPC endpoint

Closes #18"
```

### 6. Push and Create PR

```bash
# Push branch
git push origin feature/18-add-student-list-view
```

Then create a Pull Request on GitHub:
- Use PR template
- Link to issue: `Closes #18`
- Add description of changes
- Include screenshots if UI changes
- Request review

### 7. Review and Merge

- Address review feedback
- Ensure CI/CD passes
- Squash and merge to `main`
- Delete branch after merge

## Code Standards

### TypeScript

- Use TypeScript for all new code
- Avoid `any` - use proper types
- Leverage Drizzle types (don't duplicate)
- Types flow: Schema → Service → Router → Component

### Security

- **Never** hardcode secrets
- Use environment variables
- Check permissions server-side (never trust client)
- Verify tenant access in service layer
- Use audit logging for mutations

### Error Handling

- Handle errors explicitly (no silent failures)
- Return meaningful error messages
- Log errors appropriately
- Use tRPC error codes correctly

### Testing

- Write tests for critical paths
- Test permission checks
- Test tenant isolation
- Test error cases

## Quality Checklist

Before submitting a PR, ensure:

- [ ] Code follows existing patterns
- [ ] Types pass (`bun run typecheck`)
- [ ] Linting passes (`bun run lint`)
- [ ] Build succeeds (`bun run build`)
- [ ] App runs locally (`bun run dev`)
- [ ] No hardcoded secrets
- [ ] Environment variables documented
- [ ] Permission checks implemented
- [ ] Audit logging added (for mutations)
- [ ] Error handling in place
- [ ] Loading/empty/error states exist (for UI)
- [ ] Commit message follows convention
- [ ] PR description is clear
- [ ] Issue is linked in PR

## Project Structure

```
openschool-v2/
├── apps/
│   ├── web/                    # Next.js web application
│   └── api/                    # Standalone API (planned)
├── packages/
│   ├── db/                     # Database schema & migrations
│   ├── rbac/                   # Role-based access control
│   ├── auth/                   # Authentication utilities
│   ├── audit/                  # Audit logging
│   └── ui/                     # Shared UI components
├── docs/                       # Documentation
│   └── workflow/               # GitHub workflow guides
└── scripts/                    # Utility scripts
```

## Getting Help

- Check [CLAUDE.md](./CLAUDE.md) for AI assistant guidelines
- Review [DECISIONS.md](./DECISIONS.md) for architectural decisions
- See [docs/workflow/](./docs/workflow/) for GitHub workflow
- Open an issue for questions

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (TBD).

---

**Thank you for contributing to OpenSchool!** 🎓

