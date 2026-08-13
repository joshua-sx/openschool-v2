import { appendAuditEventInTransaction, recordAuditAttempt } from '@openschool/audit'
import {
  type DatabaseTransaction,
  type TenantDatabaseContext,
  academicTerms,
  academicYears,
  courses,
  learnerLevels,
  people,
  schoolEnrollments,
  sectionCompatibilityEvidence,
  sectionRosterMemberships,
  sectionStaffAssignments,
  sections,
  withPolicyTenantTransaction,
} from '@openschool/db'
import {
  type AllowedPolicyDecision,
  CAPABILITIES,
  type Capability,
  type PolicyContext,
} from '@openschool/rbac'
import { TRPCError } from '@trpc/server'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { assertDatabasePolicyContext, toDatabasePolicyContext } from './database-context'
import { getSchoolByIdInTransaction } from './schools'

const MAX_SECTIONS = 250
const MAX_CANDIDATES = 500
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export interface CreateCourseInput {
  schoolId: string
  code: string
  name: string
  courseType: 'general' | 'subject' | 'elective' | 'support'
  subjectArea?: string | null
  description?: string | null
  creditValue?: number | null
  reason: string
}

export interface CreateSectionInput {
  schoolId: string
  academicYearId: string
  academicTermId?: string | null
  learnerLevelId?: string | null
  courseId?: string | null
  code: string
  name: string
  sectionType: 'homeroom' | 'course'
  startDate: string
  endDate: string
  capacity?: number | null
  reason: string
}

export interface AssignSectionStaffInput {
  sectionId: string
  personId: string
  role: 'lead_teacher' | 'teacher' | 'assistant' | 'counselor'
  isPrimary: boolean
  validFrom: string
  validUntil?: string | null
  reason: string
}

export interface AddSectionRosterInput {
  sectionId: string
  schoolEnrollmentId: string
  validFrom: string
  validUntil?: string | null
  reason: string
}

export interface SectionWorkspaceView {
  schoolId: string
  courses: readonly (typeof courses.$inferSelect)[]
  sections: readonly (typeof sections.$inferSelect)[]
  staffAssignments: readonly StaffAssignmentView[]
  rosterMemberships: readonly RosterMembershipView[]
  legacyCompatibility: readonly (typeof sectionCompatibilityEvidence.$inferSelect)[]
  academicYears: readonly (typeof academicYears.$inferSelect)[]
  terms: readonly (typeof academicTerms.$inferSelect)[]
  levels: readonly (typeof learnerLevels.$inferSelect)[]
  staffCandidates: readonly StaffCandidateView[]
  studentCandidates: readonly StudentCandidateView[]
}

interface StaffAssignmentView {
  id: string
  sectionId: string
  personId: string
  displayName: string
  role: string
  isPrimary: boolean
  status: string
  validFrom: Date
  validUntil: Date | null
}

interface RosterMembershipView {
  id: string
  sectionId: string
  personId: string
  schoolEnrollmentId: string
  displayName: string
  status: string
  validFrom: Date
  validUntil: Date | null
}

interface StaffCandidateView extends Record<string, unknown> {
  id: string
  displayName: string
}

interface StudentCandidateView {
  schoolEnrollmentId: string
  personId: string
  displayName: string
  validFrom: Date
  validUntil: Date | null
}

type SectionEvent =
  | 'course.create'
  | 'section.create'
  | 'section.close'
  | 'section.staff.assign'
  | 'section.staff.end'
  | 'section.roster.add'
  | 'section.roster.end'

function scopeDenied(): never {
  throw new TRPCError({ code: 'FORBIDDEN', message: 'POLICY_SCOPE_MISMATCH' })
}

function assertDecision(
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  capability: Capability
): string {
  if (
    decision.capability !== capability ||
    !context.tenantId ||
    decision.queryConstraints.length < 1
  ) {
    scopeDenied()
  }
  if (decision.queryConstraints.some((constraint) => constraint.kind === 'platform')) scopeDenied()
  return context.tenantId
}

async function ensureSchool(
  db: DatabaseTransaction,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  capability: Capability,
  schoolId: string
): Promise<void> {
  assertDecision(context, decision, capability)
  const school = await getSchoolByIdInTransaction(db, context, decision, schoolId, capability)
  if (!school) scopeDenied()
}

