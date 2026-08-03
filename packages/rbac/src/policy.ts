import { CAPABILITY_REGISTRY, isCapability, isResourceKind, isScopeKind } from './registry'
import type {
  MatchedPolicyGrant,
  PolicyContext,
  PolicyDecision,
  PolicyDenialReason,
  PolicyEvaluationRequest,
  PolicyGrant,
  PolicyObligation,
  PolicyQueryConstraint,
  PolicyResourceDescriptor,
  ScopeKind,
} from './types'

const UNRESOLVED_POLICY_VERSION = 'unresolved'

function frozen<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value)
}

function deny(
  request: PolicyEvaluationRequest,
  reason: PolicyDenialReason,
  extras: {
    obligations?: readonly PolicyObligation[]
    matchedGrants?: readonly Readonly<MatchedPolicyGrant>[]
  } = {}
): PolicyDecision {
  return frozen({
    effect: 'deny' as const,
    reason,
    policyVersion: request.bundle?.version ?? UNRESOLVED_POLICY_VERSION,
    capability: request.capability,
    ...(request.requestedScope ? { requestedScope: request.requestedScope } : {}),
    matchedGrants: frozen([...(extras.matchedGrants ?? [])]),
    queryConstraints: frozen([]),
    obligations: frozen([...(extras.obligations ?? [])]),
  })
}

function validContext(context: PolicyContext | null | undefined): context is PolicyContext {
  return Boolean(
    context?.accountId &&
      (context.personId || (context.platformAccess === true && !context.tenantId)) &&
      Array.isArray(context.roleTemplateKeys) &&
      context.roleTemplateKeys.length > 0 &&
      context.roleTemplateKeys.every((key) => typeof key === 'string' && key.length > 0) &&
      (context.assuranceLevel === 'aal1' || context.assuranceLevel === 'aal2')
  )
}

function parseResource(value: unknown): PolicyResourceDescriptor | null {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return null
  const candidate = value as Record<string, unknown>
  if (!isResourceKind(candidate.kind)) return null
  for (const key of [
    'tenantId',
    'organizationId',
    'schoolId',
    'classId',
    'studentId',
    'personId',
  ]) {
    const field = candidate[key]
    if (field !== undefined && (typeof field !== 'string' || field.length === 0)) return null
  }
  const ancestorIds = candidate.organizationAncestorIds
  if (
    ancestorIds !== undefined &&
    (!Array.isArray(ancestorIds) || ancestorIds.some((id) => typeof id !== 'string' || !id))
  ) {
    return null
  }
  return candidate as unknown as PolicyResourceDescriptor
}

function grantCoversRequestedScope(grantScope: ScopeKind, requestedScope: ScopeKind): boolean {
  if (grantScope === requestedScope) return true
  switch (grantScope) {
    case 'platform':
      return false
    case 'tenant':
      return requestedScope !== 'platform'
    case 'organization_subtree':
      return ['organization_exact', 'school', 'class', 'self', 'linked_student'].includes(
        requestedScope
      )
    case 'school':
      return ['class', 'self', 'linked_student'].includes(requestedScope)
    case 'organization_exact':
    case 'class':
    case 'self':
    case 'linked_student':
      return false
  }
}

function tenantFor(context: PolicyContext, resource: PolicyResourceDescriptor): string | null {
  return context.tenantId ?? resource.tenantId ?? null
}

