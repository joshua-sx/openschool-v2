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
