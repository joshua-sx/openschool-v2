export type AssuranceLevel = 'aal1' | 'aal2'

export type ScopeKind =
  | 'platform'
  | 'tenant'
  | 'organization_exact'
  | 'organization_subtree'
  | 'school'
  | 'class'
  | 'self'
  | 'linked_student'

export type ResourceKind =
  | 'platform'
  | 'tenant'
  | 'education_organization'
  | 'school'
  | 'class'
  | 'student'
  | 'grade'
  | 'teacher'
  | 'report'
  | 'settings'
  | 'account'
  | 'audit_log'
  | 'support_session'

/**
 * Trusted, immutable authorization inputs resolved from verified identity and
 * current database assignments. Callers must never construct this from client
 * claims or request headers.
 */
export interface PolicyContext {
  accountId: string
  legacyUserId?: string
  personId: string
  tenantId?: string
  userEmail?: string
  roleTemplateKeys: readonly string[]
  assuranceLevel: AssuranceLevel
  authenticatedAt?: string
  activeEducationOrganizationId?: string
  activeSchoolId?: string
  /** Loaded only from the platform access store; Tenant roles never imply it. */
  platformAccess?: boolean
}

export interface PolicyResourceDescriptor {
  kind: ResourceKind
  tenantId?: string
  organizationId?: string
  /** Trusted ancestor IDs from the current Organization Tree version. */
  organizationAncestorIds?: readonly string[]
  schoolId?: string
  classId?: string
  studentId?: string
  personId?: string
}

/** Trusted relationship evidence loaded by a Tenant-scoped server query. */
export interface PolicyRelationshipEvidence {
  classAssigned?: boolean
  childClassLinked?: boolean
  studentLinked?: boolean
}

export type PolicyObligation =
  | Readonly<{ kind: 'mfa'; assuranceLevel: 'aal2' }>
  | Readonly<{ kind: 'reauthentication'; maxAgeSeconds: number }>
  | Readonly<{ kind: 'purpose'; allowed: readonly string[] }>
  | Readonly<{ kind: 'audit'; event: string }>

export interface PolicyEvaluationAttributes {
  now?: Date
  purpose?: string
  relationship?: PolicyRelationshipEvidence
}

export interface PolicyGrant {
  id: string
  capability: string
  scope: ScopeKind
  obligations?: readonly PolicyObligation[]
}

export interface RoleTemplateDefinition {
  key: string
  description: string
  composes?: readonly string[]
  grants?: readonly PolicyGrant[]
}

export interface CompiledRoleTemplate {
  key: string
  description: string
  grants: readonly Readonly<PolicyGrant>[]
}

export interface PolicyBundle {
  version: string
  roleTemplates: Readonly<Record<string, CompiledRoleTemplate>>
}

export type PolicyQueryConstraint =
  | Readonly<{ kind: 'platform' }>
  | Readonly<{ kind: 'tenant'; tenantId: string }>
  | Readonly<{ kind: 'organization_exact'; tenantId: string; organizationId: string }>
  | Readonly<{
      kind: 'organization_subtree'
      tenantId: string
      ancestorOrganizationId: string
    }>
  | Readonly<{ kind: 'school'; tenantId: string; schoolId: string }>
  | Readonly<{
      kind: 'class'
      tenantId: string
      actorPersonId: string
      classId?: string
      schoolId?: string
    }>
  | Readonly<{ kind: 'self'; tenantId: string; personId: string }>
  | Readonly<{
      kind: 'linked_student'
      tenantId: string
      guardianPersonId: string
      studentId?: string
      classId?: string
    }>

export type PolicyDenialReason =
  | 'CONTEXT_MISSING'
  | 'UNKNOWN_POLICY_VERSION'
  | 'UNKNOWN_CAPABILITY'
  | 'UNKNOWN_ROLE_TEMPLATE'
  | 'UNKNOWN_SCOPE'
  | 'UNKNOWN_RESOURCE'
  | 'RESOURCE_KIND_MISMATCH'
  | 'TENANT_MISMATCH'
  | 'SCOPE_NOT_SUPPORTED'
  | 'SCOPE_NOT_GRANTED'
  | 'RESOURCE_SCOPE_MISMATCH'
  | 'MFA_REQUIRED'
  | 'REAUTHENTICATION_REQUIRED'
  | 'PURPOSE_REQUIRED'

export interface MatchedPolicyGrant {
  assignedRoleTemplateKey: string
  grantId: string
  capability: string
  scope: ScopeKind
}

export type PolicyDecision =
  | Readonly<{
      effect: 'allow'
      reason: 'GRANT_MATCHED'
      policyVersion: string
      capability: string
      requestedScope?: ScopeKind
      matchedGrant: Readonly<MatchedPolicyGrant>
      matchedGrants: readonly Readonly<MatchedPolicyGrant>[]
      queryConstraints: readonly PolicyQueryConstraint[]
      obligations: readonly PolicyObligation[]
    }>
  | Readonly<{
      effect: 'deny'
      reason: PolicyDenialReason
      policyVersion: string
      capability: string
      requestedScope?: string
      matchedGrant?: never
      matchedGrants: readonly Readonly<MatchedPolicyGrant>[]
      queryConstraints: readonly PolicyQueryConstraint[]
      obligations: readonly PolicyObligation[]
    }>

export interface PolicyEvaluationRequest {
  bundle?: PolicyBundle
  context?: PolicyContext | null
  capability: string
  requestedScope?: string
  resource: unknown
  attributes?: PolicyEvaluationAttributes
}

/** Transitional legacy context removed from authorization consumers in #85. */
export interface TenantContext {
  accountId: string
  legacyUserId?: string
  personId: string
  tenantId: string
  userId: string
  userEmail?: string
  roles: readonly import('../roles').Role[]
  activeEducationOrganizationId?: string
  activeSchoolId?: string
}

/** Transitional modifier evidence removed from authorization consumers in #85. */
export interface PermissionCheckOptions {
  resourceOwnerId?: string
  resourceClassId?: string
  resourceStudentId?: string
  resourceClassAssigned?: boolean
  resourceStudentLinked?: boolean
  childClassLinked?: boolean
}
