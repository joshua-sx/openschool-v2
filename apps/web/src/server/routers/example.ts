import { z } from 'zod'
import { router, publicProcedure, protectedProcedure } from '../trpc'

/**
 * Example router demonstrating tRPC setup with RBAC
 * This can be removed once real routers are created
 */
export const exampleRouter = router({
  /**
   * Public endpoint - no auth required
   */
  hello: publicProcedure
    .input(z.object({ text: z.string() }))
    .query(({ input }) => {
      return {
        greeting: `Hello ${input.text}!`,
      }
    }),

  /**
   * Protected endpoint - requires authentication
   */
  protectedHello: protectedProcedure('students:read')
    .input(z.object({ text: z.string() }))
    .query(({ ctx, input }) => {
      return {
        greeting: `Hello ${input.text}!`,
        userId: ctx.userId,
        role: ctx.tenantContext?.effectiveRole,
      }
    }),
})

