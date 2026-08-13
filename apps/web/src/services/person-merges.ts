import { appendAuditEventInTransaction, recordAuditAttempt } from '@openschool/audit'
import { type TenantDatabaseContext, withPolicyTenantTransaction } from '@openschool/db'
import { type AllowedPolicyDecision, CAPABILITIES, type PolicyContext } from '@openschool/rbac'
import { TRPCError } from '@trpc/server'
import { sql } from 'drizzle-orm'
import { assertDatabasePolicyContext, toDatabasePolicyContext } from './database-context'

export interface CreatePersonMergePreviewInput {
  caseId: string
  expectedCaseVersion: number
  sourcePersonId: string
  targetPersonId: string
  reason: string
}

export interface PersonMergePreviewResult extends Record<string, unknown> {
  operationId: string
  status: 'blocked' | 'pending_approval'
  dependencyCount: number
  conflictCount: number
  previewDigest: string
  createdAt: Date
}

export interface ApprovePersonMergePreviewInput {
  operationId: string
  expectedOperationVersion: number
  expectedPreviewDigest: string
  reason: string
}

export interface PersonMergeApprovalResult extends Record<string, unknown> {
  operationId: string
  status: 'approved'
  version: number
  previewDigest: string
  approvedAt: Date
}

function assertPersonMergePreviewScope(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision
): void {
  assertDatabasePolicyContext(databaseContext, context)
  if (
    decision.capability !== CAPABILITIES.PEOPLE_MERGES_PREVIEW ||
    !context.tenantId ||
    decision.queryConstraints.length < 1 ||
    decision.queryConstraints.some((constraint) => constraint.kind === 'platform')
  ) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'POLICY_SCOPE_MISMATCH' })
  }
}

function assertPersonMergeApprovalScope(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision
): void {
  assertDatabasePolicyContext(databaseContext, context)
  if (
    decision.capability !== CAPABILITIES.PEOPLE_MERGES_APPROVE ||
    !context.tenantId ||
    decision.queryConstraints.length < 1 ||
    decision.queryConstraints.some((constraint) => constraint.kind === 'platform')
  ) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'POLICY_SCOPE_MISMATCH' })
  }
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

function normalizePreviewError(error: unknown): unknown {
  if (error instanceof TRPCError) return error
  switch (databaseErrorCode(error)) {
    case '40001':
      return new TRPCError({ code: 'CONFLICT', message: 'MERGE_CASE_CHANGED', cause: error })
    case '42501':
      return new TRPCError({ code: 'NOT_FOUND', message: 'Merge case not found', cause: error })
    case '22023':
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Merge preview is invalid',
        cause: error,
      })
    case '23505':
      return new TRPCError({
        code: 'CONFLICT',
        message: 'A merge workflow already exists for the source Person',
        cause: error,
      })
    default:
      return error
  }
}

