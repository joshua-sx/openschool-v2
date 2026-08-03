import {
  type AuditSummaryValue,
  appendAuditEventInTransaction,
  recordAuditAttempt,
} from '@openschool/audit'
import {
  type DatabaseTransaction,
  type TenantDatabaseContext,
  affiliations,
  people,
  schoolEnrollments,
  schools as schoolRecords,
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
import { and, eq, gt, isNull, lte, or, sql } from 'drizzle-orm'
import {
  assertDatabasePolicyContext,
  assertStudentSliceEnabled,
  toDatabasePolicyContext,
} from './database-context'
import { getSchoolByIdInTransaction } from './schools'

const MAX_STUDENT_ROWS = 500
const MAX_POLICY_CONSTRAINTS = 16
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export interface CanonicalStudent {
  id: string
  personId: string
  legacyStudentId: string
  schoolEnrollmentId: string
  studentAffiliationId: string
  tenantId: string
  schoolId: string
  schoolName: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  studentNumber: string | null
  email: string | null
  status: 'active'
  source: 'canonical'
  parityStatus: 'matched' | 'mismatch'
  enrolledAt: Date
  createdAt: Date
  updatedAt: Date
}

export interface CreateStudentInput {
  schoolId: string
  firstName: string
  lastName: string
  dateOfBirth?: string | null
  studentNumber?: string | null
  email?: string | null
  status?: 'active'
}

export interface UpdateStudentInput {
  firstName?: string
  lastName?: string
  dateOfBirth?: string | null
  studentNumber?: string | null
  email?: string | null
}

interface CanonicalStudentFunctionRow extends Record<string, unknown> {
  personId: string
  legacyStudentId: string
  schoolEnrollmentId: string
  studentAffiliationId: string
  evidenceId: string
  occurredAt: Date | string
}

interface NormalizedStudentData {
  firstName: string
  lastName: string
  displayName: string
  normalizedDisplayName: string
  dateOfBirth: string | null
  studentNumber: string | null
  email: string | null
  normalizedEmail: string | null
}

interface StudentLookup {
  schoolId?: string
  studentId?: string
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

export type StudentValidationError = { field: string; message: string }

function studentAuditSnapshot(student: CanonicalStudent): Record<string, AuditSummaryValue> {
  return {
    schoolId: student.schoolId,
    status: student.status,
  }
}

function normalizeHumanName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ')
}

function normalizeStudentData(input: {
  firstName: string
  lastName: string
  dateOfBirth?: string | null
  studentNumber?: string | null
  email?: string | null
}): NormalizedStudentData {
  const firstName = normalizeHumanName(input.firstName)
  const lastName = normalizeHumanName(input.lastName)
  const displayName = `${firstName} ${lastName}`
  const email = input.email?.normalize('NFKC').trim() || null
  return {
    firstName,
    lastName,
    displayName,
    normalizedDisplayName: displayName.toLocaleLowerCase('en'),
    dateOfBirth: input.dateOfBirth || null,
    studentNumber: input.studentNumber?.normalize('NFKC').trim() || null,
    email,
    normalizedEmail: email?.toLocaleLowerCase('en') ?? null,
  }
}

function canonicalStudentFromMutation(
  row: CanonicalStudentFunctionRow,
  input: NormalizedStudentData & { tenantId: string; schoolId: string; schoolName: string },
  occurredAt: Date
): CanonicalStudent {
  return Object.freeze({
    id: row.personId,
    personId: row.personId,
    legacyStudentId: row.legacyStudentId,
    schoolEnrollmentId: row.schoolEnrollmentId,
    studentAffiliationId: row.studentAffiliationId,
    tenantId: input.tenantId,
    schoolId: input.schoolId,
    schoolName: input.schoolName,
    firstName: input.firstName,
    lastName: input.lastName,
    dateOfBirth: input.dateOfBirth,
    studentNumber: input.studentNumber,
    email: input.email,
    status: 'active',
    source: 'canonical',
    parityStatus: 'matched',
    enrolledAt: occurredAt,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  })
}

async function recordStudentMutationFailure(
  error: unknown,
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  eventType: 'student.create' | 'student.update',
  targetId?: string
): Promise<never> {
  const normalizedError = normalizeStudentMutationError(error)
  const outcome =
    normalizedError instanceof TRPCError && normalizedError.code === 'FORBIDDEN'
      ? 'denied'
      : 'failed'
  try {
    await recordAuditAttempt(databaseContext, context, decision, {
      eventType,
      outcome,
      targetType: 'person',
      ...(targetId ? { targetId } : {}),
      dataClasses: ['student_personal'],
      change: { changedFields: ['operation'] },
    })
  } catch (auditError) {
    throw new AggregateError(
      [normalizedError, auditError],
      'Student mutation failed and its failure evidence could not be recorded'
    )
  }
  throw normalizedError
}

function databaseErrorCode(error: unknown): string | null {
  let current = error
  const visited = new Set<object>()
  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== 'object' || visited.has(current)) return null
    visited.add(current)
    const candidate = current as { cause?: unknown; code?: unknown }
    if (typeof candidate.code === 'string' && /^\d{5}$/.test(candidate.code)) {
      return candidate.code
    }
    current = candidate.cause
  }
  return null
}

