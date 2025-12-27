import { TRPCError } from '@trpc/server'
import { PERMISSIONS, type Permission } from './permissions'
import type { TenantContext, PermissionCheckOptions } from './types'

export function checkPermission(
  ctx: TenantContext,
  permission: Permission,
  options: PermissionCheckOptions = {}
): void {
  const allowedRoles = PERMISSIONS[permission]

  for (const allowedRole of allowedRoles) {
    if (allowedRole.includes(':')) {
      const [baseRole, modifier] = allowedRole.split(':')

      if (ctx.effectiveRole !== baseRole) continue

      switch (modifier) {
        case 'own':
          if (options.resourceOwnerId === ctx.userId) return
          break
        case 'own_class':
          if (options.resourceClassId && ctx.classIds.includes(options.resourceClassId)) return
          break
        case 'own_child':
          if (options.resourceStudentId && ctx.studentIds.includes(options.resourceStudentId))
            return
          break
        case 'child_class':
          // Parent can see classes their children are in
          // Requires additional lookup - implement as needed
          break
      }
    } else {
      if (ctx.effectiveRole === allowedRole) return
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
  } catch {
    return false
  }
}