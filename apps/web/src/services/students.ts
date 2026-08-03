import { appendAuditEventInTransaction, recordAuditAttempt } from '@openschool/audit'
import {
  type DatabaseTransaction,
  type NewStudent,
  type Student,
  type TenantDatabaseContext,
  affiliations,
  enrollments,
  organizationTreeClosure,
  organizationTreeVersions,
  personRelationships,
  schoolGovernanceAssignments,
  studentProfiles,
  students,
  withPolicyTenantTransaction,
} from '@openschool/db'
import {
  type AllowedPolicyDecision,
  CAPABILITIES,
  type Capability,
  type PolicyContext,
  type PolicyQueryConstraint,
} from '@openschool/rbac'
import { TRPCError } from '@trpc/server'
import { and, desc, eq, gt, isNull, lte, or } from 'drizzle-orm'
import {
  assertDatabasePolicyContext,
  assertStudentSliceEnabled,
  toDatabasePolicyContext,
} from './database-context'
import { getSchoolByIdInTransaction } from './schools'

const MAX_STUDENT_ROWS = 500
const MAX_POLICY_CONSTRAINTS = 16

function studentAuditSnapshot(student: Student): { schoolId: string; status: string } {
  return { schoolId: student.schoolId, status: student.status }
}

async function recordStudentMutationFailure(
  error: unknown,
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  eventType: 'student.create' | 'student.update',
  targetId?: string
): Promise<never> {
  const outcome = error instanceof TRPCError && error.code === 'FORBIDDEN' ? 'denied' : 'failed'
  try {
    await recordAuditAttempt(databaseContext, context, decision, {
      eventType,
      outcome,
      targetType: 'student',
      ...(targetId ? { targetId } : {}),
      dataClasses: ['student_personal'],
      change: { changedFields: ['operation'] },
    })
  } catch (auditError) {
    throw new AggregateError(
      [error, auditError],
      'Student mutation failed and its failure evidence could not be recorded'
    )
  }
  throw error
}

function policyScopeDenied(): never {
  throw new TRPCError({ code: 'FORBIDDEN', message: 'POLICY_SCOPE_MISMATCH' })
}

function tenantPolicyConstraints(
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  expectedCapability: Capability
): readonly PolicyQueryConstraint[] {
  if (decision.capability !== expectedCapability) policyScopeDenied()
  if (!context.tenantId || decision.queryConstraints.length === 0) policyScopeDenied()
  if (decision.queryConstraints.length > MAX_POLICY_CONSTRAINTS) policyScopeDenied()
  for (const constraint of decision.queryConstraints) {
    if (constraint.kind === 'platform' || constraint.tenantId !== context.tenantId) {
      policyScopeDenied()
    }
  }
  return decision.queryConstraints
}

async function getCurrentTreeVersionId(
  db: DatabaseTransaction,
  tenantId: string,
  at: Date
): Promise<string | null> {
  const [treeVersion] = await db
    .select({ id: organizationTreeVersions.id })
    .from(organizationTreeVersions)
    .where(
      and(
        eq(organizationTreeVersions.tenantId, tenantId),
        lte(organizationTreeVersions.effectiveFrom, at)
      )
    )
    .orderBy(desc(organizationTreeVersions.effectiveFrom))
    .limit(1)
  return treeVersion?.id ?? null
}

interface StudentLookup {
  schoolId?: string
  studentId?: string
}

