import { appendAuditEventInTransaction, recordAuditAttempt } from '@openschool/audit'
import {
  type DatabaseTransaction,
  type TenantDatabaseContext,
  schoolEnrollmentTransitionEvents,
  schoolEnrollments,
  schools,
  withPolicyTenantTransaction,
} from '@openschool/db'
import {
  type AllowedPolicyDecision,
  CAPABILITIES,
  type Capability,
  type PolicyContext,
} from '@openschool/rbac'
import { TRPCError } from '@trpc/server'
import { and, asc, eq, sql } from 'drizzle-orm'
import {
  assertDatabasePolicyContext,
  assertStudentSliceEnabled,
  toDatabasePolicyContext,
} from './database-context'

export const ENROLLMENT_TRANSITION_TYPES = [
  'withdraw',
  'transfer',
  'graduate',
  'reenroll',
  'add_secondary',
  'end_secondary',
] as const

export type EnrollmentTransitionType = (typeof ENROLLMENT_TRANSITION_TYPES)[number]

export interface EnrollmentPeriodView {
  id: string
  personId: string
  schoolId: string
  schoolName: string
  enrollmentType: 'primary' | 'secondary'
  validFrom: Date
  validUntil: Date | null
  admissionReason: string
  endReason: 'withdrawal' | 'transfer' | 'graduation' | 'secondary_ended' | 'correction' | null
  endEvidenceReference: string | null
  version: number
  supersedesEnrollmentId: string | null
  isCurrent: boolean
}

export interface EnrollmentTransitionView {
  transitionId: string
  personId: string
  fromEnrollmentId: string | null
  toEnrollmentId: string | null
  sourceSchoolId: string | null
  destinationSchoolId: string | null
  transitionType: EnrollmentTransitionType
  effectiveAt: Date
  reason: string
  evidenceReference: string | null
  expectedEnrollmentVersion: number | null
  status: 'scheduled' | 'applied' | 'cancelled'
  scheduledAt: Date
  resolvedAt: Date | null
}

export interface EnrollmentHistoryView {
  periods: readonly EnrollmentPeriodView[]
  transitions: readonly EnrollmentTransitionView[]
}

export interface ScheduleEnrollmentTransitionInput {
  personId: string
  fromEnrollmentId?: string | null
  destinationSchoolId?: string | null
  transitionType: EnrollmentTransitionType
  effectiveAt: string
  reason: string
  evidenceReference?: string | null
  expectedEnrollmentVersion?: number | null
  applyImmediately?: boolean
}

interface TransitionFunctionRow extends Record<string, unknown> {
  eventId: string
  transitionId: string
  personId: string
  transitionType: EnrollmentTransitionType
  effectiveAt: Date | string
  eventType: 'scheduled' | 'applied' | 'cancelled'
  occurredAt: Date | string
}

function policyScopeDenied(): never {
  throw new TRPCError({ code: 'FORBIDDEN', message: 'POLICY_SCOPE_MISMATCH' })
}

function assertEnrollmentCapability(
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  expectedCapability: Capability
): string {
  if (decision.capability !== expectedCapability) policyScopeDenied()
  if (!context.tenantId || decision.queryConstraints.length === 0) policyScopeDenied()
  if (
    decision.queryConstraints.some(
      (constraint) => constraint.kind === 'platform' || constraint.tenantId !== context.tenantId
    )
  ) {
    policyScopeDenied()
  }
  return context.tenantId
}

function normalizedText(value: string, label: string, minimum = 3): string {
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ')
  if (normalized.length < minimum || normalized.length > 512) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `${label} must be between ${minimum} and 512 characters`,
    })
  }
  return normalized
}

function normalizedOptionalText(value?: string | null): string | null {
  if (!value?.trim()) return null
  return normalizedText(value, 'Evidence reference')
}

function normalizedEffectiveAt(value: string): Date {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Enter a valid effective date and time' })
  }
  return parsed
}