function constraintForGrant(
  grant: PolicyGrant,
  context: PolicyContext,
  resource: PolicyResourceDescriptor,
  request: PolicyEvaluationRequest
): PolicyQueryConstraint | null {
  const tenantId = tenantFor(context, resource)
  switch (grant.scope) {
    case 'platform':
      return context.platformAccess === true ? frozen({ kind: 'platform' as const }) : null
    case 'tenant':
      return tenantId ? frozen({ kind: 'tenant' as const, tenantId }) : null
    case 'organization_exact': {
      const organizationId = context.activeEducationOrganizationId
      if (!tenantId || !organizationId) return null
      if (resource.organizationId && resource.organizationId !== organizationId) return null
      return frozen({ kind: 'organization_exact' as const, tenantId, organizationId })
    }
    case 'organization_subtree': {
      const ancestorOrganizationId = context.activeEducationOrganizationId
      if (tenantId && ancestorOrganizationId) {
        if (
          resource.organizationId &&
          resource.organizationId !== ancestorOrganizationId &&
          !resource.organizationAncestorIds?.includes(ancestorOrganizationId)
        ) {
          return null
        }
        return frozen({
          kind: 'organization_subtree' as const,
          tenantId,
          ancestorOrganizationId,
        })
      }
      if (tenantId && context.activeSchoolId) {
        if (resource.schoolId && resource.schoolId !== context.activeSchoolId) return null
        return frozen({ kind: 'school' as const, tenantId, schoolId: context.activeSchoolId })
      }
      return null
    }
    case 'school':
      if (!tenantId || !context.activeSchoolId) return null
      if (resource.schoolId && resource.schoolId !== context.activeSchoolId) return null
      return frozen({ kind: 'school' as const, tenantId, schoolId: context.activeSchoolId })
    case 'class':
      if (!tenantId || !context.personId) return null
      if (
        resource.schoolId &&
        context.activeSchoolId &&
        resource.schoolId !== context.activeSchoolId
      ) {
        return null
      }
      if (request.attributes?.relationship?.classAssigned === false) return null
      return frozen({
        kind: 'class' as const,
        tenantId,
        actorPersonId: context.personId,
        ...(resource.classId ? { classId: resource.classId } : {}),
        ...(context.activeSchoolId ? { schoolId: context.activeSchoolId } : {}),
      })
    case 'self':
      if (!tenantId || !context.personId) return null
      if (resource.personId && resource.personId !== context.personId) return null
      return frozen({ kind: 'self' as const, tenantId, personId: context.personId })
    case 'linked_student': {
      if (!tenantId || !context.personId) return null
      const relationship = request.attributes?.relationship
      if (resource.kind === 'class' && relationship?.childClassLinked === false) return null
      if (resource.kind !== 'class' && relationship?.studentLinked === false) return null
      return frozen({
        kind: 'linked_student' as const,
        tenantId,
        guardianPersonId: context.personId,
        ...(resource.studentId ? { studentId: resource.studentId } : {}),
        ...(resource.classId ? { classId: resource.classId } : {}),
      })
    }
  }
}

function unmetObligation(
  obligation: PolicyObligation,
  context: PolicyContext,
  request: PolicyEvaluationRequest
): PolicyDenialReason | null {
  switch (obligation.kind) {
    case 'mfa':
      return context.assuranceLevel === 'aal2' ? null : 'MFA_REQUIRED'
    case 'reauthentication': {
      if (!context.authenticatedAt) return 'REAUTHENTICATION_REQUIRED'
      const authenticatedAt = new Date(context.authenticatedAt)
      if (Number.isNaN(authenticatedAt.getTime())) return 'REAUTHENTICATION_REQUIRED'
      const now = request.attributes?.now ?? new Date()
      const ageMs = now.getTime() - authenticatedAt.getTime()
      return ageMs >= 0 && ageMs <= obligation.maxAgeSeconds * 1000
        ? null
        : 'REAUTHENTICATION_REQUIRED'
    }
    case 'purpose':
      return request.attributes?.purpose && obligation.allowed.includes(request.attributes.purpose)
        ? null
        : 'PURPOSE_REQUIRED'
    case 'audit':
      return null
  }
}

function uniqueByJson<T>(values: readonly T[]): readonly T[] {
  const unique = new Map<string, T>()
  for (const value of values) unique.set(JSON.stringify(value), value)
  return frozen([...unique.values()])
}

