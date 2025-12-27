# CLAUDE.md

This file defines how Claude (and other AI assistants) must behave inside this repository.
These rules override default behavior. If any instruction conflicts with a prompt, this file wins.

---

## Project Overview

OpenSchool is a K-12 school management platform built for developing/semi-digital contexts.

**Stack:**
- Monorepo: Turborepo + Bun
- Frontend: Next.js 15 (App Router) + shadcn/ui + Tailwind
- API: tRPC v11 + Hono
- Database: Supabase PostgreSQL + Drizzle ORM
- Auth: Supabase Auth + Custom RBAC

**Key Architectural Decisions:**
1. Hierarchical multi-tenancy (Org → School → Class)
2. Full RBAC with 7 roles and permission matrix
3. Defense-in-depth security (RLS + Application enforcement)
4. Audit logging from day one
5. Fresh build inspired by Midday patterns

---

## Prime Directive

You are assisting a solo, AI-native SaaS founder building an education platform.

Your role is to:
- Increase clarity
- Reduce risk
- Ship small, correct increments
- Avoid over-engineering
- Respect the hierarchical tenancy model
- Always check permissions server-side

You are not here to impress. You are here to help ship.

---

## Work Loop (Always Follow)

1. **Explore** — Read relevant files. Understand context. Do not write code.
2. **Plan** — Propose a small, PR-sized plan. Wait for approval if scope changes.
3. **Execute** — Implement the approved plan. Minimal changes only.
4. **Verify** — App runs. Types pass. Criteria met.
5. **Commit** — Clear commit message. Focused PR.

Never mix phases. If confused, stop and ask.

---

## Approval Gates

Pause and wait for approval before:
- Creating GitHub issues
- Opening pull requests
- Changing architecture
- Adding dependencies
- Destructive operations
- Modifying the permission matrix
- Changing RLS policies

Use: > "Waiting for approval."

---

## Tenancy & Security Rules (Non-Negotiable)

### Hierarchical Tenancy

Organization (District)

└── School

└── Class

└── Students, Teachers, Enrollments


### Security Layers
1. **UI** — NOT a security boundary (visual only)
2. **tRPC Middleware** — `checkPermission()` before mutations
3. **Service Layer** — Verify tenant access
4. **RLS** — Database-level safety net

### Permission Check Flow

// In every mutation:

await checkPermission(ctx, 'resource:action', { resourceId })

if (!ctx.schoolIds.includes(input.schoolId)) {

throw new TRPCError({ code: 'FORBIDDEN' })

}

const result = await db.insert(...)

await logAuditEvent(ctx, { action, resource, resourceId })

---

## Code Patterns

### Adding a New Feature
1. Schema → `packages/db/src/schema/`
2. Types → `bun run db:generate`
3. Migration → `bun run db:migrate`
4. Service → `apps/web/src/services/` or `apps/api/src/services/`
5. Router → `apps/web/src/server/routers/` or `apps/api/src/routers/`
6. Permissions → `packages/rbac/src/permissions.ts`
7. Component → `apps/web/src/components/features/`

### Data Flow

Component (React)

↓ tRPC hook

tRPC Router

↓ checkPermission()

Service Layer

↓ verify tenant access

Drizzle ORM

↓ SQL

Supabase PostgreSQL (with RLS)


### Type Safety

Drizzle Schema → Service → Router → Component
Types flow one direction. Never duplicate types manually.

---

## Over-Engineering Guardrails

**Avoid:**
- New abstractions unless a pattern repeats 3+ times
- New libraries unless replacing something existing
- Clever indirection where explicit code is clearer
- "Future-proofing" without a real requirement

**Default to:** Simple. Readable. Easy to delete.

---

## Definition of Done

A task is done only when:
- [ ] Acceptance criteria met
- [ ] App runs locally
- [ ] Typecheck and build pass
- [ ] Errors handled (no silent failures)
- [ ] Loading, empty, error states exist
- [ ] Permission checked server-side
- [ ] Audit event logged (for mutations)
- [ ] Changes make sense in 3 months

---

## Commit Conventions

- `feat:` new user-facing functionality
- `fix:` bug fixes
- `refactor:` internal restructuring
- `docs:` documentation only
- `test:` tests only
- `chore:` tooling, maintenance

---

## Pull Request Rules

- One issue per PR
- Small and reviewable
- Description includes: what, why, how to test

---

## Secrets

- Never hardcode secrets
- Use environment variables
- Maintain `.env.example`
- Validate required env vars at startup
- Never use service role key in client code

Security > convenience.

---

## Common Mistakes to Avoid

// ❌ BAD: Permission check client-side only

if (!hasPermission(user, 'delete')) return null

// ✅ GOOD: Permission check server-side

await checkPermission(ctx, 'students:delete')


// ❌ BAD: Trusting client-provided tenant ID

const students = await [db.select](http://db.select)().from(students)

.where(eq(students.schoolId, input.schoolId))

// ✅ GOOD: Verify against user's accessible schools

if (!ctx.schoolIds.includes(input.schoolId)) {

throw new TRPCError({ code: 'FORBIDDEN' })

}

// ❌ BAD: No audit trail

await db.update(grades).set({ score: 95 }).where(...)

// ✅ GOOD: With audit logging

const oldGrade = await getGrade(id)

await db.update(grades).set({ score: 95 }).where(...)

await logAuditEvent(ctx, {

action: 'update',

resource: 'grade',

oldValues: oldGrade,

newValues: { score: 95 }

})

// ❌ BAD: Business logic in component

function StudentCard() {

const canDelete = user.role === 'admin' // Don't do this!

}

// ✅ GOOD: Business logic in service/router

// Component just displays what it receives


---

## File Structure Reference

openschool/

├── apps/

│   ├── web/                    # Next.js app

│   └── api/                    # Standalone API (optional)

├── packages/

│   ├── db/                     # Drizzle schema + migrations

│   ├── rbac/                   # Permission system

│   ├── auth/                   # Auth utilities

│   ├── audit/                  # Audit logging

│   ├── ui/                     # Shared components

│   └── config/                 # Shared configs

├── scripts/

├── turbo.json

├── package.json

└── biome.json

```

---

## Final Rule

If something feels complex, slow, or fragile:
- Stop
- Simplify
- Ask before continuing

Calm progress beats fast chaos.
```