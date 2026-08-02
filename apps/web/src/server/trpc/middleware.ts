import { checkPermission } from '@openschool/rbac'
import type { Permission, PermissionCheckOptions, TenantContext } from '@openschool/rbac'
import { TRPCError } from '@trpc/server'
import { publicProcedure } from './context'

/**
 * Middleware to require authentication
 */
export const requireAuth = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.tenantContext || !ctx.userId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to access this resource',
    })
  }

  return next({
    ctx: {
      ...ctx,
      tenantContext: ctx.tenantContext,
      userId: ctx.userId,
    },
  })
})

/**
 * Protected procedure with permission check
 * Usage: protectedProcedure('students:read').query(...)
 *
 * For permissions with :own, :own_class, :own_child modifiers, use requireAuth
 * and call assertPermission() in the handler after fetching the resource.
 */
export function protectedProcedure(permission: Permission, options?: PermissionCheckOptions) {
  return requireAuth.use(async ({ ctx, next }) => {
    if (!ctx.tenantContext) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'You must be logged in to access this resource',
      })
    }

    try {
      checkPermission(ctx.tenantContext, permission, options)
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error
      }
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Permission denied: ${permission}`,
      })
    }

    return next({
      ctx: {
        ...ctx,
        tenantContext: ctx.tenantContext,
        userId: ctx.userId,
      },
    })
  })
}

/**
 * Check permission with options in a handler.
 * Use this for permissions that need :own, :own_class, or :own_child modifiers
 * where the resource ID comes from the input.
 *
 * @example
 * // In a router handler:
 * getById: requireAuth
 *   .input(z.object({ studentId: z.string().uuid() }))
 *   .query(async ({ ctx, input }) => {
 *     const student = await getStudentById(ctx.tenantContext, input.studentId)
 *     assertPermission(ctx.tenantContext, 'students:read', {
 *       resourceStudentId: student.id,
 *     })
 *     return student
 *   })
 */
export function assertPermission(
  tenantContext: TenantContext,
  permission: Permission,
  options: PermissionCheckOptions = {}
): void {
  try {
    checkPermission(tenantContext, permission, options)
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error
    }
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Permission denied: ${permission}`,
    })
  }
}