function databaseMessage(error: unknown): string | null {
  let current = error
  const visited = new Set<object>()
  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== 'object' || visited.has(current)) return null
    visited.add(current)
    const candidate = current as { cause?: unknown; message?: unknown }
    if (
      typeof candidate.message === 'string' &&
      (candidate.message.startsWith('ENROLLMENT_') ||
        candidate.message.startsWith('SCHOOL_ENROLLMENT_'))
    ) {
      return candidate.message.split('\n', 1)[0] ?? null
    }
    current = candidate.cause
  }
  return null
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

function enrollmentMutationError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error
  switch (databaseMessage(error)) {
    case 'ENROLLMENT_TRANSITION_CONTEXT_INVALID':
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: 'ENROLLMENT_TRANSITION_INVALID',
        cause: error,
      })
    case 'ENROLLMENT_TRANSITION_CONTEXT_STALE':
    case 'ENROLLMENT_TRANSITION_STALE':
      return new TRPCError({ code: 'CONFLICT', message: 'ENROLLMENT_CONTEXT_STALE', cause: error })
    case 'ENROLLMENT_TRANSITION_CONFLICT':
    case 'ENROLLMENT_TRANSITION_PENDING':
      return new TRPCError({
        code: 'CONFLICT',
        message: 'ENROLLMENT_TRANSITION_CONFLICT',
        cause: error,
      })
    case 'ENROLLMENT_TRANSITION_INVALID':
    case 'SCHOOL_ENROLLMENT_CLOSE_INVALID':
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: 'ENROLLMENT_TRANSITION_INVALID',
        cause: error,
      })
    case 'ENROLLMENT_TRANSITION_UNAVAILABLE':
      return new TRPCError({
        code: 'NOT_FOUND',
        message: 'ENROLLMENT_TRANSITION_UNAVAILABLE',
        cause: error,
      })
    default: {
      const errorCode = databaseErrorCode(error)
      if (errorCode === '23P01' || errorCode === '23505') {
        return new TRPCError({
          code: 'CONFLICT',
          message: 'ENROLLMENT_TRANSITION_CONFLICT',
          cause: error,
        })
      }
      if (errorCode === '23514') {
        return new TRPCError({
          code: 'BAD_REQUEST',
          message: 'ENROLLMENT_TRANSITION_INVALID',
          cause: error,
        })
      }
      if (errorCode === '23503') {
        return new TRPCError({
          code: 'NOT_FOUND',
          message: 'ENROLLMENT_TRANSITION_UNAVAILABLE',
          cause: error,
        })
      }
      return new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'ENROLLMENT_TRANSITION_FAILED',
        cause: error,
      })
    }
  }
}

async function recordEnrollmentFailure(
  error: unknown,
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  eventType:
    | 'student.enrollment.schedule'
    | 'student.enrollment.apply'
    | 'student.enrollment.cancel',
  targetId: string
): Promise<never> {
  const mapped = enrollmentMutationError(error)
  try {
    await recordAuditAttempt(databaseContext, context, decision, {
      eventType,
      outcome: mapped.code === 'FORBIDDEN' || mapped.code === 'NOT_FOUND' ? 'denied' : 'failed',
      targetType: 'school_enrollment_transition',
      targetId,
      dataClasses: ['student_personal'],
      change: { changedFields: ['operation'] },
    })
  } catch (auditError) {
    throw new TRPCError({
      code: mapped.code,
      message: mapped.message,
      cause: new AggregateError(
        [mapped.cause ?? error, auditError],
        'Enrollment transition failure evidence could not be recorded'
      ),
    })
  }
  throw mapped
}