function normalizeStudentMutationError(error: unknown): unknown {
  if (error instanceof TRPCError) return error
  const code = databaseErrorCode(error)
  if (code === '23505' || code === '23P01') {
    return new TRPCError({
      code: 'CONFLICT',
      message: 'A learner with this student number or active enrollment already exists',
      cause: error,
    })
  }
  if (code === '23503' || code === '23514') {
    return new TRPCError({
      code: 'CONFLICT',
      message: 'The learner record changed or no longer matches the selected school',
      cause: error,
    })
  }
  return error
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

async function loadAuthorizedStudents(
  db: DatabaseTransaction,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  expectedCapability: Capability,
  lookup: StudentLookup
): Promise<CanonicalStudent[]> {
  assertStudentSliceEnabled()
  tenantPolicyConstraints(context, decision, expectedCapability)
  const tenantId = context.tenantId
  if (!tenantId) policyScopeDenied()
  const at = new Date()
  const filters = [
    eq(schoolEnrollments.tenantId, tenantId),
    eq(schoolEnrollments.status, 'enrolled'),
    lte(schoolEnrollments.validFrom, at),
    or(isNull(schoolEnrollments.validUntil), gt(schoolEnrollments.validUntil, at)),
    eq(people.status, 'active'),
    eq(studentProfiles.status, 'active'),
    eq(affiliations.status, 'active'),
    lte(affiliations.validFrom, at),
    or(isNull(affiliations.validUntil), gt(affiliations.validUntil, at)),
  ]
  if (lookup.schoolId) filters.push(eq(schoolEnrollments.schoolId, lookup.schoolId))
  if (lookup.studentId) {
    const identifierFilter = or(
      eq(schoolEnrollments.personId, lookup.studentId),
      eq(schoolEnrollments.legacyStudentId, lookup.studentId)
    )
    if (identifierFilter) filters.push(identifierFilter)
  }

  const rows = await db
    .select({
      id: people.id,
      personId: people.id,
      legacyStudentId: students.id,
      schoolEnrollmentId: schoolEnrollments.id,
      studentAffiliationId: schoolEnrollments.studentAffiliationId,
      tenantId: schoolEnrollments.tenantId,
      schoolId: schoolEnrollments.schoolId,
      schoolName: schoolRecords.name,
      firstName: sql<string>`coalesce(${people.firstName}, '')`,
      lastName: sql<string>`coalesce(${people.lastName}, '')`,
      dateOfBirth: people.dateOfBirth,
      studentNumber: studentProfiles.studentNumber,
      email: people.email,
      status: sql<'active'>`'active'::text`,
      source: sql<'canonical'>`'canonical'::text`,
      parityStatus: sql<'matched' | 'mismatch'>`
        CASE
          WHEN ${people.firstName} IS NOT DISTINCT FROM ${students.firstName}
            AND ${people.lastName} IS NOT DISTINCT FROM ${students.lastName}
            AND ${people.dateOfBirth} IS NOT DISTINCT FROM ${students.dateOfBirth}
            AND ${studentProfiles.studentNumber} IS NOT DISTINCT FROM ${students.studentNumber}
            AND ${people.email} IS NOT DISTINCT FROM ${students.email}
            AND ${schoolEnrollments.schoolId} = ${students.schoolId}
          THEN 'matched'
          ELSE 'mismatch'
        END
      `,
      enrolledAt: schoolEnrollments.validFrom,
      createdAt: people.createdAt,
      updatedAt: sql<Date>`greatest(
        ${people.updatedAt},
        ${studentProfiles.updatedAt},
        ${schoolEnrollments.updatedAt}
      )`,
    })
    .from(schoolEnrollments)
    .innerJoin(
      schoolRecords,
      and(
        eq(schoolRecords.tenantId, schoolEnrollments.tenantId),
        eq(schoolRecords.id, schoolEnrollments.schoolId)
      )
    )
    .innerJoin(
      people,
      and(
        eq(people.tenantId, schoolEnrollments.tenantId),
        eq(people.id, schoolEnrollments.personId)
      )
    )
    .innerJoin(
      studentProfiles,
      and(
        eq(studentProfiles.tenantId, schoolEnrollments.tenantId),
        eq(studentProfiles.personId, schoolEnrollments.personId),
        eq(studentProfiles.legacyStudentId, schoolEnrollments.legacyStudentId)
      )
    )
    .innerJoin(
      affiliations,
      and(
        eq(affiliations.tenantId, schoolEnrollments.tenantId),
        eq(affiliations.id, schoolEnrollments.studentAffiliationId),
        eq(affiliations.personId, schoolEnrollments.personId),
        eq(affiliations.kind, 'student'),
        eq(affiliations.scopeType, 'school'),
        eq(affiliations.schoolId, schoolEnrollments.schoolId)
      )
    )
    .innerJoin(
      students,
      and(
        eq(students.tenantId, schoolEnrollments.tenantId),
        eq(students.id, schoolEnrollments.legacyStudentId)
      )
    )
    .where(and(...filters))
    .orderBy(people.normalizedDisplayName, people.id)
    .limit(lookup.studentId ? 1 : MAX_STUDENT_ROWS)

  return rows.map((row) =>
    Object.freeze({
      ...row,
      enrolledAt: new Date(row.enrolledAt),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    })
  )
}

export async function getStudentsInTransaction(
  db: DatabaseTransaction,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  expectedCapability: Capability,
  lookup: Readonly<{ schoolId?: string; studentId?: string }>
): Promise<CanonicalStudent[]> {
  return loadAuthorizedStudents(db, context, decision, expectedCapability, lookup)
}

export async function getStudentsBySchool(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  schoolId: string
): Promise<CanonicalStudent[]> {
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
): Promise<CanonicalStudent | null> {
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
  data: CreateStudentInput
): Promise<CanonicalStudent> {
  assertStudentSliceEnabled()
  assertDatabasePolicyContext(databaseContext, context)
  if (decision.capability !== CAPABILITIES.STUDENTS_CREATE) policyScopeDenied()

  const personId = crypto.randomUUID()
  const legacyStudentId = crypto.randomUUID()
  const schoolEnrollmentId = crypto.randomUUID()
  const studentAffiliationId = crypto.randomUUID()
  const evidenceId = crypto.randomUUID()
  const validFrom = new Date()
  const normalized = normalizeStudentData(data)

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

        const rows = await db.execute<CanonicalStudentFunctionRow>(sql`
          select
            person_id as "personId",
            legacy_student_id as "legacyStudentId",
            school_enrollment_id as "schoolEnrollmentId",
            student_affiliation_id as "studentAffiliationId",
            evidence_id as "evidenceId",
            created_at as "occurredAt"
          from openschool_private.admit_canonical_student(
            ${personId}::uuid,
            ${legacyStudentId}::uuid,
            ${schoolEnrollmentId}::uuid,
            ${studentAffiliationId}::uuid,
            ${evidenceId}::uuid,
            ${school.id}::uuid,
            ${normalized.firstName},
            ${normalized.lastName},
            ${normalized.displayName},
            ${normalized.normalizedDisplayName},
            ${normalized.dateOfBirth}::date,
            ${normalized.studentNumber},
            ${normalized.email},
            ${normalized.normalizedEmail},
            ${validFrom.toISOString()}::timestamp with time zone
          )
        `)
        const row = rows[0]
        if (!row) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'CREATE_FAILED' })
        }
        const occurredAt = new Date(row.occurredAt)
        const created = canonicalStudentFromMutation(
          row,
          {
            ...normalized,
            tenantId: school.tenantId,
            schoolId: school.id,
            schoolName: school.name,
          },
          occurredAt
        )
        await appendAuditEventInTransaction(db, databaseContext, context, decision, {
          eventType: 'student.create',
          outcome: 'succeeded',
          targetType: 'person',
          targetId: created.personId,
          dataClasses: ['student_personal'],
          change: {
            changedFields: [
              'person',
              'studentProfile',
              'schoolEnrollment',
              'studentAffiliation',
              'legacyCompatibility',
            ],
            after: studentAuditSnapshot(created),
          },
          outbox: {
            topic: 'audit.event.committed',
            deduplicationKey: `student.create:${databaseContext.requestId}:${created.personId}`,
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
  data: UpdateStudentInput
): Promise<CanonicalStudent> {
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

        const normalized = normalizeStudentData({
          firstName: data.firstName ?? existing.firstName,
          lastName: data.lastName ?? existing.lastName,
          dateOfBirth: data.dateOfBirth === undefined ? existing.dateOfBirth : data.dateOfBirth,
          studentNumber:
            data.studentNumber === undefined ? existing.studentNumber : data.studentNumber,
          email: data.email === undefined ? existing.email : data.email,
        })
        const evidenceId = crypto.randomUUID()
        const rows = await db.execute<CanonicalStudentFunctionRow>(sql`
          select
            person_id as "personId",
            legacy_student_id as "legacyStudentId",
            school_enrollment_id as "schoolEnrollmentId",
            student_affiliation_id as "studentAffiliationId",
            evidence_id as "evidenceId",
            updated_at as "occurredAt"
          from openschool_private.update_canonical_student(
            ${existing.personId}::uuid,
            ${evidenceId}::uuid,
            ${normalized.firstName},
            ${normalized.lastName},
            ${normalized.displayName},
            ${normalized.normalizedDisplayName},
            ${normalized.dateOfBirth}::date,
            ${normalized.studentNumber},
            ${normalized.email},
            ${normalized.normalizedEmail}
          )
        `)
        const row = rows[0]
        if (!row) {
          throw new TRPCError({ code: 'CONFLICT', message: 'RESOURCE_CHANGED' })
        }
        const updatedAt = new Date(row.occurredAt)
        const updated: CanonicalStudent = Object.freeze({
          ...existing,
          ...normalized,
          parityStatus: 'matched',
          updatedAt,
        })
        await appendAuditEventInTransaction(db, databaseContext, context, decision, {
          eventType: 'student.update',
          outcome: 'succeeded',
          targetType: 'person',
          targetId: existing.personId,
          dataClasses: ['student_personal'],
          change: {
            changedFields: Object.keys(data).sort(),
            before: studentAuditSnapshot(existing),
            after: studentAuditSnapshot(updated),
          },
          outbox: {
            topic: 'audit.event.committed',
            deduplicationKey: `student.update:${databaseContext.requestId}:${existing.personId}`,
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

export function validateStudentData(data: StudentValidationData): StudentValidationError[] {
  return validateStudentFields(data, { requireNames: true })
}

export function validateStudentUpdateData(data: StudentValidationData): StudentValidationError[] {
  return validateStudentFields(data, { requireNames: false })
}

function dateOnlyIsValid(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function validateStudentFields(
  data: StudentValidationData,
  options: StudentValidationOptions
): StudentValidationError[] {
  const errors: StudentValidationError[] = []
  const firstName = data.firstName === undefined ? undefined : normalizeHumanName(data.firstName)
  const lastName = data.lastName === undefined ? undefined : normalizeHumanName(data.lastName)
  if ((options.requireNames && !firstName) || firstName === '') {
    errors.push({ field: 'firstName', message: 'First name is required' })
  } else if (firstName && firstName.length > 100) {
    errors.push({ field: 'firstName', message: 'First name must be 100 characters or fewer' })
  }
  if ((options.requireNames && !lastName) || lastName === '') {
    errors.push({ field: 'lastName', message: 'Last name is required' })
  } else if (lastName && lastName.length > 100) {
    errors.push({ field: 'lastName', message: 'Last name must be 100 characters or fewer' })
  }
  if (data.dateOfBirth) {
    const dob =
      typeof data.dateOfBirth === 'string'
        ? dateOnlyIsValid(data.dateOfBirth)
          ? new Date(`${data.dateOfBirth}T00:00:00.000Z`)
          : null
        : data.dateOfBirth
    if (!dob || Number.isNaN(dob.getTime())) {
      errors.push({ field: 'dateOfBirth', message: 'Enter a valid date of birth' })
    } else if (dob.getTime() > Date.now()) {
      errors.push({ field: 'dateOfBirth', message: 'Date of birth cannot be in the future' })
    }
  }
  if (data.email?.trim() && !EMAIL_PATTERN.test(data.email.normalize('NFKC').trim())) {
    errors.push({ field: 'email', message: 'Enter a valid email address' })
  }
  return errors
}
