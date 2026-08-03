import { appendAuditEventInTransaction, recordAuditAttempt } from '@openschool/audit'
import {
  type DatabaseTransaction,
  type TenantDatabaseContext,
  academicTerms,
  academicYears,
  learnerLevels,
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
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { assertDatabasePolicyContext, toDatabasePolicyContext } from './database-context'
import { getSchoolByIdInTransaction } from './schools'

const MAX_ACADEMIC_YEARS = 50
const MAX_POLICY_CONSTRAINTS = 16
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export interface AcademicTermInput {
  code: string
  name: string
  startDate: string
  endDate: string
}

export interface LearnerLevelInput {
  code: string
  name: string
  educationStage?: string | null
}

export interface CreateAcademicYearInput {
  schoolId: string
  code: string
  name: string
  timeZone: string
  startDate: string
  endDate: string
  terms: readonly AcademicTermInput[]
  levels: readonly LearnerLevelInput[]
}

export interface AcademicTermView extends AcademicTermInput {
  id: string
  ordinal: number
}

export interface LearnerLevelView extends LearnerLevelInput {
  id: string
  ordinal: number
}

export interface AcademicYearView {
  id: string
  tenantId: string
  schoolId: string
  code: string
  name: string
  timeZone: string
  startDate: string
  endDate: string
  status: 'draft' | 'published' | 'closed'
  source: 'native' | 'legacy_backfill'
  migrationReviewStatus: 'not_required' | 'needs_review' | 'approved'
  isCurrent: boolean
  publishedAt: Date | null
  closedAt: Date | null
  closureReason: string | null
  createdAt: Date
  updatedAt: Date
  terms: readonly AcademicTermView[]
  levels: readonly LearnerLevelView[]
}

interface AcademicMutationRow extends Record<string, unknown> {
  academicYearId: string
  status: 'draft' | 'published' | 'closed'
  occurredAt: Date | string
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

function dateOnlyIsValid(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function normalizeCode(value: string, label: string): string {
  const normalized = value.normalize('NFKC').trim()
  if (normalized.length < 1 || normalized.length > 64 || !CODE_PATTERN.test(normalized)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `${label} must be 1–64 letters, numbers, dots, underscores, or hyphens`,
    })
  }
  return normalized
}

function normalizeName(value: string, label: string, maxLength = 128): string {
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ')
  if (normalized.length < 1 || normalized.length > maxLength) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `${label} must be between 1 and ${maxLength} characters`,
    })
  }
  return normalized
}

export function normalizeAcademicYearInput(
  input: CreateAcademicYearInput
): CreateAcademicYearInput {
  if (!dateOnlyIsValid(input.startDate) || !dateOnlyIsValid(input.endDate)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Enter valid Academic Year dates' })
  }
  if (input.endDate < input.startDate) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Academic Year end date must be on or after its start date',
    })
  }
  const timeZone = input.timeZone.normalize('NFKC').trim()
  if (timeZone.length < 1 || timeZone.length > 128) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Select a valid School time zone' })
  }
  if (input.terms.length < 1 || input.terms.length > 20) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add between 1 and 20 Terms' })
  }
  if (input.levels.length < 1 || input.levels.length > 30) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add between 1 and 30 Learner Levels' })
  }

  const terms = input.terms.map((term, index) => {
    const previousTerm = index > 0 ? input.terms[index - 1] : undefined
    if (!dateOnlyIsValid(term.startDate) || !dateOnlyIsValid(term.endDate)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Term ${index + 1} needs valid dates`,
      })
    }
    if (
      term.endDate < term.startDate ||
      term.startDate < input.startDate ||
      term.endDate > input.endDate
    ) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Term ${index + 1} must be contained within the Academic Year`,
      })
    }
    if (previousTerm && term.startDate <= previousTerm.endDate) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Terms must be in date order and cannot overlap',
      })
    }
    return {
      code: normalizeCode(term.code, `Term ${index + 1} code`),
      name: normalizeName(term.name, `Term ${index + 1} name`),
      startDate: term.startDate,
      endDate: term.endDate,
    }
  })
  const levels = input.levels.map((level, index) => ({
    code: normalizeCode(level.code, `Learner Level ${index + 1} code`),
    name: normalizeName(level.name, `Learner Level ${index + 1} name`),
    educationStage: level.educationStage
      ? normalizeName(level.educationStage, `Learner Level ${index + 1} stage`, 64)
      : null,
  }))
  if (new Set(terms.map(({ code }) => code)).size !== terms.length) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Term codes must be unique' })
  }
  if (new Set(levels.map(({ code }) => code)).size !== levels.length) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Learner Level codes must be unique' })
  }

  return {
    schoolId: input.schoolId,
    code: normalizeCode(input.code, 'Academic Year code'),
    name: normalizeName(input.name, 'Academic Year name'),
    timeZone,
    startDate: input.startDate,
    endDate: input.endDate,
    terms,
    levels,
  }
}