async function loadEnrollmentHistoryInTransaction(
  db: DatabaseTransaction,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  expectedCapability: Capability,
  personId: string
): Promise<EnrollmentHistoryView> {
  const tenantId = assertEnrollmentCapability(context, decision, expectedCapability)
  const now = new Date()
  const periodRows = await db
    .select({
      id: schoolEnrollments.id,
      personId: schoolEnrollments.personId,
      schoolId: schoolEnrollments.schoolId,
      schoolName: schools.name,
      enrollmentType: schoolEnrollments.enrollmentType,
      validFrom: schoolEnrollments.validFrom,
      validUntil: schoolEnrollments.validUntil,
      admissionReason: schoolEnrollments.admissionReason,
      endReason: schoolEnrollments.endReason,
      endEvidenceReference: schoolEnrollments.endEvidenceReference,
      version: schoolEnrollments.version,
      supersedesEnrollmentId: schoolEnrollments.supersedesEnrollmentId,
    })
    .from(schoolEnrollments)
    .innerJoin(
      schools,
      and(
        eq(schools.tenantId, schoolEnrollments.tenantId),
        eq(schools.id, schoolEnrollments.schoolId)
      )
    )
    .where(and(eq(schoolEnrollments.tenantId, tenantId), eq(schoolEnrollments.personId, personId)))
    .orderBy(asc(schoolEnrollments.validFrom), asc(schoolEnrollments.id))

  const eventRows = await db
    .select()
    .from(schoolEnrollmentTransitionEvents)
    .where(
      and(
        eq(schoolEnrollmentTransitionEvents.tenantId, tenantId),
        eq(schoolEnrollmentTransitionEvents.personId, personId)
      )
    )
    .orderBy(
      asc(schoolEnrollmentTransitionEvents.effectiveAt),
      asc(schoolEnrollmentTransitionEvents.occurredAt),
      asc(schoolEnrollmentTransitionEvents.id)
    )

  const eventsByTransition = new Map<string, typeof eventRows>()
  for (const event of eventRows) {
    const events = eventsByTransition.get(event.transitionId) ?? []
    events.push(event)
    eventsByTransition.set(event.transitionId, events)
  }

  const periods = periodRows.map(
    (period): EnrollmentPeriodView =>
      Object.freeze({
        ...period,
        validFrom: new Date(period.validFrom),
        validUntil: period.validUntil ? new Date(period.validUntil) : null,
        version: Number(period.version),
        isCurrent:
          new Date(period.validFrom) <= now &&
          (!period.validUntil || new Date(period.validUntil) > now),
      })
  )
  const transitions = [...eventsByTransition.values()].flatMap((events) => {
    const scheduled = events.find((event) => event.eventType === 'scheduled')
    if (!scheduled) return []
    const resolved = events.find(
      (event) => event.eventType === 'applied' || event.eventType === 'cancelled'
    )
    return [
      Object.freeze({
        transitionId: scheduled.transitionId,
        personId: scheduled.personId,
        fromEnrollmentId: scheduled.fromEnrollmentId,
        toEnrollmentId: resolved?.toEnrollmentId ?? null,
        sourceSchoolId: scheduled.sourceSchoolId,
        destinationSchoolId: scheduled.destinationSchoolId,
        transitionType: scheduled.transitionType,
        effectiveAt: new Date(scheduled.effectiveAt),
        reason: scheduled.reason,
        evidenceReference: scheduled.evidenceReference,
        expectedEnrollmentVersion:
          scheduled.expectedEnrollmentVersion === null
            ? null
            : Number(scheduled.expectedEnrollmentVersion),
        status: resolved?.eventType ?? 'scheduled',
        scheduledAt: new Date(scheduled.occurredAt),
        resolvedAt: resolved ? new Date(resolved.occurredAt) : null,
      } satisfies EnrollmentTransitionView),
    ]
  })

  return Object.freeze({
    periods: Object.freeze(periods),
    transitions: Object.freeze(transitions),
  })
}

export async function getEnrollmentHistory(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  personId: string
): Promise<EnrollmentHistoryView> {
  assertStudentSliceEnabled()
  assertDatabasePolicyContext(databaseContext, context)
  return withPolicyTenantTransaction(databaseContext, toDatabasePolicyContext(decision), (db) =>
    loadEnrollmentHistoryInTransaction(
      db,
      context,
      decision,
      CAPABILITIES.STUDENT_ENROLLMENTS_READ,
      personId
    )
  )
}

