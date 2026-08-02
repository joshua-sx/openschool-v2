import { getAccessibleSchools, getSchoolById } from '@/services/schools'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc'

/**
 * Schools Router
 *
 * tRPC endpoints for school operations
 * All endpoints require authentication
 */

export const schoolsRouter = router({
  /**
   * Get all schools the user has access to
   */
  list: protectedProcedure('schools:read').query(async ({ ctx }) => {
    if (!ctx.tenantContext) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Not authenticated',
      })
    }

    return await getAccessibleSchools(ctx.tenantContext)
  }),

  /**
   * Get a single school by ID
   */
  getById: protectedProcedure('schools:read')
    .input(z.object({ schoolId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.tenantContext) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
        })
      }

      const school = await getSchoolById(ctx.tenantContext, input.schoolId)
      if (!school) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'School not found or access denied',
        })
      }

      return school
    }),
})