async function studentsForConstraint(
  db: DatabaseTransaction,
  constraint: PolicyQueryConstraint,
  lookup: StudentLookup,
  at: Date
): Promise<Student[]> {
  if (constraint.kind === 'platform') return []
  const filters = [eq(students.tenantId, constraint.tenantId), eq(students.status, 'active')]
  if (lookup.schoolId) filters.push(eq(students.schoolId, lookup.schoolId))
  if (lookup.studentId) filters.push(eq(students.id, lookup.studentId))
  const limit = lookup.studentId ? 1 : MAX_STUDENT_ROWS

  switch (constraint.kind) {
    case 'tenant':
      return db
        .select()
        .from(students)
        .where(and(...filters))
        .limit(limit)
    case 'school':
      if (lookup.schoolId && lookup.schoolId !== constraint.schoolId) return []
      return db
        .select()
        .from(students)
        .where(and(...filters, eq(students.schoolId, constraint.schoolId)))
        .limit(limit)
    case 'organization_exact': {
      const rows = await db
        .select({ student: students })
        .from(students)
        .innerJoin(
          schoolGovernanceAssignments,
          and(
            eq(schoolGovernanceAssignments.tenantId, students.tenantId),
            eq(schoolGovernanceAssignments.schoolId, students.schoolId),
            eq(schoolGovernanceAssignments.educationOrganizationId, constraint.organizationId),
            lte(schoolGovernanceAssignments.validFrom, at),
            or(
              isNull(schoolGovernanceAssignments.validUntil),
              gt(schoolGovernanceAssignments.validUntil, at)
            )
          )
        )
        .where(and(...filters))
        .limit(limit)
      return rows.map(({ student }) => student)
    }
    case 'organization_subtree': {
      const treeVersionId = await getCurrentTreeVersionId(db, constraint.tenantId, at)
      if (!treeVersionId) return []
      const rows = await db
        .select({ student: students })
        .from(students)
        .innerJoin(
          schoolGovernanceAssignments,
          and(
            eq(schoolGovernanceAssignments.tenantId, students.tenantId),
            eq(schoolGovernanceAssignments.schoolId, students.schoolId),
            lte(schoolGovernanceAssignments.validFrom, at),
            or(
              isNull(schoolGovernanceAssignments.validUntil),
              gt(schoolGovernanceAssignments.validUntil, at)
            )
          )
        )
        .innerJoin(
          organizationTreeClosure,
          and(
            eq(organizationTreeClosure.tenantId, students.tenantId),
            eq(organizationTreeClosure.treeVersionId, treeVersionId),
            eq(organizationTreeClosure.ancestorOrganizationId, constraint.ancestorOrganizationId),
            eq(
              organizationTreeClosure.descendantOrganizationId,
              schoolGovernanceAssignments.educationOrganizationId
            )
          )
        )
        .where(and(...filters))
        .limit(limit)
      return rows.map(({ student }) => student)
    }
    case 'class': {
      if (lookup.schoolId && constraint.schoolId && lookup.schoolId !== constraint.schoolId) {
        return []
      }
      const rows = await db
        .select({ student: students })
        .from(students)
        .innerJoin(
          enrollments,
          and(
            eq(enrollments.tenantId, students.tenantId),
            eq(enrollments.studentId, students.id),
            eq(enrollments.status, 'active')
          )
        )
        .innerJoin(
          affiliations,
          and(
            eq(affiliations.tenantId, enrollments.tenantId),
            eq(affiliations.personId, constraint.actorPersonId),
            eq(affiliations.kind, 'teacher'),
            eq(affiliations.scopeType, 'class'),
            eq(affiliations.classId, enrollments.classId),
            eq(affiliations.status, 'active'),
            lte(affiliations.validFrom, at),
            or(isNull(affiliations.validUntil), gt(affiliations.validUntil, at))
          )
        )
        .where(
          and(
            ...filters,
            ...(constraint.classId ? [eq(enrollments.classId, constraint.classId)] : []),
            ...(constraint.schoolId ? [eq(students.schoolId, constraint.schoolId)] : [])
          )
        )
        .limit(limit)
      return rows.map(({ student }) => student)
    }
    case 'self': {
      const rows = await db
        .select({ student: students })
        .from(students)
        .innerJoin(
          studentProfiles,
          and(
            eq(studentProfiles.tenantId, students.tenantId),
            eq(studentProfiles.legacyStudentId, students.id),
            eq(studentProfiles.personId, constraint.personId),
            eq(studentProfiles.status, 'active')
          )
        )
        .where(and(...filters))
        .limit(limit)
      return rows.map(({ student }) => student)
    }
    case 'linked_student': {
      const rows = await db
        .select({ student: students })
        .from(students)
        .innerJoin(
          studentProfiles,
          and(
            eq(studentProfiles.tenantId, students.tenantId),
            eq(studentProfiles.legacyStudentId, students.id),
            eq(studentProfiles.status, 'active')
          )
        )
        .innerJoin(
          personRelationships,
          and(
            eq(personRelationships.tenantId, studentProfiles.tenantId),
            eq(personRelationships.subjectPersonId, constraint.guardianPersonId),
            eq(personRelationships.relatedPersonId, studentProfiles.personId),
            or(
              eq(personRelationships.type, 'guardian_of'),
              eq(personRelationships.type, 'parent_of')
            ),
            eq(personRelationships.status, 'active'),
            lte(personRelationships.validFrom, at),
            or(isNull(personRelationships.validUntil), gt(personRelationships.validUntil, at))
          )
        )
        .where(
          and(...filters, ...(constraint.studentId ? [eq(students.id, constraint.studentId)] : []))
        )
        .limit(limit)
      return rows.map(({ student }) => student)
    }
  }
}