function databaseErrorCode(error: unknown): string | null {
  let current = error
  const visited = new Set<object>()
  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== 'object' || visited.has(current)) return null
    visited.add(current)
    const candidate = current as { cause?: unknown; code?: unknown }
    if (typeof candidate.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return candidate.code
    }
    current = candidate.cause
  }
  return null
}

export function normalizeAcademicMutationError(error: unknown): unknown {
  if (error instanceof TRPCError) return error
  switch (databaseErrorCode(error)) {
    case '23P01':
      return new TRPCError({
        code: 'CONFLICT',
        message: 'These dates overlap another Academic Year or Term. Adjust the dates and retry.',
        cause: error,
      })
    case '23505':
      return new TRPCError({
        code: 'CONFLICT',
        message: 'A code or display order is already in use in this Academic Year.',
        cause: error,
      })
    case '23503':
    case '42501':
      return new TRPCError({ code: 'FORBIDDEN', message: 'POLICY_SCOPE_MISMATCH', cause: error })
    case '22023':
    case '23514':
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: 'The Academic Year structure is invalid. Review its dates, time zone, and order.',
        cause: error,
      })
    case '40001':
    case '55000':
      return new TRPCError({
        code: 'CONFLICT',
        message: 'The Academic Year changed or is no longer in the required lifecycle state.',
        cause: error,
      })
    default:
      return error
  }
}

async function recordAcademicMutationFailure(
  error: unknown,
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  eventType:
    | 'academic_year.create'
    | 'academic_year.review'
    | 'academic_year.publish'
    | 'academic_year.close',
  targetId?: string
): Promise<never> {
  const normalizedError = normalizeAcademicMutationError(error)
  const outcome =
    normalizedError instanceof TRPCError && normalizedError.code === 'FORBIDDEN'
      ? 'denied'
      : 'failed'
  try {
    await recordAuditAttempt(databaseContext, context, decision, {
      eventType,
      outcome,
      targetType: 'academic_year',
      ...(targetId ? { targetId } : {}),
      dataClasses: ['internal'],
      change: { changedFields: ['operation'] },
    })
  } catch (auditError) {
    throw new AggregateError(
      [normalizedError, auditError],
      'Academic Year mutation failed and its failure evidence could not be recorded'
    )
  }
  throw normalizedError
}

async function ensureAuthorizedSchool(
  db: DatabaseTransaction,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  expectedCapability: Capability,
  schoolId: string
): Promise<void> {
  tenantPolicyConstraints(context, decision, expectedCapability)
  const school = await getSchoolByIdInTransaction(
    db,
    context,
    decision,
    schoolId,
    expectedCapability
  )
  if (!school) policyScopeDenied()
}

