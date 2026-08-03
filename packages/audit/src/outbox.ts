import { type AuditOutboxRecord, type DatabaseTransaction, auditOutbox } from '@openschool/db'
import { and, asc, eq, inArray, lte, or, sql } from 'drizzle-orm'

const ERROR_CODE = /^[A-Z][A-Z0-9_]{2,63}$/
const DEFAULT_LEASE_DURATION_MS = 60_000
const MIN_LEASE_DURATION_MS = 1_000
const MAX_LEASE_DURATION_MS = 15 * 60_000

export async function claimAuditOutbox(
  tx: DatabaseTransaction,
  tenantId: string,
  options: { limit?: number; at?: Date; leaseDurationMs?: number } = {}
): Promise<AuditOutboxRecord[]> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100)
  const at = options.at ?? new Date()
  const leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS
  if (
    !Number.isSafeInteger(leaseDurationMs) ||
    leaseDurationMs < MIN_LEASE_DURATION_MS ||
    leaseDurationMs > MAX_LEASE_DURATION_MS
  ) {
    throw new Error('AUDIT_OUTBOX_LEASE_DURATION_INVALID')
  }
  const expiredBefore = new Date(at.getTime() - leaseDurationMs)
  const candidates = await tx
    .select({ id: auditOutbox.id })
    .from(auditOutbox)
    .where(
      and(
        eq(auditOutbox.tenantId, tenantId),
        or(
          and(inArray(auditOutbox.status, ['pending', 'failed']), lte(auditOutbox.availableAt, at)),
          and(eq(auditOutbox.status, 'processing'), lte(auditOutbox.lockedAt, expiredBefore))
        )
      )
    )
    .orderBy(asc(auditOutbox.availableAt), asc(auditOutbox.id))
    .for('update', { skipLocked: true })
    .limit(limit)
  if (candidates.length === 0) return []

  return tx
    .update(auditOutbox)
    .set({
      status: 'processing',
      lockedAt: at,
      lastErrorCode: null,
      attemptCount: sql`${auditOutbox.attemptCount} + 1`,
      updatedAt: at,
    })
    .where(
      and(
        eq(auditOutbox.tenantId, tenantId),
        inArray(
          auditOutbox.id,
          candidates.map(({ id }) => id)
        )
      )
    )
    .returning()
}

export async function completeAuditOutbox(
  tx: DatabaseTransaction,
  input: {
    tenantId: string
    id: string
    outcome: 'published' | 'failed' | 'dead_letter'
    expectedAttemptCount: number
    errorCode?: string
    retryAt?: Date
    at?: Date
  }
): Promise<AuditOutboxRecord> {
  if (!Number.isSafeInteger(input.expectedAttemptCount) || input.expectedAttemptCount < 1) {
    throw new Error('AUDIT_OUTBOX_ATTEMPT_INVALID')
  }
  if (input.outcome !== 'published' && !input.errorCode) {
    throw new Error('AUDIT_OUTBOX_ERROR_CODE_REQUIRED')
  }
  if (input.outcome === 'published' && input.errorCode) {
    throw new Error('AUDIT_OUTBOX_PUBLISHED_ERROR_FORBIDDEN')
  }
  if (input.errorCode && !ERROR_CODE.test(input.errorCode)) {
    throw new Error('AUDIT_OUTBOX_ERROR_CODE_INVALID')
  }
  const at = input.at ?? new Date()
  if (input.outcome === 'failed' && (!input.retryAt || input.retryAt <= at)) {
    throw new Error('AUDIT_OUTBOX_FUTURE_RETRY_REQUIRED')
  }
  if (input.outcome !== 'failed' && input.retryAt) {
    throw new Error('AUDIT_OUTBOX_RETRY_AT_FORBIDDEN')
  }
  const [updated] = await tx
    .update(auditOutbox)
    .set({
      status: input.outcome,
      ...(input.outcome === 'published' ? { publishedAt: at } : {}),
      ...(input.outcome === 'failed' ? { availableAt: input.retryAt } : {}),
      lastErrorCode: input.errorCode,
      lockedAt: null,
      updatedAt: at,
    })
    .where(
      and(
        eq(auditOutbox.tenantId, input.tenantId),
        eq(auditOutbox.id, input.id),
        eq(auditOutbox.status, 'processing'),
        eq(auditOutbox.attemptCount, input.expectedAttemptCount)
      )
    )
    .returning()
  if (updated) return updated

  const [existing] = await tx
    .select()
    .from(auditOutbox)
    .where(and(eq(auditOutbox.tenantId, input.tenantId), eq(auditOutbox.id, input.id)))
    .limit(1)
  if (existing?.status === input.outcome && input.outcome === 'published') return existing
  throw new Error('AUDIT_OUTBOX_NOT_PROCESSING')
}

export async function pendingAuditOutboxCount(
  tx: DatabaseTransaction,
  tenantId: string
): Promise<number> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(auditOutbox)
    .where(
      and(
        eq(auditOutbox.tenantId, tenantId),
        or(eq(auditOutbox.status, 'pending'), eq(auditOutbox.status, 'failed'))
      )
    )
  return row?.count ?? 0
}