async function loadAuthorizedStudents(
  db: DatabaseTransaction,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  expectedCapability: Capability,
  lookup: StudentLookup
): Promise<Student[]> {
  assertStudentSliceEnabled()
  const constraints = tenantPolicyConstraints(context, decision, expectedCapability)
  const at = new Date()
  const rows = (
    await Promise.all(
      constraints.map((constraint) => studentsForConstraint(db, constraint, lookup, at))
    )
  ).flat()
  const unique = new Map(rows.map((student) => [student.id, student]))
  return [...unique.values()].slice(0, lookup.studentId ? 1 : MAX_STUDENT_ROWS)
}

export async function getStudentsBySchool(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  schoolId: string
): Promise<Student[]> {
  assertStudentSliceEnabled()
  assertDatabasePolicyContext(databaseContext, context)
  return withPolicyTenantTransaction(databaseContext, toDatabasePolicyContext(decision), (db) =>
    loadAuthorizedStudents(db, context, decision, CAPABILITIES.STUDENTS_READ, { schoolId })
  )
}

export async function getStudentById(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  studentId: string
): Promise<Student | null> {
  assertStudentSliceEnabled()
  const expectedCapability =
    decision.capability === CAPABILITIES.STUDENTS_UPDATE
      ? CAPABILITIES.STUDENTS_UPDATE
      : CAPABILITIES.STUDENTS_READ
  assertDatabasePolicyContext(databaseContext, context)
  const [student] = await withPolicyTenantTransaction(
    databaseContext,
    toDatabasePolicyContext(decision),
    (db) => loadAuthorizedStudents(db, context, decision, expectedCapability, { studentId })
  )
  return student ?? null
}

export async function createStudent(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  data: Omit<NewStudent, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>
): Promise<Student> {
  assertStudentSliceEnabled()
  assertDatabasePolicyContext(databaseContext, context)
  if (decision.capability !== CAPABILITIES.STUDENTS_CREATE) policyScopeDenied()
  try {
    return await withPolicyTenantTransaction(
      databaseContext,
      toDatabasePolicyContext(decision),
      async (db) => {
        const school = await getSchoolByIdInTransaction(
          db,
          context,
          decision,
          data.schoolId,
          CAPABILITIES.STUDENTS_CREATE
        )
        if (!school) policyScopeDenied()
        const [created] = await db
          .insert(students)
          .values({ ...data, tenantId: school.tenantId })
          .returning()
        if (!created) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'CREATE_FAILED' })
        }
        await appendAuditEventInTransaction(db, databaseContext, context, decision, {
          eventType: 'student.create',
          outcome: 'succeeded',
          targetType: 'student',
          targetId: created.id,
          dataClasses: ['student_personal'],
          change: {
            changedFields: Object.keys(data).sort(),
            after: studentAuditSnapshot(created),
          },
          outbox: {
            topic: 'audit.event.committed',
            deduplicationKey: `student.create:${databaseContext.requestId}:${created.id}`,
          },
        })
        return created
      }
    )
  } catch (error) {
    return recordStudentMutationFailure(error, databaseContext, context, decision, 'student.create')
  }
}

