import {
  addSectionRosterMember,
  assignSectionStaff,
  closeSection,
  createCourse,
  createSection,
  endSectionRosterMembership,
  endSectionStaffAssignment,
  getSectionWorkspace,
} from '@/services/sections'
import { CAPABILITIES } from '@openschool/rbac'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc'

const reason = z.string().trim().min(3).max(512)
const code = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
const optionalUuid = z.uuid().optional().nullable()
const optionalTimestamp = z.iso.datetime({ offset: true }).optional().nullable()

export const sectionsRouter = router({
  workspace: protectedProcedure(CAPABILITIES.SECTIONS_READ)
    .input(z.object({ schoolId: z.uuid() }))
    .query(({ ctx, input }) =>
      getSectionWorkspace(ctx.requestContext, ctx.policyContext, ctx.policyDecision, input.schoolId)
    ),
  createCourse: protectedProcedure(CAPABILITIES.SECTIONS_MANAGE, { requestedScope: 'school' })
    .input(
      z.object({
        schoolId: z.uuid(),
        code,
        name: z.string().trim().min(1).max(160),
        courseType: z.enum(['general', 'subject', 'elective', 'support']),
        subjectArea: z.string().trim().max(160).optional().nullable(),
        description: z.string().trim().max(2_000).optional().nullable(),
        creditValue: z.number().min(0).max(100).optional().nullable(),
        reason,
      })
    )
    .mutation(({ ctx, input }) =>
      createCourse(ctx.requestContext, ctx.policyContext, ctx.policyDecision, input)
    ),
  createSection: protectedProcedure(CAPABILITIES.SECTIONS_MANAGE, { requestedScope: 'school' })
    .input(
      z.object({
        schoolId: z.uuid(),
        academicYearId: z.uuid(),
        academicTermId: optionalUuid,
        learnerLevelId: optionalUuid,
        courseId: optionalUuid,
        code,
        name: z.string().trim().min(1).max(160),
        sectionType: z.enum(['homeroom', 'course']),
        startDate: z.iso.date(),
        endDate: z.iso.date(),
        capacity: z.number().int().positive().max(10_000).optional().nullable(),
        reason,
      })
    )
    .mutation(({ ctx, input }) =>
      createSection(ctx.requestContext, ctx.policyContext, ctx.policyDecision, input)
    ),
  assignStaff: protectedProcedure(CAPABILITIES.SECTIONS_MANAGE, { requestedScope: 'school' })
    .input(
      z.object({
        sectionId: z.uuid(),
        personId: z.uuid(),
        role: z.enum(['lead_teacher', 'teacher', 'assistant', 'counselor']),
        isPrimary: z.boolean(),
        validFrom: z.iso.datetime({ offset: true }),
        validUntil: optionalTimestamp,
        reason,
      })
    )
    .mutation(({ ctx, input }) =>
      assignSectionStaff(ctx.requestContext, ctx.policyContext, ctx.policyDecision, input)
    ),
  addRosterMember: protectedProcedure(CAPABILITIES.SECTIONS_MANAGE, {
    requestedScope: 'school',
  })
    .input(
      z.object({
        sectionId: z.uuid(),
        schoolEnrollmentId: z.uuid(),
        validFrom: z.iso.datetime({ offset: true }),
        validUntil: optionalTimestamp,
        reason,
      })
    )
    .mutation(({ ctx, input }) =>
      addSectionRosterMember(ctx.requestContext, ctx.policyContext, ctx.policyDecision, input)
    ),
  endStaff: protectedProcedure(CAPABILITIES.SECTIONS_MANAGE, { requestedScope: 'school' })
    .input(z.object({ id: z.uuid(), validUntil: z.iso.datetime({ offset: true }), reason }))
    .mutation(({ ctx, input }) =>
      endSectionStaffAssignment(
        ctx.requestContext,
        ctx.policyContext,
        ctx.policyDecision,
        input.id,
        input.validUntil,
        input.reason
      )
    ),
  endRoster: protectedProcedure(CAPABILITIES.SECTIONS_MANAGE, { requestedScope: 'school' })
    .input(z.object({ id: z.uuid(), validUntil: z.iso.datetime({ offset: true }), reason }))
    .mutation(({ ctx, input }) =>
      endSectionRosterMembership(
        ctx.requestContext,
        ctx.policyContext,
        ctx.policyDecision,
        input.id,
        input.validUntil,
        input.reason
      )
    ),
  close: protectedProcedure(CAPABILITIES.SECTIONS_MANAGE, { requestedScope: 'school' })
    .input(z.object({ sectionId: z.uuid(), reason }))
    .mutation(({ ctx, input }) =>
      closeSection(
        ctx.requestContext,
        ctx.policyContext,
        ctx.policyDecision,
        input.sectionId,
        input.reason
      )
    ),
})