export async function createPersonMergePreview(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  input: CreatePersonMergePreviewInput
): Promise<PersonMergePreviewResult> {
  assertPersonMergePreviewScope(databaseContext, context, decision)
  const reason = input.reason.normalize('NFKC').trim().replace(/\s+/g, ' ')
  if (reason.length < 3 || reason.length > 512) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Reason must be 3–512 characters' })
  }
  if (input.sourcePersonId === input.targetPersonId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Source and target must be different' })
  }

  try {
    return await withPolicyTenantTransaction(
      databaseContext,
      toDatabasePolicyContext(decision),
      async (db) => {
        const rows = await db.execute<PersonMergePreviewResult>(sql`
          select
            operation_id as "operationId",
            status,
            dependency_count as "dependencyCount",
            conflict_count as "conflictCount",
            preview_digest as "previewDigest",
            created_at as "createdAt"
          from openschool_private.create_person_merge_preview(
            ${input.caseId}::uuid,
            ${input.expectedCaseVersion}::integer,
            ${input.sourcePersonId}::uuid,
            ${input.targetPersonId}::uuid,
            ${reason}
          )
        `)
        const result = rows[0]
        if (!result) throw new TRPCError({ code: 'CONFLICT', message: 'MERGE_CASE_CHANGED' })
        await appendAuditEventInTransaction(db, databaseContext, context, decision, {
          eventType: 'person_merge.preview',
          outcome: 'succeeded',
          targetType: 'person_merge_operation',
          targetId: result.operationId,
          dataClasses: ['student_personal', 'credential'],
          change: { changedFields: ['status', 'preview_digest', 'dependency_count'] },
          outbox: {
            topic: 'audit.event.committed',
            deduplicationKey: `person_merge.preview:${databaseContext.requestId}:${result.operationId}`,
          },
        })
        return result
      }
    )
  } catch (error) {
    const normalized = normalizePreviewError(error)
    try {
      await recordAuditAttempt(databaseContext, context, decision, {
        eventType: 'person_merge.preview',
        outcome:
          normalized instanceof TRPCError && normalized.code === 'NOT_FOUND' ? 'denied' : 'failed',
        targetType: 'person_duplicate_case',
        targetId: input.caseId,
        dataClasses: ['student_personal', 'credential'],
        change: { changedFields: ['merge_preview'] },
      })
    } catch (auditError) {
      throw new AggregateError(
        [normalized, auditError],
        'Person merge preview and failure audit both failed'
      )
    }
    throw normalized
  }
}

export async function approvePersonMergePreview(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  input: ApprovePersonMergePreviewInput
): Promise<PersonMergeApprovalResult> {
  assertPersonMergeApprovalScope(databaseContext, context, decision)
  const reason = input.reason.normalize('NFKC').trim().replace(/\s+/g, ' ')
  if (reason.length < 3 || reason.length > 512) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Reason must be 3–512 characters' })
  }
  if (!/^[0-9a-f]{64}$/.test(input.expectedPreviewDigest)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Preview digest is invalid' })
  }

  try {
    return await withPolicyTenantTransaction(
      databaseContext,
      toDatabasePolicyContext(decision),
      async (db) => {
        const rows = await db.execute<PersonMergeApprovalResult>(sql`
          select
            operation_id as "operationId",
            status,
            version,
            preview_digest as "previewDigest",
            approved_at as "approvedAt"
          from openschool_private.approve_person_merge_preview(
            ${input.operationId}::uuid,
            ${input.expectedOperationVersion}::integer,
            ${input.expectedPreviewDigest},
            ${reason}
          )
        `)
        const result = rows[0]
        if (!result) throw new TRPCError({ code: 'CONFLICT', message: 'MERGE_PREVIEW_CHANGED' })
        await appendAuditEventInTransaction(db, databaseContext, context, decision, {
          eventType: 'person_merge.approve',
          outcome: 'succeeded',
          targetType: 'person_merge_operation',
          targetId: result.operationId,
          dataClasses: ['student_personal', 'credential'],
          change: { changedFields: ['status', 'approved_by', 'version'] },
          outbox: {
            topic: 'audit.event.committed',
            deduplicationKey: `person_merge.approve:${databaseContext.requestId}:${result.operationId}:${result.version}`,
          },
        })
        return result
      }
    )
  } catch (error) {
    const normalized = normalizePreviewError(error)
    try {
      await recordAuditAttempt(databaseContext, context, decision, {
        eventType: 'person_merge.approve',
        outcome:
          normalized instanceof TRPCError && normalized.code === 'NOT_FOUND' ? 'denied' : 'failed',
        targetType: 'person_merge_operation',
        targetId: input.operationId,
        dataClasses: ['student_personal', 'credential'],
        change: { changedFields: ['approval'] },
      })
    } catch (auditError) {
      throw new AggregateError(
        [normalized, auditError],
        'Person merge approval and failure audit both failed'
      )
    }
    throw normalized
  }
}