async function applyTransitionInTransaction(
  db: DatabaseTransaction,
  tenantId: string,
  transitionId: string
): Promise<TransitionFunctionRow> {
  const [scheduled] = await db
    .select({ transitionType: schoolEnrollmentTransitionEvents.transitionType })
    .from(schoolEnrollmentTransitionEvents)
    .where(
      and(
        eq(schoolEnrollmentTransitionEvents.tenantId, tenantId),
        eq(schoolEnrollmentTransitionEvents.transitionId, transitionId),
        eq(schoolEnrollmentTransitionEvents.eventType, 'scheduled')
      )
    )
    .limit(1)
  const createsEnrollment =
    scheduled?.transitionType === 'transfer' ||
    scheduled?.transitionType === 'reenroll' ||
    scheduled?.transitionType === 'add_secondary'
  const rows = await db.execute<TransitionFunctionRow>(sql`
    select
      event_id as "eventId",
      transition_id as "transitionId",
      person_id as "personId",
      transition_type as "transitionType",
      effective_at as "effectiveAt",
      event_type as "eventType",
      occurred_at as "occurredAt"
    from openschool_private.apply_school_enrollment_transition(
      ${crypto.randomUUID()}::uuid,
      ${transitionId}::uuid,
      ${createsEnrollment ? crypto.randomUUID() : null}::uuid,
      ${createsEnrollment ? crypto.randomUUID() : null}::uuid,
      ${crypto.randomUUID()}::uuid
    )
  `)
  const row = rows[0]
  if (!row) throw new TRPCError({ code: 'CONFLICT', message: 'ENROLLMENT_CONTEXT_STALE' })
  return row
}

export async function scheduleEnrollmentTransition(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  input: ScheduleEnrollmentTransitionInput
): Promise<EnrollmentHistoryView> {
  assertStudentSliceEnabled()
  assertDatabasePolicyContext(databaseContext, context)
  const tenantId = assertEnrollmentCapability(
    context,
    decision,
    CAPABILITIES.STUDENT_ENROLLMENTS_MANAGE
  )
  const effectiveAt = normalizedEffectiveAt(input.effectiveAt)
  const reason = normalizedText(input.reason, 'Reason')
  const evidenceReference = normalizedOptionalText(input.evidenceReference)
  if (input.applyImmediately && effectiveAt.getTime() > Date.now()) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'A future transition must be scheduled before it can be applied',
    })
  }
  const transitionId = crypto.randomUUID()
  const eventType = input.applyImmediately
    ? 'student.enrollment.apply'
    : 'student.enrollment.schedule'

  try {
    return await withPolicyTenantTransaction(
      databaseContext,
      toDatabasePolicyContext(decision),
      async (db) => {
        await db.execute<TransitionFunctionRow>(sql`
          select * from openschool_private.schedule_school_enrollment_transition(
            ${crypto.randomUUID()}::uuid,
            ${transitionId}::uuid,
            ${input.personId}::uuid,
            ${input.fromEnrollmentId ?? null}::uuid,
            ${input.destinationSchoolId ?? null}::uuid,
            ${input.transitionType}::text,
            ${effectiveAt.toISOString()}::timestamp with time zone,
            ${reason}::text,
            ${evidenceReference}::text,
            ${input.expectedEnrollmentVersion ?? null}::bigint
          )
        `)
        if (input.applyImmediately) {
          await applyTransitionInTransaction(db, tenantId, transitionId)
        }

        await appendAuditEventInTransaction(db, databaseContext, context, decision, {
          eventType,
          outcome: 'succeeded',
          targetType: 'school_enrollment_transition',
          targetId: transitionId,
          dataClasses: ['student_personal'],
          change: {
            changedFields: input.applyImmediately
              ? ['enrollmentPeriod', 'transitionEvent', 'authorizationVersion']
              : ['scheduledTransition'],
          },
          outbox: {
            topic: 'audit.event.committed',
            deduplicationKey: `${eventType}:${databaseContext.requestId}:${transitionId}`,
          },
        })
        return loadEnrollmentHistoryInTransaction(
          db,
          context,
          decision,
          CAPABILITIES.STUDENT_ENROLLMENTS_MANAGE,
          input.personId
        )
      }
    )
  } catch (error) {
    return recordEnrollmentFailure(
      error,
      databaseContext,
      context,
      decision,
      eventType,
      transitionId
    )
  }
}

