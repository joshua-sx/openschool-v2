import {
  createStudent,
  getStudentById,
  getStudentsBySchool,
  updateStudent,
  validateStudentData,
  validateStudentUpdateData,
} from '@/services/students'
import { CAPABILITIES } from '@openschool/rbac'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc'

/**
 * Student Router
 *
 * tRPC endpoints for student operations
 * All endpoints require authentication and appropriate permissions
 */

// Validation schemas
const createStudentSchema = z.object({
  schoolId: z.string().uuid(),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: z.string().date().optional().nullable(),
  studentNumber: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
})

const updateStudentSchema = z.object({
  studentId: z.string().uuid(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  dateOfBirth: z.string().date().optional().nullable(),
  studentNumber: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
})

export const studentsRouter = router({
  /**
   * Get all students for a school
   * Requires: students:read permission
   */
  getBySchool: protectedProcedure(CAPABILITIES.STUDENTS_READ, { requestedScope: 'school' })
    .input(z.object({ schoolId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return await getStudentsBySchool(ctx.policyContext, ctx.policyDecision, input.schoolId)
    }),

  /**
   * Get a single student by ID
   * Requires: students:read permission
   */
  getById: protectedProcedure(CAPABILITIES.STUDENTS_READ)
    .input(z.object({ studentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const student = await getStudentById(ctx.policyContext, ctx.policyDecision, input.studentId)
      if (!student) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Student not found',
        })
      }

      return student
    }),

  /**
   * Create a new student
   * Requires: students:create permission
   */
  create: protectedProcedure(CAPABILITIES.STUDENTS_CREATE, { requestedScope: 'school' })
    .input(createStudentSchema)
    .mutation(async ({ ctx, input }) => {
      // Validate data
      const validationErrors = validateStudentData({
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth ?? undefined,
        email: input.email ?? undefined,
      })

      if (validationErrors.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Validation failed',
          cause: validationErrors,
        })
      }

      return await createStudent(ctx.policyContext, ctx.policyDecision, {
        schoolId: input.schoolId,
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth ?? null,
        studentNumber: input.studentNumber ?? null,
        email: input.email ?? null,
        status: 'active',
      })
    }),

  /**
   * Update a student
   * Requires: students:update permission
   */
  update: protectedProcedure(CAPABILITIES.STUDENTS_UPDATE)
    .input(updateStudentSchema)
    .mutation(async ({ ctx, input }) => {
      const { studentId, ...updateData } = input

      // Validate data if provided
      if (
        updateData.firstName ||
        updateData.lastName ||
        updateData.dateOfBirth ||
        updateData.email
      ) {
        const validationErrors = validateStudentUpdateData({
          firstName: updateData.firstName,
          lastName: updateData.lastName,
          dateOfBirth: updateData.dateOfBirth ?? undefined,
          email: updateData.email ?? undefined,
        })

        if (validationErrors.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Validation failed',
            cause: validationErrors,
          })
        }
      }

      return await updateStudent(ctx.policyContext, ctx.policyDecision, studentId, {
        firstName: updateData.firstName,
        lastName: updateData.lastName,
        dateOfBirth: updateData.dateOfBirth,
        studentNumber: updateData.studentNumber,
        email: updateData.email,
      })
    }),
})
