import { eq, and } from 'drizzle-orm'
import { getDb, students, type Student, type NewStudent } from '@openschool/db'
import type { TenantContext } from '@openschool/rbac'
import { logAuditEvent } from '@openschool/audit'
import { TRPCError } from '@trpc/server'

/**
 * Student Service
 * 
 * Business logic for student operations with:
 * - Tenant access verification
 * - Permission checks (handled by tRPC middleware)
 * - Audit logging
 */

/**
 * Get all students for a school
 * Verifies the school belongs to the user's accessible schools
 */
export async function getStudentsBySchool(
  ctx: TenantContext,
  schoolId: string
): Promise<Student[]> {
  // Verify tenant access
  if (!ctx.schoolIds.includes(schoolId)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied to this school',
    })
  }

  const db = getDb()
  return await db
    .select()
    .from(students)
    .where(and(eq(students.schoolId, schoolId), eq(students.status, 'active')))
}

/**
 * Get a single student by ID
 * Verifies the student's school belongs to the user's accessible schools
 */
export async function getStudentById(
  ctx: TenantContext,
  studentId: string
): Promise<Student | null> {
  const db = getDb()
  const student = await db
    .select()
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1)
    .then((rows) => rows[0] ?? null)

  if (!student) {
    return null
  }

  // Verify tenant access
  if (!ctx.schoolIds.includes(student.schoolId)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied to this student',
    })
  }

  return student
}

/**
 * Create a new student
 * Verifies school access and logs audit event
 */
export async function createStudent(
  ctx: TenantContext,
  data: Omit<NewStudent, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Student> {
  // Verify tenant access
  if (!ctx.schoolIds.includes(data.schoolId)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied to this school',
    })
  }

  const db = getDb()
  const [student] = await db
    .insert(students)
    .values(data)
    .returning()

  // Audit log
  await logAuditEvent(ctx, {
    action: 'create',
    resource: 'student',
    resourceId: student.id,
    newValues: {
      firstName: student.firstName,
      lastName: student.lastName,
      schoolId: student.schoolId,
    },
  })

  return student
}

/**
 * Update a student
 * Verifies access and logs audit event
 */
export async function updateStudent(
  ctx: TenantContext,
  studentId: string,
  data: Partial<Omit<NewStudent, 'id' | 'schoolId' | 'createdAt' | 'updatedAt'>>
): Promise<Student> {
  // Get existing student to verify access
  const existing = await getStudentById(ctx, studentId)
  if (!existing) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Student not found',
    })
  }

  const db = getDb()
  const [updated] = await db
    .update(students)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(students.id, studentId))
    .returning()

  // Audit log
  await logAuditEvent(ctx, {
    action: 'update',
    resource: 'student',
    resourceId: studentId,
    oldValues: existing,
    newValues: updated,
  })

  return updated
}

/**
 * Validate student data
 * Returns validation errors or null if valid
 */
export function validateStudentData(data: {
  firstName?: string
  lastName?: string
  dateOfBirth?: string | Date | null
  email?: string | null
}): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = []

  if (!data.firstName || data.firstName.trim().length === 0) {
    errors.push({ field: 'firstName', message: 'First name is required' })
  }

  if (!data.lastName || data.lastName.trim().length === 0) {
    errors.push({ field: 'lastName', message: 'Last name is required' })
  }

  // Validate date of birth if provided
  if (data.dateOfBirth) {
    const dob = typeof data.dateOfBirth === 'string' ? new Date(data.dateOfBirth) : data.dateOfBirth
    const today = new Date()
    const age = today.getFullYear() - dob.getFullYear()
    
    if (dob > today) {
      errors.push({ field: 'dateOfBirth', message: 'Date of birth cannot be in the future' })
    } else if (age > 25) {
      errors.push({ field: 'dateOfBirth', message: 'Student age seems invalid (over 25 years)' })
    }
  }

  // Validate email format if provided
  if (data.email && data.email.trim().length > 0) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(data.email)) {
      errors.push({ field: 'email', message: 'Invalid email format' })
    }
  }

  return errors.length > 0 ? errors : []
}

