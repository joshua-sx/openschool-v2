# Capability Policy Decisions

This package implements ADR-0005's pure, fail-closed authorization contract. It does not authenticate requests or query PostgreSQL itself. It evaluates a verified `PolicyContext`, a stable Capability, a Resource descriptor, an optional requested Scope, and trusted relationship/purpose attributes.

## Decision contract

Every evaluation returns an immutable `PolicyDecision` with:

- `allow` or `deny` effect;
- a stable, non-sensitive reason code;
- the exact policy version;
- the primary and complete set of matched grants;
- query constraints that data access must apply;
- MFA, reauthentication, purpose, and audit obligations.

Unknown policy versions, Capabilities, Role Templates, Scopes, Resources, missing contexts, Tenant mismatches, and unprovable relationships deny by default. Role Templates combine as a set of explicit grants; they have no rank and never inherit another role's safeguarding or classroom duties implicitly.

## Stable registries and scopes

`registry.ts` is the compatibility boundary for Capability, Resource, and Scope names. The accepted Scopes are `platform`, `tenant`, `organization_exact`, `organization_subtree`, `school`, `class`, `self`, and `linked_student`. Adding or renaming a registry value is a versioned policy change and requires positive and negative tests.

The evaluator turns a matched grant into one or more query constraints. The web data services consume those constraints directly. Organization constraints join current School governance and the current Organization Tree; class, self, and linked-student constraints join current Affiliations, student profiles, and parent/guardian Relationships. Routers do not implement those rules.

Platform and support Role Templates require separately verified `platformAccess`; Tenant roles never imply it. Platform grants do not become Tenant data grants.

## Role Template bundles and rollback

`createPolicyBundle` compiles and deeply freezes explicit Role Templates. A custom role may compose named templates and add grants, but an unknown dependency, cycle, capability, scope, invalid obligation, or duplicate key rejects the bundle. Composition is not hierarchy and adds only the grants named by the bundle.

The accepted deployment versions are:

- `2026-08-02.v1` — current Tenant, platform, and support templates;
- `2026-08-02.legacy-parity` — rollback Tenant grant surface using the same MFA and audit safeguards.

`OPENSCHOOL_POLICY_VERSION` may select an accepted version. It is intentionally optional; an absent value selects the current bundle, while an unknown value produces `UNKNOWN_POLICY_VERSION` and denies every evaluation. Rollback never selects the deleted modifier checker or allow-by-default behavior.

## Caller rules

1. Resolve verified identity and canonical Tenant Request Context first.
2. Evaluate before fetching whenever input identifiers permit.
3. Pass the resulting allow decision to the data service.
4. The data service must verify the expected Capability and apply every returned query constraint as an allowed union.
5. Relationship evidence must come from Tenant-scoped server queries, never client booleans.
6. Complete audit obligations through #88's atomic audit/outbox boundary.
7. Treat UI visibility as a hint only; server policy and database RLS remain authoritative.

## Evidence and remaining blockers

The focused policy suite proves default-deny inputs, order-independent multi-role union, guardian, student, teacher/class, School, Organization subtree, support, and platform cases; obligation enforcement; immutable custom composition; and accepted-version selection. `policy:query-poc` runs against disposable seeded PostgreSQL and proves Organization subtree, selected School, assigned class, linked student, self, sibling-School, and cross-Tenant data constraints.

This is not a complete production boundary. #86 must introduce named non-owner transaction-scoped runtime roles, #87 must independently enforce the student slice through forced RLS, #88 must make audit obligations atomic, #89 must provision platform/support/MFA lifecycle evidence, and #90 must complete the Isolation Matrix.
