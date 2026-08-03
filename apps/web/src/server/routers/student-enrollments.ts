import {
  ENROLLMENT_TRANSITION_TYPES,
  applyEnrollmentTransition,
  cancelEnrollmentTransition,
  getEnrollmentHistory,
  scheduleEnrollmentTransition,
} from '@/services/student-enrollments'
import { CAPABILITIES } from '@openschool/rbac'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc'

const transitionTypeSchema = z.enum(ENROLLMENT_TRANSITION_TYPES)
const transitionIdSchema = z.object({ transitionId: z.uuid() })

export const studentEnrollmentsRouter = router({
  canManage: protectedProcedure(CAPABILITIES.STUDENT_ENROLLMENTS_MANAGE).query(() => true),

  history: protectedProcedure(CAPABILITIES.STUDENT_ENROLLMENTS_READ)
    .input(z.object({ personId: z.uuid() }))
    .query(({ ctx, input }) =>
      getEnrollmentHistory(
        ctx.requestContext,
        ctx.policyContext,
        ctx.policyDecision,
        input.personId
      )
    ),

  schedule: protectedProcedure(CAPABILITIES.STUDENT_ENROLLMENTS_MANAGE)
    .input(
      z.object({
        personId: z.uuid(),
        fromEnrollmentId: z.uuid().optional().nullable(),
        destinationSchoolId: z.uuid().optional().nullable(),
        transitionType: transitionTypeSchema,
        effectiveAt: z.iso.datetime({ offset: true }),
        reason: z.string().trim().min(3).max(512),
        evidenceReference: z.string().trim().min(3).max(512).optional().nullable(),
        expectedEnrollmentVersion: z.number().int().positive().optional().nullable(),
        applyImmediately: z.boolean().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      scheduleEnrollmentTransition(ctx.requestContext, ctx.policyContext, ctx.policyDecision, input)
    ),

  applyScheduled: protectedProcedure(CAPABILITIES.STUDENT_ENROLLMENTS_MANAGE)
    .input(transitionIdSchema)
    .mutation(({ ctx, input }) =>
      applyEnrollmentTransition(
        ctx.requestContext,
        ctx.policyContext,
        ctx.policyDecision,
        input.transitionId
      )
    ),

  cancel: protectedProcedure(CAPABILITIES.STUDENT_ENROLLMENTS_MANAGE)
    .input(transitionIdSchema.extend({ reason: z.string().trim().min(3).max(512) }))
    .mutation(({ ctx, input }) =>
      cancelEnrollmentTransition(
        ctx.requestContext,
        ctx.policyContext,
        ctx.policyDecision,
        input.transitionId,
        input.reason
      )
    ),
})
