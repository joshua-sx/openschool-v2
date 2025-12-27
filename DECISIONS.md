# DECISIONS.md

This file records important architectural, product, and process decisions.

---

## Decision Log

### D1 — Hierarchical Tenancy over Flat Teams

**Date:** December 2025

**Context:**
Midday (our reference architecture) uses a flat team model where all resources are scoped by `team_id`. OpenSchool needs a nested hierarchy: Organization → School → Class.

**Decision:**
Build hierarchical tenancy from scratch with separate membership tables:
- `users_on_org`
- `users_on_school`
- `teachers_on_class`
- `parent_student`

**Alternatives Considered:**
- Extend Midday's flat model with additional tables — too hacky
- Fork Midday and modify — too much code to delete

**Consequences:**
- More complex queries (must traverse hierarchy)
- Correct domain model from day one
- RLS policies need to handle hierarchy

**Revisit When:**
- Never — this is foundational

---

### D2 — Full RBAC over Simple Roles

**Date:** December 2025

**Context:**
Midday has only owner/member roles. OpenSchool needs 7 roles with granular permissions.

**Decision:**
Build a permission matrix with role modifiers (`:own`, `:own_class`, `:own_child`).
const PERMISSIONS = {

'grades:read': ['org_admin', 'school_admin', 'teacher:own_class', 'parent:own_child'],

// ...

}


**Alternatives Considered:**
- Simple role hierarchy without granular permissions — too coarse
- Per-resource ACLs — too complex for MVP

**Consequences:**
- More complex permission checks
- Correct access control for education domain
- Role modifiers require context resolution

**Revisit When:**
- If role requirements change significantly

---

### D3 — RLS + Application Enforcement (Defense in Depth)

**Date:** December 2025

**Context:**
Midday has RLS policies but bypasses them in application code. Need stronger security for student data.

**Decision:**
Use both:
- Application-level RBAC for detailed permission checks
- RLS for tenant isolation as a safety net

**Alternatives Considered:**
- RLS only — hard to express complex permissions
- Application only — one bug exposes data

**Consequences:**
- Slightly slower queries (RLS overhead)
- Defense in depth — if app has bug, DB still blocks

**Revisit When:**
- Performance becomes an issue

---

### D4 — Audit Logging from Day One

**Date:** December 2025

**Context:**
Education systems require compliance. "Who changed that grade?" is a common question.

**Decision:**
Build `packages/audit` with:
- Audit table schema
- `logAuditEvent()` function
- tRPC middleware for automatic logging

**Alternatives Considered:**
- Add audit logging later — painful to retrofit
- Use Supabase's built-in audit — less control

**Consequences:**
- Storage overhead
- Required for compliance
- Every mutation logs before/after values

**Revisit When:**
- Never — this is a compliance requirement

---

### D5 — Fresh Build over Midday Fork

**Date:** December 2025

**Context:**
Evaluated forking Midday (open-source financial SaaS with similar stack).

**Decision:**
Build fresh, pattern-match to Midday.

**Rationale:**
- Domain mismatch too significant (fintech vs education)
- Would delete 80%+ of Midday code
- Hierarchical tenancy and RBAC require fundamental changes
- AGPL-3.0 license has commercial restrictions

**What we copy from Midday:**
- Monorepo structure (Turborepo + Bun)
- tRPC + Hono API pattern
- Drizzle ORM + query organization
- shadcn/ui component approach

**Consequences:**
- More initial work
- Cleaner codebase
- Correct domain model

**Revisit When:**
- Never — decision is made

---

## Review Rule

This file should be consulted:
- Before refactors
- Before changing architecture
- When onboarding collaborators
- When you forget why something exists