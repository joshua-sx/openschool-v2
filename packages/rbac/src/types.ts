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
  resourceClassAssigned?: boolean
  resourceStudentLinked?: boolean
  childClassLinked?: boolean
}
