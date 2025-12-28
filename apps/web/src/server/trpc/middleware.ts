import { TRPCError } from '@trpc/server'
import { checkPermission } from '@openschool/rbac'
import type { Permission, PermissionCheckOptions } from '@openschool/rbac'
import { publicProcedure } from './context'

/**
 * Middleware to require authentication (Session only, no Tenant required)
 * Use this for onboarding or user-profile operations
 */
export const requireSession = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to access this resource',
    })
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  })
})

/**
 * Middleware to require authentication AND Tenant Context
 */
export const requireAuth = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.tenantContext || !ctx.userId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in and belong to an organization to access this resource',
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
 */
export function protectedProcedure(
  permission: Permission,
  options?: PermissionCheckOptions
) {
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

