import { appendAuditEventInTransaction, recordAuditAttempt } from '@openschool/audit'
import {
  type DatabaseTransaction,
  type PersonDuplicateSignal,
  type TenantDatabaseContext,
  withPolicyTenantTransaction,
} from '@openschool/db'
import { type AllowedPolicyDecision, CAPABILITIES, type PolicyContext } from '@openschool/rbac'
import { TRPCError } from '@trpc/server'
import { sql } from 'drizzle-orm'
import { assertDatabasePolicyContext, toDatabasePolicyContext } from './database-context'
import { getSchoolByIdInTransaction } from './schools'

const MAX_QUEUE_ROWS = 50
const MAX_EVENTS_PER_CASE = 20

export interface DuplicateCandidateWarning extends Record<string, unknown> {
  caseId: string
  otherPersonId: string
  score: number
  signals: readonly PersonDuplicateSignal[]
  caseStatus: 'open' | 'merge_approval_requested'
}

interface DuplicateQueueRow extends Record<string, unknown> {
  caseId: string
  schoolId: string
  status: 'open' | 'distinct' | 'merge_approval_requested' | 'superseded'
  version: number
  score: number
  signals: readonly PersonDuplicateSignal[]
  firstPersonId: string
  firstDisplayName: string
  firstDateOfBirth: string | null
  firstEmail: string | null
  secondPersonId: string
  secondDisplayName: string
  secondDateOfBirth: string | null
  secondEmail: string | null
  updatedAt: Date
}

export interface DuplicateCaseEventView extends Record<string, unknown> {
  id: string
  caseId: string
  version: number
  eventType: string
  score: number
  signals: readonly PersonDuplicateSignal[]
  reason: string
  createdAt: Date
}

export interface DuplicateCaseView extends DuplicateQueueRow {
  events: readonly DuplicateCaseEventView[]
}

export interface ReviewDuplicateCaseInput {
  caseId: string
  expectedVersion: number
  action: 'mark_distinct' | 'request_merge_approval'
  reason: string
}

function assertDuplicateReviewScope(
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  capability:
    | typeof CAPABILITIES.PEOPLE_DUPLICATES_READ
    | typeof CAPABILITIES.PEOPLE_DUPLICATES_REVIEW
): string {
  if (
    decision.capability !== capability ||
    !context.tenantId ||
    decision.queryConstraints.length < 1 ||
    decision.queryConstraints.some((constraint) => constraint.kind === 'platform')
  ) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'POLICY_SCOPE_MISMATCH' })
  }
  return context.tenantId
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

function normalizeReviewError(error: unknown): unknown {
  if (error instanceof TRPCError) return error
  switch (databaseErrorCode(error)) {
    case '40001':
      return new TRPCError({ code: 'CONFLICT', message: 'CASE_CHANGED', cause: error })
    case '42501':
      return new TRPCError({ code: 'NOT_FOUND', message: 'Case not found', cause: error })
    case '22023':
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Review decision is invalid',
        cause: error,
      })
    default:
      return error
  }
}

export async function refreshPersonDuplicateCandidatesInTransaction(
  db: DatabaseTransaction,
  personId: string,
  schoolId: string,
  reason: string
): Promise<readonly DuplicateCandidateWarning[]> {
  return db.execute<DuplicateCandidateWarning>(sql`
    select
      case_id as "caseId",
      other_person_id as "otherPersonId",
      score,
      signals,
      case_status as "caseStatus"
    from openschool_private.refresh_person_duplicate_candidates(
      ${personId}::uuid,
      ${schoolId}::uuid,
      ${reason}
    )
  `)
}