function normalizedText(value: string, label: string, max: number): string {
  const result = value.normalize('NFKC').trim().replace(/\s+/g, ' ')
  if (result.length < 1 || result.length > max) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `${label} must be 1–${max} characters` })
  }
  return result
}

export function normalizedSectionReason(value: string): string {
  const result = normalizedText(value, 'Reason', 512)
  if (result.length < 3) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Reason must be at least 3 characters' })
  }
  return result
}

export function normalizedSectionCode(value: string): string {
  const result = value.normalize('NFKC').trim()
  if (!CODE_PATTERN.test(result) || result.length > 64) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Code contains unsupported characters' })
  }
  return result
}

function databaseErrorCode(error: unknown): string | null {
  let current = error
  const visited = new Set<object>()
  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== 'object' || visited.has(current)) return null
    visited.add(current)
    const candidate = current as { code?: unknown; cause?: unknown }
    if (typeof candidate.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return candidate.code
    }
    current = candidate.cause
  }
  return null
}

export function normalizeSectionMutationError(error: unknown): unknown {
  if (error instanceof TRPCError) return error
  switch (databaseErrorCode(error)) {
    case '23P01':
      return new TRPCError({
        code: 'CONFLICT',
        message: 'The effective dates overlap an existing assignment.',
        cause: error,
      })
    case '23505':
      return new TRPCError({
        code: 'CONFLICT',
        message: 'That code or active assignment already exists.',
        cause: error,
      })
    case '23503':
    case '42501':
      return new TRPCError({ code: 'FORBIDDEN', message: 'POLICY_SCOPE_MISMATCH', cause: error })
    case '22023':
    case '23514':
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: 'The Section, person, or effective dates are invalid.',
        cause: error,
      })
    case '40001':
    case '55000':
      return new TRPCError({
        code: 'CONFLICT',
        message: 'The Section changed or is no longer active.',
        cause: error,
      })
    default:
      return error
  }
}

async function recordFailure(
  error: unknown,
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  eventType: SectionEvent,
  targetType: string,
  targetId?: string
): Promise<never> {
  const normalized = normalizeSectionMutationError(error)
  try {
    await recordAuditAttempt(databaseContext, context, decision, {
      eventType,
      outcome:
        normalized instanceof TRPCError && normalized.code === 'FORBIDDEN' ? 'denied' : 'failed',
      targetType,
      ...(targetId ? { targetId } : {}),
      dataClasses: ['internal'],
      change: { changedFields: ['operation'] },
    })
  } catch (auditError) {
    throw new AggregateError(
      [normalized, auditError],
      'Section mutation and failure audit both failed'
    )
  }
  throw normalized
}

async function appendSuccess(
  db: DatabaseTransaction,
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  eventType: SectionEvent,
  targetType: string,
  targetId: string,
  changedFields: readonly string[]
): Promise<void> {
  await appendAuditEventInTransaction(db, databaseContext, context, decision, {
    eventType,
    outcome: 'succeeded',
    targetType,
    targetId,
    dataClasses: ['internal'],
    change: { changedFields },
    outbox: {
      topic: 'audit.event.committed',
      deduplicationKey: `${eventType}:${databaseContext.requestId}:${targetId}`,
    },
  })
}