/** Pure, deterministic, default-deny capability and scope evaluation. */
export function evaluatePolicy(request: PolicyEvaluationRequest): PolicyDecision {
  if (!request.bundle) return deny(request, 'UNKNOWN_POLICY_VERSION')
  if (!validContext(request.context)) return deny(request, 'CONTEXT_MISSING')
  const context = request.context
  if (!isCapability(request.capability)) return deny(request, 'UNKNOWN_CAPABILITY')
  if (request.requestedScope && !isScopeKind(request.requestedScope)) {
    return deny(request, 'UNKNOWN_SCOPE')
  }

  const resource = parseResource(request.resource)
  if (!resource) return deny(request, 'UNKNOWN_RESOURCE')
  const definition = CAPABILITY_REGISTRY[request.capability]
  if (!definition.resourceKinds.some((kind) => kind === resource.kind)) {
    return deny(request, 'RESOURCE_KIND_MISMATCH')
  }
  if (
    request.requestedScope &&
    !definition.scopes.some((scope) => scope === request.requestedScope)
  ) {
    return deny(request, 'SCOPE_NOT_SUPPORTED')
  }
  if (context.tenantId && resource.tenantId && context.tenantId !== resource.tenantId) {
    return deny(request, 'TENANT_MISMATCH')
  }

  const roleKeys = [...new Set(context.roleTemplateKeys)].sort()
  if (roleKeys.some((key) => !request.bundle?.roleTemplates[key])) {
    return deny(request, 'UNKNOWN_ROLE_TEMPLATE')
  }

  const relevant: Array<{
    grant: PolicyGrant
    match: MatchedPolicyGrant
    constraint: PolicyQueryConstraint
  }> = []
  let capabilityGrantFound = false
  let requestedScopeGrantFound = false
  const blocked: Array<{
    reason: PolicyDenialReason
    obligation: PolicyObligation
    match: MatchedPolicyGrant
  }> = []

  for (const roleKey of roleKeys) {
    const role = request.bundle.roleTemplates[roleKey]
    if (!role) continue
    for (const grant of role.grants) {
      if (grant.capability !== request.capability) continue
      capabilityGrantFound = true
      if (
        request.requestedScope &&
        !grantCoversRequestedScope(grant.scope, request.requestedScope as ScopeKind)
      ) {
        continue
      }
      requestedScopeGrantFound = true
      const match = frozen({
        assignedRoleTemplateKey: roleKey,
        grantId: grant.id,
        capability: grant.capability,
        scope: grant.scope,
      })
      const constraint = constraintForGrant(grant, context, resource, request)
      if (!constraint) continue

      const unmet = (grant.obligations ?? [])
        .map((obligation) => ({
          obligation,
          reason: unmetObligation(obligation, context, request),
        }))
        .find(({ reason }) => reason !== null)
      if (unmet?.reason) {
        blocked.push({ reason: unmet.reason, obligation: unmet.obligation, match })
        continue
      }
      relevant.push({ grant, match, constraint })
    }
  }

  if (relevant.length === 0) {
    if (blocked.length > 0) {
      const priority: PolicyDenialReason[] = [
        'MFA_REQUIRED',
        'REAUTHENTICATION_REQUIRED',
        'PURPOSE_REQUIRED',
      ]
      const selected = [...blocked].sort(
        (a, b) => priority.indexOf(a.reason) - priority.indexOf(b.reason)
      )[0]
      if (selected) {
        return deny(request, selected.reason, {
          obligations: uniqueByJson(blocked.map(({ obligation }) => obligation)),
          matchedGrants: uniqueByJson(blocked.map(({ match }) => match)),
        })
      }
    }
    if (!capabilityGrantFound || !requestedScopeGrantFound) {
      return deny(request, 'SCOPE_NOT_GRANTED')
    }
    return deny(request, 'RESOURCE_SCOPE_MISMATCH')
  }

  const matches = uniqueByJson(relevant.map(({ match }) => match))
  const primary = matches[0]
  if (!primary) return deny(request, 'SCOPE_NOT_GRANTED')
  return frozen({
    effect: 'allow' as const,
    reason: 'GRANT_MATCHED' as const,
    policyVersion: request.bundle.version,
    capability: request.capability,
    ...(request.requestedScope ? { requestedScope: request.requestedScope as ScopeKind } : {}),
    matchedGrant: primary,
    matchedGrants: matches,
    queryConstraints: uniqueByJson(relevant.map(({ constraint }) => constraint)),
    obligations: uniqueByJson(relevant.flatMap(({ grant }) => grant.obligations ?? [])),
  })
}

export function isPolicyAllowed(decision: PolicyDecision): boolean {
  return decision.effect === 'allow'
}
