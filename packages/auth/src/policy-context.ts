import type { PolicyContext } from '@openschool/rbac'
import type { TenantRequestContext } from './tenant-request-context'
import type { VerifiedAccountIdentity } from './verified-identity'

/**
 * Converts the canonical request context into the policy engine's immutable
 * subject input. Unknown Role Template keys remain visible so policy evaluation
 * fails closed instead of silently dropping a database assignment.
 */
export function toPolicyContext(
  context: TenantRequestContext,
  identity?: Pick<VerifiedAccountIdentity, 'email' | 'reauthenticatedAt'>
): PolicyContext {
  return Object.freeze({
    accountId: context.accountId,
    ...(context.legacyUserId ? { legacyUserId: context.legacyUserId } : {}),
    personId: context.personId,
    tenantId: context.tenantId,
    ...(identity?.email ? { userEmail: identity.email } : {}),
    roleTemplateKeys: Object.freeze([...context.roleTemplateKeys]),
    assuranceLevel: context.assuranceLevel,
    ...(identity?.reauthenticatedAt ? { authenticatedAt: identity.reauthenticatedAt } : {}),
    ...(context.activeEducationOrganizationId
      ? { activeEducationOrganizationId: context.activeEducationOrganizationId }
      : {}),
    ...(context.activeSchoolId ? { activeSchoolId: context.activeSchoolId } : {}),
  })
}