export async function updateStudent(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  studentId: string,
  data: Partial<Omit<NewStudent, 'id' | 'tenantId' | 'schoolId' | 'createdAt' | 'updatedAt'>>
): Promise<Student> {
  assertStudentSliceEnabled()
  assertDatabasePolicyContext(databaseContext, context)
  if (decision.capability !== CAPABILITIES.STUDENTS_UPDATE) policyScopeDenied()
  try {
    return await withPolicyTenantTransaction(
      databaseContext,
      toDatabasePolicyContext(decision),
      async (db) => {
        const [existing] = await loadAuthorizedStudents(
          db,
          context,
          decision,
          CAPABILITIES.STUDENTS_UPDATE,
          { studentId }
        )
        if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Student not found' })
        const [locked] = await db
          .select()
          .from(students)
          .where(
            and(
              eq(students.tenantId, existing.tenantId),
              eq(students.id, existing.id),
              eq(students.schoolId, existing.schoolId),
              eq(students.status, 'active')
            )
          )
          .for('update')
          .limit(1)
        if (!locked) throw new TRPCError({ code: 'CONFLICT', message: 'RESOURCE_CHANGED' })
        const [updated] = await db
          .update(students)
          .set({ ...data, updatedAt: new Date() })
          .where(
            and(
              eq(students.tenantId, existing.tenantId),
              eq(students.id, existing.id),
              eq(students.schoolId, existing.schoolId)
            )
          )
          .returning()
        if (!updated) throw new TRPCError({ code: 'CONFLICT', message: 'RESOURCE_CHANGED' })
        await appendAuditEventInTransaction(db, databaseContext, context, decision, {
          eventType: 'student.update',
          outcome: 'succeeded',
          targetType: 'student',
          targetId: studentId,
          dataClasses: ['student_personal'],
          change: {
            changedFields: Object.keys(data).sort(),
            before: studentAuditSnapshot(locked),
            after: studentAuditSnapshot(updated),
          },
          outbox: {
            topic: 'audit.event.committed',
            deduplicationKey: `student.update:${databaseContext.requestId}:${studentId}`,
          },
        })
        return updated
      }
    )
  } catch (error) {
    return recordStudentMutationFailure(
      error,
      databaseContext,
      context,
      decision,
      'student.update',
      studentId
    )
  }
}

interface StudentValidationData {
  firstName?: string
  lastName?: string
  dateOfBirth?: string | Date | null
  email?: string | null
}

interface StudentValidationOptions {
  requireNames: boolean
}

type StudentValidationError = { field: string; message: string }

export function validateStudentData(data: StudentValidationData): StudentValidationError[] {
  return validateStudentFields(data, { requireNames: true })
}

export function validateStudentUpdateData(data: StudentValidationData): StudentValidationError[] {
  return validateStudentFields(data, { requireNames: false })
}

function validateStudentFields(
  data: StudentValidationData,
  options: StudentValidationOptions
): StudentValidationError[] {
  const errors: StudentValidationError[] = []
  if (
    (options.requireNames && !data.firstName) ||
    (data.firstName !== undefined && data.firstName.trim().length === 0)
  ) {
    errors.push({ field: 'firstName', message: 'First name is required' })
  }
  if (
    (options.requireNames && !data.lastName) ||
    (data.lastName !== undefined && data.lastName.trim().length === 0)
  ) {
    errors.push({ field: 'lastName', message: 'Last name is required' })
  }
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
  if (data.email?.trim()) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(data.email)) {
      errors.push({ field: 'email', message: 'Invalid email format' })
    }
  }
  return errors
}
