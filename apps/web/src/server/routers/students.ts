import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import {
  getStudentsBySchool,
  getStudentById,
  createStudent,
  updateStudent,
  validateStudentData,
} from '@/services/students'
import { TRPCError } from '@trpc/server'

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
  getBySchool: protectedProcedure('students:read')
    .input(z.object({ schoolId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.tenantContext) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
        })
      }

      return await getStudentsBySchool(ctx.tenantContext, input.schoolId)
    }),

  /**
   * Get a single student by ID
   * Requires: students:read permission
   */
  getById: protectedProcedure('students:read')
    .input(z.object({ studentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.tenantContext) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
        })
      }

      const student = await getStudentById(ctx.tenantContext, input.studentId)
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
  create: protectedProcedure('students:create')
    .input(createStudentSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tenantContext) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
        })
      }

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

      return await createStudent(ctx.tenantContext, {
        schoolId: input.schoolId,
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
        studentNumber: input.studentNumber ?? null,
        email: input.email ?? null,
        status: 'active',
      })
    }),

  /**
   * Update a student
   * Requires: students:update permission
   */
  update: protectedProcedure('students:update')
    .input(updateStudentSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tenantContext) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
        })
      }

      const { studentId, ...updateData } = input

      // Validate data if provided
      if (updateData.firstName || updateData.lastName || updateData.dateOfBirth || updateData.email) {
        const validationErrors = validateStudentData({
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

      return await updateStudent(ctx.tenantContext, studentId, {
        firstName: updateData.firstName,
        lastName: updateData.lastName,
        dateOfBirth: updateData.dateOfBirth ? new Date(updateData.dateOfBirth) : undefined,
        studentNumber: updateData.studentNumber ?? undefined,
        email: updateData.email ?? undefined,
      })
    }),
})