export async function getDuplicateReviewQueue(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  schoolId: string,
  statuses: readonly DuplicateQueueRow['status'][] = ['open', 'merge_approval_requested']
): Promise<readonly DuplicateCaseView[]> {
  assertDatabasePolicyContext(databaseContext, context)
  const tenantId = assertDuplicateReviewScope(
    context,
    decision,
    CAPABILITIES.PEOPLE_DUPLICATES_READ
  )
  const boundedStatuses = [...new Set(statuses)].slice(0, 4)
  if (boundedStatuses.length < 1) return []
  const statusArray = sql.join(
    boundedStatuses.map((status) => sql`${status}`),
    sql`, `
  )

  return withPolicyTenantTransaction(
    databaseContext,
    toDatabasePolicyContext(decision),
    async (db) => {
      const school = await getSchoolByIdInTransaction(
        db,
        context,
        decision,
        schoolId,
        CAPABILITIES.PEOPLE_DUPLICATES_READ
      )
      if (!school) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'POLICY_SCOPE_MISMATCH' })
      }
      const rows = await db.execute<DuplicateQueueRow>(sql`
      select
        duplicate_case.id as "caseId",
        duplicate_case.review_school_id as "schoolId",
        duplicate_case.status,
        duplicate_case.current_version as version,
        duplicate_case.current_score as score,
        duplicate_case.current_signals as signals,
        first_person.id as "firstPersonId",
        first_person.display_name as "firstDisplayName",
        first_person.date_of_birth as "firstDateOfBirth",
        first_person.email as "firstEmail",
        second_person.id as "secondPersonId",
        second_person.display_name as "secondDisplayName",
        second_person.date_of_birth as "secondDateOfBirth",
        second_person.email as "secondEmail",
        duplicate_case.updated_at as "updatedAt"
      from person_duplicate_cases as duplicate_case
      inner join people as first_person
        on first_person.tenant_id = duplicate_case.tenant_id
        and first_person.id = duplicate_case.first_person_id
      inner join people as second_person
        on second_person.tenant_id = duplicate_case.tenant_id
        and second_person.id = duplicate_case.second_person_id
      where duplicate_case.tenant_id = ${tenantId}::uuid
        and duplicate_case.review_school_id = ${schoolId}::uuid
        and duplicate_case.status = any(ARRAY[${statusArray}]::text[])
      order by
        case duplicate_case.status when 'merge_approval_requested' then 0 else 1 end,
        duplicate_case.updated_at desc,
        duplicate_case.id
      limit ${MAX_QUEUE_ROWS}
    `)
      const caseIds = rows.map(({ caseId }) => caseId)
      const caseIdArray = sql.join(
        caseIds.map((caseId) => sql`${caseId}`),
        sql`, `
      )
      const events = caseIds.length
        ? await db.execute<DuplicateCaseEventView>(sql`
          select
            bounded_event.id,
            bounded_event.case_id as "caseId",
            bounded_event.version,
            bounded_event.event_type as "eventType",
            bounded_event.score,
            bounded_event.signals,
            bounded_event.reason,
            bounded_event.created_at as "createdAt"
          from (
            select
              duplicate_event.*,
              row_number() over (
                partition by duplicate_event.case_id
                order by duplicate_event.version desc
              ) as history_rank
            from person_duplicate_case_events as duplicate_event
            where duplicate_event.case_id = any(ARRAY[${caseIdArray}]::uuid[])
          ) as bounded_event
          where bounded_event.history_rank <= ${MAX_EVENTS_PER_CASE}
          order by bounded_event.case_id, bounded_event.version
        `)
        : []
      const eventsByCase = new Map<string, DuplicateCaseEventView[]>()
      for (const event of events) {
        const history = eventsByCase.get(event.caseId) ?? []
        history.push(event)
        eventsByCase.set(event.caseId, history)
      }
      return rows.map((row) =>
        Object.freeze({ ...row, events: eventsByCase.get(row.caseId) ?? [] })
      )
    }
  )
}

export async function reviewDuplicateCase(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  input: ReviewDuplicateCaseInput
): Promise<{ caseId: string; status: string; version: number }> {
  assertDatabasePolicyContext(databaseContext, context)
  assertDuplicateReviewScope(context, decision, CAPABILITIES.PEOPLE_DUPLICATES_REVIEW)
  const reason = input.reason.normalize('NFKC').trim().replace(/\s+/g, ' ')
  if (reason.length < 3 || reason.length > 512) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Reason must be 3–512 characters' })
  }
  const eventType =
    input.action === 'mark_distinct'
      ? 'person_duplicate.distinct'
      : 'person_duplicate.merge_approval_request'
  try {
    return await withPolicyTenantTransaction(
      databaseContext,
      toDatabasePolicyContext(decision),
      async (db) => {
        const rows = await db.execute<
          Record<string, unknown> & { caseId: string; status: string; version: number }
        >(sql`
          select case_id as "caseId", status, version
          from openschool_private.review_person_duplicate_case(
            ${input.caseId}::uuid,
            ${input.expectedVersion}::integer,
            ${input.action},
            ${reason}
          )
        `)
        const result = rows[0]
        if (!result) throw new TRPCError({ code: 'CONFLICT', message: 'CASE_CHANGED' })
        await appendAuditEventInTransaction(db, databaseContext, context, decision, {
          eventType,
          outcome: 'succeeded',
          targetType: 'person_duplicate_case',
          targetId: input.caseId,
          dataClasses: ['student_personal'],
          change: { changedFields: ['status', 'version'] },
          outbox: {
            topic: 'audit.event.committed',
            deduplicationKey: `${eventType}:${databaseContext.requestId}:${input.caseId}:${result.version}`,
          },
        })
        return result
      }
    )
  } catch (error) {
    const normalized = normalizeReviewError(error)
    try {
      await recordAuditAttempt(databaseContext, context, decision, {
        eventType,
        outcome:
          normalized instanceof TRPCError && normalized.code === 'NOT_FOUND' ? 'denied' : 'failed',
        targetType: 'person_duplicate_case',
        targetId: input.caseId,
        dataClasses: ['student_personal'],
        change: { changedFields: ['status'] },
      })
    } catch (auditError) {
      throw new AggregateError(
        [normalized, auditError],
        'Duplicate review and failure audit both failed'
      )
    }
    throw normalized
  }
}