async function loadAcademicYearsInTransaction(
  db: DatabaseTransaction,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  expectedCapability: Capability,
  schoolId: string,
  academicYearId?: string
): Promise<AcademicYearView[]> {
  await ensureAuthorizedSchool(db, context, decision, expectedCapability, schoolId)
  const tenantId = context.tenantId
  if (!tenantId) policyScopeDenied()
  const filters = [eq(academicYears.tenantId, tenantId), eq(academicYears.schoolId, schoolId)]
  if (academicYearId) filters.push(eq(academicYears.id, academicYearId))
  const years = await db
    .select({
      id: academicYears.id,
      tenantId: academicYears.tenantId,
      schoolId: academicYears.schoolId,
      code: academicYears.code,
      name: academicYears.name,
      timeZone: academicYears.timeZone,
      startDate: academicYears.startDate,
      endDate: academicYears.endDate,
      status: academicYears.status,
      source: academicYears.source,
      migrationReviewStatus: academicYears.migrationReviewStatus,
      isCurrent: sql<boolean>`(
        ${academicYears.status} = 'published'
        AND pg_catalog.timezone(${academicYears.timeZone}, pg_catalog.now())::date
          BETWEEN ${academicYears.startDate} AND ${academicYears.endDate}
      )`,
      publishedAt: academicYears.publishedAt,
      closedAt: academicYears.closedAt,
      closureReason: academicYears.closureReason,
      createdAt: academicYears.createdAt,
      updatedAt: academicYears.updatedAt,
    })
    .from(academicYears)
    .where(and(...filters))
    .orderBy(desc(academicYears.startDate), desc(academicYears.id))
    .limit(academicYearId ? 1 : MAX_ACADEMIC_YEARS)

  if (years.length === 0) return []
  const yearIds = years.map(({ id }) => id)
  const [terms, levels] = await Promise.all([
    db
      .select()
      .from(academicTerms)
      .where(
        and(
          eq(academicTerms.tenantId, tenantId),
          eq(academicTerms.schoolId, schoolId),
          inArray(academicTerms.academicYearId, yearIds)
        )
      )
      .orderBy(asc(academicTerms.ordinal), asc(academicTerms.id)),
    db
      .select()
      .from(learnerLevels)
      .where(
        and(
          eq(learnerLevels.tenantId, tenantId),
          eq(learnerLevels.schoolId, schoolId),
          inArray(learnerLevels.academicYearId, yearIds)
        )
      )
      .orderBy(asc(learnerLevels.ordinal), asc(learnerLevels.id)),
  ])

  return years.map((year) =>
    Object.freeze({
      ...year,
      publishedAt: year.publishedAt ? new Date(year.publishedAt) : null,
      closedAt: year.closedAt ? new Date(year.closedAt) : null,
      createdAt: new Date(year.createdAt),
      updatedAt: new Date(year.updatedAt),
      terms: terms
        .filter(({ academicYearId: id }) => id === year.id)
        .map((term) =>
          Object.freeze({
            id: term.id,
            code: term.code,
            name: term.name,
            ordinal: term.ordinal,
            startDate: term.startDate,
            endDate: term.endDate,
          })
        ),
      levels: levels
        .filter(({ academicYearId: id }) => id === year.id)
        .map((level) =>
          Object.freeze({
            id: level.id,
            code: level.code,
            name: level.name,
            ordinal: level.ordinal,
            educationStage: level.educationStage,
          })
        ),
    })
  )
}

export async function getAcademicYears(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  schoolId: string
): Promise<AcademicYearView[]> {
  assertDatabasePolicyContext(databaseContext, context)
  return withPolicyTenantTransaction(databaseContext, toDatabasePolicyContext(decision), (db) =>
    loadAcademicYearsInTransaction(
      db,
      context,
      decision,
      CAPABILITIES.ACADEMIC_STRUCTURE_READ,
      schoolId
    )
  )
}

export async function createAcademicYear(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  input: CreateAcademicYearInput
): Promise<AcademicYearView> {
  assertDatabasePolicyContext(databaseContext, context)
  const normalized = normalizeAcademicYearInput(input)
  const academicYearId = crypto.randomUUID()
  try {
    return await withPolicyTenantTransaction(
      databaseContext,
      toDatabasePolicyContext(decision),
      async (db) => {
        await ensureAuthorizedSchool(
          db,
          context,
          decision,
          CAPABILITIES.ACADEMIC_STRUCTURE_MANAGE,
          normalized.schoolId
        )
        const terms = normalized.terms.map((term, index) => ({
          code: term.code,
          name: term.name,
          ordinal: index + 1,
          start_date: term.startDate,
          end_date: term.endDate,
        }))
        const levels = normalized.levels.map((level, index) => ({
          code: level.code,
          name: level.name,
          ordinal: index + 1,
          education_stage: level.educationStage ?? null,
        }))
        const rows = await db.execute<AcademicMutationRow>(sql`
          select academic_year_id as "academicYearId", status,
            occurred_at as "occurredAt"
          from openschool_private.create_academic_year(
            ${academicYearId}::uuid,
            ${normalized.schoolId}::uuid,
            ${normalized.code},
            ${normalized.name},
            ${normalized.timeZone},
            ${normalized.startDate}::date,
            ${normalized.endDate}::date,
            ${JSON.stringify(terms)}::jsonb,
            ${JSON.stringify(levels)}::jsonb
          )
        `)
        if (!rows[0]) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'CREATE_FAILED' })
        }
        const [created] = await loadAcademicYearsInTransaction(
          db,
          context,
          decision,
          CAPABILITIES.ACADEMIC_STRUCTURE_MANAGE,
          normalized.schoolId,
          academicYearId
        )
        if (!created)
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'CREATE_FAILED' })
        await appendAuditEventInTransaction(db, databaseContext, context, decision, {
          eventType: 'academic_year.create',
          outcome: 'succeeded',
          targetType: 'academic_year',
          targetId: academicYearId,
          dataClasses: ['internal'],
          change: {
            changedFields: ['academicYear', 'terms', 'learnerLevels'],
            after: { schoolId: normalized.schoolId, status: created.status },
          },
          outbox: {
            topic: 'audit.event.committed',
            deduplicationKey: `academic_year.create:${databaseContext.requestId}:${academicYearId}`,
          },
        })
        return created
      }
    )
  } catch (error) {
    return recordAcademicMutationFailure(
      error,
      databaseContext,
      context,
      decision,
      'academic_year.create',
      academicYearId
    )
  }
}

