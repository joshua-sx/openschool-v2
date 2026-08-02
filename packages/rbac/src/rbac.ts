import { TRPCError } from '@trpc/server'
import { PERMISSIONS, type Permission } from './permissions'
import type { PermissionCheckOptions, TenantContext } from './types'

export function checkPermission(
  ctx: TenantContext,
  permission: Permission,
  options: PermissionCheckOptions = {}
): void {
  const allowedRoles = PERMISSIONS[permission]

  for (const role of ctx.roles) {
    for (const allowedRole of allowedRoles) {
      if (allowedRole.includes(':')) {
        const [baseRole, modifier] = allowedRole.split(':')

        if (role !== baseRole) continue

        switch (modifier) {
          case 'own':
            if (options.resourceOwnerId === ctx.personId) return
            break
          case 'own_class':
            if (options.resourceClassId && options.resourceClassAssigned === true) return
            break
          case 'own_child':
            if (options.resourceStudentId && options.resourceStudentLinked === true) return
            break
          case 'child_class':
            if (options.resourceClassId && options.childClassLinked === true) return
            break
        }
      } else if (role === allowedRole) {
        return
      }
    }
  }

  throw new TRPCError({
    code: 'FORBIDDEN',
    message: `Permission denied: ${permission}`,
  })
}

export function hasPermission(
  ctx: TenantContext,
  permission: Permission,
  options: PermissionCheckOptions = {}
): boolean {
  try {
    checkPermission(ctx, permission, options)
    return true
  } catch (error) {
    // Expected: TRPCError with FORBIDDEN code for permission denied
    if (error instanceof TRPCError && error.code === 'FORBIDDEN') {
      return false
    }
    // Unexpected error - log it for debugging
    console.error('Unexpected error in hasPermission:', error)
    return false
  }
}