async function loadWorkspace(
  db: DatabaseTransaction,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  capability: Capability,
  schoolId: string
): Promise<SectionWorkspaceView> {
  const tenantId = assertDecision(context, decision, capability)
  const broadSchoolScope = decision.queryConstraints.some((constraint) =>
    ['tenant', 'organization_exact', 'organization_subtree', 'school'].includes(constraint.kind)
  )
  if (broadSchoolScope) {
    await ensureSchool(db, context, decision, capability, schoolId)
  }
  const [courseRows, sectionRows, yearRows, compatibilityRows] = await Promise.all([
    db
      .select()
      .from(courses)
      .where(and(eq(courses.tenantId, tenantId), eq(courses.schoolId, schoolId)))
      .orderBy(asc(courses.name), asc(courses.id)),
    db
      .select()
      .from(sections)
      .where(and(eq(sections.tenantId, tenantId), eq(sections.schoolId, schoolId)))
      .orderBy(desc(sections.startDate), asc(sections.name), asc(sections.id))
      .limit(MAX_SECTIONS),
    db
      .select()
      .from(academicYears)
      .where(and(eq(academicYears.tenantId, tenantId), eq(academicYears.schoolId, schoolId)))
      .orderBy(desc(academicYears.startDate)),
    db
      .select()
      .from(sectionCompatibilityEvidence)
      .where(
        and(
          eq(sectionCompatibilityEvidence.tenantId, tenantId),
          eq(sectionCompatibilityEvidence.schoolId, schoolId)
        )
      )
      .orderBy(asc(sectionCompatibilityEvidence.legacyClassId)),
  ])
  const sectionIds = sectionRows.map(({ id }) => id)
  const yearIds = yearRows.map(({ id }) => id)
  const [staffRows, rosterRows, termRows, levelRows] = await Promise.all([
    sectionIds.length
      ? db
          .select({
            id: sectionStaffAssignments.id,
            sectionId: sectionStaffAssignments.sectionId,
            personId: sectionStaffAssignments.personId,
            displayName: people.displayName,
            role: sectionStaffAssignments.role,
            isPrimary: sectionStaffAssignments.isPrimary,
            status: sectionStaffAssignments.status,
            validFrom: sectionStaffAssignments.validFrom,
            validUntil: sectionStaffAssignments.validUntil,
          })
          .from(sectionStaffAssignments)
          .innerJoin(
            people,
            and(
              eq(people.tenantId, sectionStaffAssignments.tenantId),
              eq(people.id, sectionStaffAssignments.personId)
            )
          )
          .where(
            and(
              eq(sectionStaffAssignments.tenantId, tenantId),
              inArray(sectionStaffAssignments.sectionId, sectionIds)
            )
          )
          .orderBy(desc(sectionStaffAssignments.validFrom))
      : [],
    sectionIds.length
      ? db
          .select({
            id: sectionRosterMemberships.id,
            sectionId: sectionRosterMemberships.sectionId,
            personId: sectionRosterMemberships.personId,
            schoolEnrollmentId: sectionRosterMemberships.schoolEnrollmentId,
            displayName: people.displayName,
            status: sectionRosterMemberships.status,
            validFrom: sectionRosterMemberships.validFrom,
            validUntil: sectionRosterMemberships.validUntil,
          })
          .from(sectionRosterMemberships)
          .innerJoin(
            people,
            and(
              eq(people.tenantId, sectionRosterMemberships.tenantId),
              eq(people.id, sectionRosterMemberships.personId)
            )
          )
          .where(
            and(
              eq(sectionRosterMemberships.tenantId, tenantId),
              inArray(sectionRosterMemberships.sectionId, sectionIds)
            )
          )
          .orderBy(desc(sectionRosterMemberships.validFrom))
      : [],
    yearIds.length
      ? db
          .select()
          .from(academicTerms)
          .where(
            and(
              eq(academicTerms.tenantId, tenantId),
              inArray(academicTerms.academicYearId, yearIds)
            )
          )
          .orderBy(asc(academicTerms.ordinal))
      : [],
    yearIds.length
      ? db
          .select()
          .from(learnerLevels)
          .where(
            and(
              eq(learnerLevels.tenantId, tenantId),
              inArray(learnerLevels.academicYearId, yearIds)
            )
          )
          .orderBy(asc(learnerLevels.ordinal))
      : [],
  ])
  let staffCandidates: readonly StaffCandidateView[] = []
  let studentCandidates: readonly StudentCandidateView[] = []
  if (capability === CAPABILITIES.SECTIONS_MANAGE) {
    staffCandidates = await db.execute<StaffCandidateView>(sql`
      select distinct person.id, person.display_name as "displayName"
      from people as person
      join affiliations as affiliation on affiliation.tenant_id = person.tenant_id
        and affiliation.person_id = person.id
      where person.tenant_id = ${tenantId}::uuid and person.status = 'active'
        and affiliation.school_id = ${schoolId}::uuid and affiliation.scope_type = 'school'
        and affiliation.kind in ('teacher', 'employee', 'administrator')
        and affiliation.status = 'active' and affiliation.valid_from <= now()
        and (affiliation.valid_until is null or affiliation.valid_until > now())
      order by person.display_name, person.id limit ${MAX_CANDIDATES}
    `)
    studentCandidates = await db
      .select({
        schoolEnrollmentId: schoolEnrollments.id,
        personId: schoolEnrollments.personId,
        displayName: people.displayName,
        validFrom: schoolEnrollments.validFrom,
        validUntil: schoolEnrollments.validUntil,
      })
      .from(schoolEnrollments)
      .innerJoin(
        people,
        and(
          eq(people.tenantId, schoolEnrollments.tenantId),
          eq(people.id, schoolEnrollments.personId)
        )
      )
      .where(
        and(
          eq(schoolEnrollments.tenantId, tenantId),
          eq(schoolEnrollments.schoolId, schoolId),
          eq(schoolEnrollments.status, 'enrolled')
        )
      )
      .orderBy(asc(people.normalizedDisplayName), asc(people.id))
      .limit(MAX_CANDIDATES)
  }
  return Object.freeze({
    schoolId,
    courses: courseRows,
    sections: sectionRows,
    staffAssignments: staffRows,
    rosterMemberships: rosterRows,
    legacyCompatibility: compatibilityRows,
    academicYears: yearRows,
    terms: termRows,
    levels: levelRows,
    staffCandidates,
    studentCandidates,
  })
}