async function transitionAcademicYear(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  academicYearId: string,
  eventType: 'academic_year.review' | 'academic_year.publish' | 'academic_year.close',
  reason?: string
): Promise<AcademicYearView> {
  assertDatabasePolicyContext(databaseContext, context)
  try {
    return await withPolicyTenantTransaction(
      databaseContext,
      toDatabasePolicyContext(decision),
      async (db) => {
        tenantPolicyConstraints(context, decision, CAPABILITIES.ACADEMIC_STRUCTURE_MANAGE)
        const tenantId = context.tenantId
        if (!tenantId) policyScopeDenied()
        const [located] = await db
          .select({ schoolId: academicYears.schoolId, status: academicYears.status })
          .from(academicYears)
          .where(and(eq(academicYears.tenantId, tenantId), eq(academicYears.id, academicYearId)))
          .limit(1)
        if (!located) throw new TRPCError({ code: 'NOT_FOUND', message: 'Academic Year not found' })
        await ensureAuthorizedSchool(
          db,
          context,
          decision,
          CAPABILITIES.ACADEMIC_STRUCTURE_MANAGE,
          located.schoolId
        )

        if (eventType === 'academic_year.review') {
          await db.execute(sql`
            select * from openschool_private.approve_academic_year_review(
              ${academicYearId}::uuid
            )
          `)
        } else if (eventType === 'academic_year.publish') {
          await db.execute(sql`
            select * from openschool_private.publish_academic_year(${academicYearId}::uuid)
          `)
        } else {
          await db.execute(sql`
            select * from openschool_private.close_academic_year(
              ${academicYearId}::uuid,
              ${reason ?? ''}
            )
          `)
        }
        const [updated] = await loadAcademicYearsInTransaction(
          db,
          context,
          decision,
          CAPABILITIES.ACADEMIC_STRUCTURE_MANAGE,
          located.schoolId,
          academicYearId
        )
        if (!updated) throw new TRPCError({ code: 'CONFLICT', message: 'RESOURCE_CHANGED' })
        await appendAuditEventInTransaction(db, databaseContext, context, decision, {
          eventType,
          outcome: 'succeeded',
          targetType: 'academic_year',
          targetId: academicYearId,
          dataClasses: ['internal'],
          change: {
            changedFields:
              eventType === 'academic_year.review'
                ? ['migrationReviewStatus']
                : eventType === 'academic_year.publish'
                  ? ['status', 'publishedAt']
                  : ['status', 'closedAt', 'closureReason'],
            before: { schoolId: located.schoolId, status: located.status },
            after: { schoolId: updated.schoolId, status: updated.status },
          },
          outbox: {
            topic: 'audit.event.committed',
            deduplicationKey: `${eventType}:${databaseContext.requestId}:${academicYearId}`,
          },
        })
        return updated
      }
    )
  } catch (error) {
    return recordAcademicMutationFailure(
      error,
      databaseContext,
      context,
      decision,
      eventType,
      academicYearId
    )
  }
}

export function approveAcademicYearReview(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  academicYearId: string
): Promise<AcademicYearView> {
  return transitionAcademicYear(
    databaseContext,
    context,
    decision,
    academicYearId,
    'academic_year.review'
  )
}

export function publishAcademicYear(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  academicYearId: string
): Promise<AcademicYearView> {
  return transitionAcademicYear(
    databaseContext,
    context,
    decision,
    academicYearId,
    'academic_year.publish'
  )
}

export function closeAcademicYear(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  academicYearId: string,
  reason: string
): Promise<AcademicYearView> {
  const normalizedReason = normalizeName(reason, 'Closure reason', 512)
  if (normalizedReason.length < 3) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Closure reason must be at least 3 characters',
    })
  }
  return transitionAcademicYear(
    databaseContext,
    context,
    decision,
    academicYearId,
    'academic_year.close',
    normalizedReason
  )
}
