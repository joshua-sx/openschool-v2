import { getDuplicateReviewQueue, reviewDuplicateCase } from '@/services/duplicate-people'
import { CAPABILITIES } from '@openschool/rbac'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc'

const status = z.enum(['open', 'distinct', 'merge_approval_requested', 'superseded'])

export const duplicatePeopleRouter = router({
  queue: protectedProcedure(CAPABILITIES.PEOPLE_DUPLICATES_READ, { requestedScope: 'school' })
    .input(
      z.object({
        schoolId: z.uuid(),
        statuses: z.array(status).min(1).max(4).optional(),
      })
    )
    .query(({ ctx, input }) =>
      getDuplicateReviewQueue(
        ctx.requestContext,
        ctx.policyContext,
        ctx.policyDecision,
        input.schoolId,
        input.statuses
      )
    ),
  review: protectedProcedure(CAPABILITIES.PEOPLE_DUPLICATES_REVIEW, {
    requestedScope: 'school',
  })
    .input(
      z.object({
        caseId: z.uuid(),
        expectedVersion: z.number().int().positive(),
        action: z.enum(['mark_distinct', 'request_merge_approval']),
        reason: z.string().trim().min(3).max(512),
      })
    )
    .mutation(({ ctx, input }) =>
      reviewDuplicateCase(ctx.requestContext, ctx.policyContext, ctx.policyDecision, input)
    ),
})
