import {
  approveAcademicYearReview,
  closeAcademicYear,
  createAcademicYear,
  getAcademicYears,
  publishAcademicYear,
} from '@/services/academic-structure'
import { CAPABILITIES } from '@openschool/rbac'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc'

const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)

const createAcademicYearSchema = z.object({
  schoolId: z.string().uuid(),
  code: codeSchema,
  name: z.string().trim().min(1).max(128),
  timeZone: z.string().trim().min(1).max(128),
  startDate: z.string().date(),
  endDate: z.string().date(),
  terms: z
    .array(
      z.object({
        code: codeSchema,
        name: z.string().trim().min(1).max(128),
        startDate: z.string().date(),
        endDate: z.string().date(),
      })
    )
    .min(1)
    .max(20),
  levels: z
    .array(
      z.object({
        code: codeSchema,
        name: z.string().trim().min(1).max(128),
        educationStage: z.string().trim().max(64).optional().nullable(),
      })
    )
    .min(1)
    .max(30),
})

const academicYearIdSchema = z.object({ academicYearId: z.string().uuid() })

export const academicStructureRouter = router({
  list: protectedProcedure(CAPABILITIES.ACADEMIC_STRUCTURE_READ, {
    requestedScope: 'school',
  })
    .input(z.object({ schoolId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      getAcademicYears(ctx.requestContext, ctx.policyContext, ctx.policyDecision, input.schoolId)
    ),

  create: protectedProcedure(CAPABILITIES.ACADEMIC_STRUCTURE_MANAGE, {
    requestedScope: 'school',
  })
    .input(createAcademicYearSchema)
    .mutation(({ ctx, input }) =>
      createAcademicYear(ctx.requestContext, ctx.policyContext, ctx.policyDecision, input)
    ),

  approveReview: protectedProcedure(CAPABILITIES.ACADEMIC_STRUCTURE_MANAGE, {
    requestedScope: 'school',
  })
    .input(academicYearIdSchema)
    .mutation(({ ctx, input }) =>
      approveAcademicYearReview(
        ctx.requestContext,
        ctx.policyContext,
        ctx.policyDecision,
        input.academicYearId
      )
    ),

  publish: protectedProcedure(CAPABILITIES.ACADEMIC_STRUCTURE_MANAGE, {
    requestedScope: 'school',
  })
    .input(academicYearIdSchema)
    .mutation(({ ctx, input }) =>
      publishAcademicYear(
        ctx.requestContext,
        ctx.policyContext,
        ctx.policyDecision,
        input.academicYearId
      )
    ),

  close: protectedProcedure(CAPABILITIES.ACADEMIC_STRUCTURE_MANAGE, {
    requestedScope: 'school',
  })
    .input(academicYearIdSchema.extend({ reason: z.string().trim().min(3).max(512) }))
    .mutation(({ ctx, input }) =>
      closeAcademicYear(
        ctx.requestContext,
        ctx.policyContext,
        ctx.policyDecision,
        input.academicYearId,
        input.reason
      )
    ),
})
