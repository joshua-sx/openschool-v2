import { getAccessibleSchools, getSchoolById } from '@/services/schools'
import { CAPABILITIES } from '@openschool/rbac'
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
  list: protectedProcedure(CAPABILITIES.SCHOOLS_READ).query(async ({ ctx }) => {
    return await getAccessibleSchools(ctx.policyContext, ctx.policyDecision)
  }),

  /**
   * Get a single school by ID
   */
  getById: protectedProcedure(CAPABILITIES.SCHOOLS_READ)
    .input(z.object({ schoolId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const school = await getSchoolById(
        ctx.policyContext,
        ctx.policyDecision,
        input.schoolId,
        CAPABILITIES.SCHOOLS_READ
      )
      if (!school) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'School not found or access denied',
        })
      }

      return school
    }),
})
