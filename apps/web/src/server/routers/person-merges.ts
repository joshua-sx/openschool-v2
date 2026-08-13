import { createPersonMergePreview } from '@/services/person-merges'
import { CAPABILITIES } from '@openschool/rbac'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc'

export const personMergesRouter = router({
  createPreview: protectedProcedure(CAPABILITIES.PEOPLE_MERGES_PREVIEW, {
    requestedScope: 'school',
  })
    .input(
      z
        .object({
          caseId: z.uuid(),
          expectedCaseVersion: z.number().int().positive(),
          sourcePersonId: z.uuid(),
          targetPersonId: z.uuid(),
          reason: z.string().trim().min(3).max(512),
        })
        .refine((input) => input.sourcePersonId !== input.targetPersonId, {
          message: 'Source and target must be different',
          path: ['targetPersonId'],
        })
    )
    .mutation(({ ctx, input }) =>
      createPersonMergePreview(ctx.requestContext, ctx.policyContext, ctx.policyDecision, input)
    ),
})
