import { type Role, isValidRole } from '@openschool/rbac'
import type { TenantContext } from '@openschool/rbac'
import type { TenantRequestContext } from './tenant-request-context'

/**
 * Temporary bounded adapter for the existing role-template checker. It carries
 * one selected scope and every valid role at that scope, never accessible-ID
 * lists or an arbitrarily selected "effective" role.
 */
export function toRbacTenantContext(
  context: TenantRequestContext,
  email?: string | null
): TenantContext {
  const roles = context.roleTemplateKeys.filter(isValidRole) as Role[]

  return Object.freeze({
    accountId: context.accountId,
    ...(context.legacyUserId ? { legacyUserId: context.legacyUserId } : {}),
    personId: context.personId,
    tenantId: context.tenantId,
    userId: context.accountId,
    ...(email ? { userEmail: email } : {}),
    roles: Object.freeze(roles),
    ...(context.activeEducationOrganizationId
      ? { activeEducationOrganizationId: context.activeEducationOrganizationId }
      : {}),
    ...(context.activeSchoolId ? { activeSchoolId: context.activeSchoolId } : {}),
  })
}