export async function getSectionWorkspace(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  schoolId: string
): Promise<SectionWorkspaceView> {
  assertDatabasePolicyContext(databaseContext, context)
  return withPolicyTenantTransaction(databaseContext, toDatabasePolicyContext(decision), (db) =>
    loadWorkspace(db, context, decision, CAPABILITIES.SECTIONS_READ, schoolId)
  )
}

async function runMutation<T>(options: {
  databaseContext: TenantDatabaseContext
  context: PolicyContext
  decision: AllowedPolicyDecision
  schoolId?: string
  eventType: SectionEvent
  targetType: string
  targetId: string
  changedFields: readonly string[]
  execute: (db: DatabaseTransaction) => Promise<T>
}): Promise<T> {
  const { databaseContext, context, decision, eventType, targetType, targetId } = options
  assertDatabasePolicyContext(databaseContext, context)
  try {
    return await withPolicyTenantTransaction(
      databaseContext,
      toDatabasePolicyContext(decision),
      async (db) => {
        assertDecision(context, decision, CAPABILITIES.SECTIONS_MANAGE)
        if (options.schoolId)
          await ensureSchool(db, context, decision, CAPABILITIES.SECTIONS_MANAGE, options.schoolId)
        const result = await options.execute(db)
        await appendSuccess(
          db,
          databaseContext,
          context,
          decision,
          eventType,
          targetType,
          targetId,
          options.changedFields
        )
        return result
      }
    )
  } catch (error) {
    return recordFailure(error, databaseContext, context, decision, eventType, targetType, targetId)
  }
}

export function createCourse(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  input: CreateCourseInput
): Promise<{ id: string }> {
  const id = crypto.randomUUID()
  return runMutation({
    databaseContext,
    context,
    decision,
    schoolId: input.schoolId,
    eventType: 'course.create',
    targetType: 'course',
    targetId: id,
    changedFields: ['course'],
    execute: async (db) => {
      await db.execute(
        sql`select * from openschool_private.create_course(${id}::uuid, ${input.schoolId}::uuid, ${normalizedSectionCode(input.code)}, ${normalizedText(input.name, 'Name', 160)}, ${input.courseType}, ${input.subjectArea?.trim() || null}, ${input.description?.trim() || null}, ${input.creditValue ?? null}::numeric, ${normalizedSectionReason(input.reason)})`
      )
      return { id }
    },
  })
}

