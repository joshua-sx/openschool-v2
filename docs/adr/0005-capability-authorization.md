# ADR-0005: Capability authorization and Policy Decisions

- Status: Accepted
- Date: 2026-08-02
- Owner: Security Engineering
- Governs: #68 and all authorization work

## Context

The current role matrix mixes role names with modifiers, includes an unused numeric hierarchy, omits platform administrator grants, and returns only boolean/exception results. Resource-specific rules are spread between routers and query modules, making the interface as complex as its implementation.

## Decision

Authorization evaluates a Capability, immutable Tenant Request Context, resource descriptor, requested Scope, and relevant purpose/assurance attributes. It returns a Policy Decision containing allow/deny, stable reason code, policy version, matched grant, and obligations.

Role Templates are versioned grant bundles assigned through Affiliations; they are not ordered and never bypass resource scope. Custom roles compose the same capabilities. Deny by default. Platform, support, and tenant capabilities are separate namespaces.

The policy module owns resource-to-scope rules. Callers authorize before fetching whenever identifiers permit, constrain the query by the approved Scope, and authorize returned resource attributes when relationship rules require it. Database RLS independently enforces Tenant and coarse organization/School scope. Every privileged denial and grant is audit-relevant.

## Scope kinds

`platform`, `tenant`, `organization_exact`, `organization_subtree`, `school`, `class`, `self`, and `linked_student`.

## Options rejected

- **Numeric role hierarchy:** higher rank does not imply every lower role's safeguarding or classroom duties.
- **Boolean helper only:** loses reason, policy version, obligations, and audit evidence.
- **Per-resource ACL as the primary model:** creates high-cardinality administration for ordinary school roles.
- **RLS as the full business policy engine:** complex grading, guardianship, purpose, and MFA rules become hard to explain and test.

## Consequences

The Policy Decision interface becomes the shared test surface. Role templates can evolve without changing capabilities. UI hints may consume decisions but server and database enforcement remain authoritative. Policy changes require versioned tests and release notes.

## Migration path and rollback

Build the evaluator and map existing roles to versioned templates. Run old/new decisions in comparison mode, close mismatches, then remove modifier strings and the numeric hierarchy. A policy-version feature flag permits rollback to the last accepted policy bundle, not to allow-by-default behavior.
