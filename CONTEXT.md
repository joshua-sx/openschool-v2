# OpenSchool domain language

This glossary defines the names used in architecture, code, product requirements, and tests. A term should not be renamed or given a second meaning without an ADR.

## Platform and tenancy

- **Platform** — the OpenSchool control plane and all customer realms it operates. Platform access never implies access to school records.
- **Tenant** — the hard data-isolation, residency, encryption, billing, and deployment realm. A tenant may contain one school, a school group, a board, or a national education system when those units share one administrative trust realm.
- **Education Organization** — an effective-dated administrative unit inside a tenant, such as a ministry, district, board, network, operator, or regional office.
- **Organization Tree** — the parent/descendant relationship between Education Organizations. Descendant visibility is granted explicitly by scope; it is not inferred from a role name alone.
- **School** — an operational campus within a tenant, governed by one Education Organization at a point in time. Primary and high schools share the same core model and differ through configuration and academic structure.
- **Tenant Placement** — the control-plane record that maps a tenant to a pooled, bridged, or siloed data deployment. Moving placement must not change domain interfaces.

## People and access

- **Account** — a globally unique authenticated principal from the identity provider. It contains login/security state, not a school role or authoritative student record.
- **Person** — a human record scoped to one tenant. A Person may exist without an Account and may have student, guardian, teacher, employee, or other profiles over time.
- **Account Link** — the verified, revocable association between an Account and a tenant-scoped Person.
- **Affiliation** — an effective-dated assignment connecting a Person to a Tenant, Education Organization, or School with one or more role templates.
- **Relationship** — an effective-dated domain link between People or records, such as guardian-to-student or teacher-to-class.
- **Role Template** — a named bundle of capability grants for common jobs. It is an assignment convenience, not a global hierarchy and not the authorization decision itself.
- **Capability** — a stable action name such as `student.read` or `grade.publish` evaluated against a resource and scope.
- **Scope** — the set of resources a capability grant covers: platform, tenant, organization subtree, school, class, self, or linked student.
- **Policy Decision** — an allow or deny result with a stable reason code, policy version, and any obligations such as MFA, audit, or purpose capture.
- **Tenant Request Context** — the immutable server-resolved Account, Person, Tenant, active organization/school, assurance, membership version, and request identifiers used by policy and database modules. Client values are selectors only.

## Operations and assurance

- **Privileged Action** — an operation that changes access, identity, tenant configuration, exports, retention, finance, safeguarding, or other high-impact state.
- **Support Access** — explicit, ticketed, time-bounded access granted to support staff for a specific tenant and purpose. It is not inherited from platform administration.
- **Break-glass Access** — exceptional emergency access with strong authentication, short expiry, notification, and immutable review evidence.
- **Audit Event** — an append-only record of an attempted or completed security- or business-relevant action, its actor, tenant context, policy decision, correlation identifier, and redacted change summary.
- **Isolation Matrix** — positive and negative tests proving every data path respects Tenant, Organization Tree, School, assignment, and self/relationship scopes.
- **Production Gate** — the evidence checklist that must be approved before real school data or users are onboarded. Engineering evidence and jurisdiction-specific legal/privacy approval remain separate.

## Academic structure

- **Academic Year** — a versioned School-local instructional date boundary with a stable code, display name, time zone, and draft/published/closed lifecycle.
- **Term** — an ordered, non-overlapping instructional date range contained within one Academic Year. A School may label it term, semester, trimester, quarter, or another local name.
- **Learner Level** — an ordered School-local classification such as grade, year, form, or standard, with a stable code and optional education-stage metadata.
- **Current Academic Year** — the single published Academic Year, if any, whose inclusive dates contain the current date in the School time zone. It is derived, never client asserted or stored as a mutable flag.

## Invariants

1. Every school-owned record belongs to exactly one Tenant, even when its School can be derived through a join.
2. A client may select context but can never assert membership, role, capability, or database claims.
3. An Account may have multiple People and affiliations; no arbitrary “first membership” becomes active context.
4. Platform, support, and migration privileges are separate from normal tenant runtime access.
5. Primary and high-school differences are configuration and academic-model differences, not duplicated tenant or identity systems.