export function createSection(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  input: CreateSectionInput
): Promise<{ id: string }> {
  const id = crypto.randomUUID()
  return runMutation({
    databaseContext,
    context,
    decision,
    schoolId: input.schoolId,
    eventType: 'section.create',
    targetType: 'section',
    targetId: id,
    changedFields: ['section'],
    execute: async (db) => {
      await db.execute(
        sql`select * from openschool_private.create_section(${id}::uuid, ${input.schoolId}::uuid, ${input.academicYearId}::uuid, ${input.academicTermId ?? null}::uuid, ${input.learnerLevelId ?? null}::uuid, ${input.courseId ?? null}::uuid, ${normalizedSectionCode(input.code)}, ${normalizedText(input.name, 'Name', 160)}, ${input.sectionType}, ${input.startDate}::date, ${input.endDate}::date, ${input.capacity ?? null}::integer, ${normalizedSectionReason(input.reason)})`
      )
      return { id }
    },
  })
}

export function assignSectionStaff(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  input: AssignSectionStaffInput
): Promise<{ id: string }> {
  const id = crypto.randomUUID()
  return runMutation({
    databaseContext,
    context,
    decision,
    eventType: 'section.staff.assign',
    targetType: 'section_staff_assignment',
    targetId: id,
    changedFields: ['assignment'],
    execute: async (db) => {
      await db.execute(
        sql`select * from openschool_private.assign_section_staff(${id}::uuid, ${crypto.randomUUID()}::uuid, ${input.sectionId}::uuid, ${input.personId}::uuid, ${input.role}, ${input.isPrimary}, ${input.validFrom}::timestamptz, ${input.validUntil ?? null}::timestamptz, ${normalizedSectionReason(input.reason)})`
      )
      return { id }
    },
  })
}

export function addSectionRosterMember(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  input: AddSectionRosterInput
): Promise<{ id: string; capacityExceeded: boolean }> {
  const id = crypto.randomUUID()
  return runMutation({
    databaseContext,
    context,
    decision,
    eventType: 'section.roster.add',
    targetType: 'section_roster_membership',
    targetId: id,
    changedFields: ['membership'],
    execute: async (db) => {
      const rows = await db.execute<{ capacityExceeded: boolean }>(
        sql`select capacity_exceeded as "capacityExceeded" from openschool_private.add_section_roster_member(${id}::uuid, ${crypto.randomUUID()}::uuid, ${input.sectionId}::uuid, ${input.schoolEnrollmentId}::uuid, ${input.validFrom}::timestamptz, ${input.validUntil ?? null}::timestamptz, ${normalizedSectionReason(input.reason)})`
      )
      return { id, capacityExceeded: rows[0]?.capacityExceeded === true }
    },
  })
}

async function endRecord(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  type: 'staff' | 'roster',
  id: string,
  validUntil: string,
  reason: string
): Promise<{ id: string }> {
  const eventType = type === 'staff' ? 'section.staff.end' : 'section.roster.end'
  return runMutation({
    databaseContext,
    context,
    decision,
    eventType,
    targetType: type === 'staff' ? 'section_staff_assignment' : 'section_roster_membership',
    targetId: id,
    changedFields: ['status', 'validUntil'],
    execute: async (db) => {
      if (type === 'staff')
        await db.execute(
          sql`select * from openschool_private.end_section_staff_assignment(${id}::uuid, ${validUntil}::timestamptz, ${normalizedSectionReason(reason)})`
        )
      else
        await db.execute(
          sql`select * from openschool_private.end_section_roster_membership(${id}::uuid, ${validUntil}::timestamptz, ${normalizedSectionReason(reason)})`
        )
      return { id }
    },
  })
}

export const endSectionStaffAssignment = (
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  id: string,
  validUntil: string,
  reason: string
) => endRecord(databaseContext, context, decision, 'staff', id, validUntil, reason)
export const endSectionRosterMembership = (
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  id: string,
  validUntil: string,
  reason: string
) => endRecord(databaseContext, context, decision, 'roster', id, validUntil, reason)

export function closeSection(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  sectionId: string,
  reason: string
): Promise<{ id: string }> {
  return runMutation({
    databaseContext,
    context,
    decision,
    eventType: 'section.close',
    targetType: 'section',
    targetId: sectionId,
    changedFields: ['status', 'closedAt'],
    execute: async (db) => {
      await db.execute(
        sql`select * from openschool_private.close_section(${sectionId}::uuid, ${normalizedSectionReason(reason)})`
      )
      return { id: sectionId }
    },
  })
}
