import type { Role } from '../roles'

export interface TenantContext {
  accountId: string
  legacyUserId?: string
  personId: string
  tenantId: string
  userId: string
  userEmail?: string
  roles: readonly Role[]
  activeEducationOrganizationId?: string
  activeSchoolId?: string
}

export interface PermissionCheckOptions {
  resourceOwnerId?: string
  resourceClassId?: string
  resourceStudentId?: string
  /**
   * Relationship facts must come from server-side Tenant-scoped database
   * lookups, never from client input or another unverified source.
   */
  resourceClassAssigned?: boolean
  resourceStudentLinked?: boolean
  childClassLinked?: boolean
}