export async function applyEnrollmentTransition(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  transitionId: string
): Promise<EnrollmentHistoryView> {
  assertStudentSliceEnabled()
  assertDatabasePolicyContext(databaseContext, context)
  const tenantId = assertEnrollmentCapability(
    context,
    decision,
    CAPABILITIES.STUDENT_ENROLLMENTS_MANAGE
  )
  let personId = transitionId
  try {
    return await withPolicyTenantTransaction(
      databaseContext,
      toDatabasePolicyContext(decision),
      async (db) => {
        const applied = await applyTransitionInTransaction(db, tenantId, transitionId)
        personId = applied.personId
        await appendAuditEventInTransaction(db, databaseContext, context, decision, {
          eventType: 'student.enrollment.apply',
          outcome: 'succeeded',
          targetType: 'school_enrollment_transition',
          targetId: transitionId,
          dataClasses: ['student_personal'],
          change: {
            changedFields: ['enrollmentPeriod', 'transitionEvent', 'authorizationVersion'],
          },
          outbox: {
            topic: 'audit.event.committed',
            deduplicationKey: `student.enrollment.apply:${databaseContext.requestId}:${transitionId}`,
          },
        })
        return loadEnrollmentHistoryInTransaction(
          db,
          context,
          decision,
          CAPABILITIES.STUDENT_ENROLLMENTS_MANAGE,
          personId
        )
      }
    )
  } catch (error) {
    return recordEnrollmentFailure(
      error,
      databaseContext,
      context,
      decision,
      'student.enrollment.apply',
      transitionId
    )
  }
}

export async function cancelEnrollmentTransition(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  transitionId: string,
  reasonInput: string
): Promise<EnrollmentHistoryView> {
  assertStudentSliceEnabled()
  assertDatabasePolicyContext(databaseContext, context)
  assertEnrollmentCapability(context, decision, CAPABILITIES.STUDENT_ENROLLMENTS_MANAGE)
  const reason = normalizedText(reasonInput, 'Cancellation reason')
  let personId = transitionId
  try {
    return await withPolicyTenantTransaction(
      databaseContext,
      toDatabasePolicyContext(decision),
      async (db) => {
        const rows = await db.execute<TransitionFunctionRow>(sql`
          select
            event_id as "eventId",
            transition_id as "transitionId",
            person_id as "personId",
            transition_type as "transitionType",
            effective_at as "effectiveAt",
            event_type as "eventType",
            occurred_at as "occurredAt"
          from openschool_private.cancel_school_enrollment_transition(
            ${crypto.randomUUID()}::uuid,
            ${transitionId}::uuid,
            ${reason}::text
          )
        `)
        const cancelled = rows[0]
        if (!cancelled) {
          throw new TRPCError({ code: 'CONFLICT', message: 'ENROLLMENT_CONTEXT_STALE' })
        }
        personId = cancelled.personId
        await appendAuditEventInTransaction(db, databaseContext, context, decision, {
          eventType: 'student.enrollment.cancel',
          outcome: 'succeeded',
          targetType: 'school_enrollment_transition',
          targetId: transitionId,
          dataClasses: ['student_personal'],
          change: { changedFields: ['scheduledTransition'] },
          outbox: {
            topic: 'audit.event.committed',
            deduplicationKey: `student.enrollment.cancel:${databaseContext.requestId}:${transitionId}`,
          },
        })
        return loadEnrollmentHistoryInTransaction(
          db,
          context,
          decision,
          CAPABILITIES.STUDENT_ENROLLMENTS_MANAGE,
          personId
        )
      }
    )
  } catch (error) {
    return recordEnrollmentFailure(
      error,
      databaseContext,
      context,
      decision,
      'student.enrollment.cancel',
      transitionId
    )
  }
}
