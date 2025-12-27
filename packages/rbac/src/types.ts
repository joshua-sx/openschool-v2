import type { Role } from '../roles'

export interface TenantContext {
  userId: string
  userEmail?: string

  // Resolved from membership tables
  orgIds: string[]
  schoolIds: string[]
  classIds: string[]
  studentIds: string[]

  // Current active context
  activeOrgId?: string
  activeSchoolId?: string

  // Resolved role for current context
  effectiveRole: Role
}

export interface PermissionCheckOptions {
  resourceOwnerId?: string
  resourceClassId?: string
  resourceStudentId?: string
}