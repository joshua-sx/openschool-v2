import { z } from 'zod'
import { router } from '../trpc'
import { requireSession } from '../trpc/middleware'
import { bootstrapOrganization } from '@/services/onboarding'

const bootstrapSchema = z.object({
  orgName: z.string().min(1, 'Organization name is required'),
  schoolName: z.string().min(1, 'School name is required'),
  slug: z.string().optional(),
})

export const onboardingRouter = router({
  complete: requireSession
    .input(bootstrapSchema)
    .mutation(async ({ ctx, input }) => {
      return await bootstrapOrganization({
        userId: ctx.userId,
        orgName: input.orgName,
        schoolName: input.schoolName,
        slug: input.slug,
      })
    }),
})

