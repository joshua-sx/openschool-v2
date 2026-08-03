import { and, asc, eq, inArray, lte, or, sql } from 'drizzle-orm'
import {
  type ProviderSecurityReconciliationOutboxRecord,
  providerSecurityReconciliationOutbox,
} from './schema'
import type { DatabaseTransaction } from './tenant-transaction'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ERROR_CODE = /^[A-Z][A-Z0-9_]{2,63}$/
const DEFAULT_LEASE_DURATION_MS = 5 * 60_000
const MIN_LEASE_DURATION_MS = 1_000
const MAX_LEASE_DURATION_MS = 15 * 60_000

export interface ProviderMfaReconciliationTarget {
  accountId: string
  identityProvider: string
  providerSubject: string
  expectedSecurityVersion: number
}

interface ProviderMfaReconciliationTargetRow extends Record<string, unknown> {
  accountId: string
  identityProvider: string
  providerSubject: string
  expectedSecurityVersion: number | string
}

export async function claimProviderSecurityReconciliations(
  tx: DatabaseTransaction,
  tenantId: string,
  options: { limit?: number; at?: Date; leaseDurationMs?: number } = {}
): Promise<ProviderSecurityReconciliationOutboxRecord[]> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100)
  const at = options.at ?? new Date()
  const leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS
  if (
    !Number.isSafeInteger(leaseDurationMs) ||
    leaseDurationMs < MIN_LEASE_DURATION_MS ||
    leaseDurationMs > MAX_LEASE_DURATION_MS
  ) {
    throw new Error('PROVIDER_SECURITY_RECONCILIATION_LEASE_DURATION_INVALID')
  }
  const expiredBefore = new Date(at.getTime() - leaseDurationMs)
  const candidates = await tx
    .select({ id: providerSecurityReconciliationOutbox.id })
    .from(providerSecurityReconciliationOutbox)
    .where(
      and(
        eq(providerSecurityReconciliationOutbox.tenantId, tenantId),
        or(
          and(
            inArray(providerSecurityReconciliationOutbox.status, ['pending', 'failed']),
            lte(providerSecurityReconciliationOutbox.availableAt, at)
          ),
          and(
            eq(providerSecurityReconciliationOutbox.status, 'processing'),
            lte(providerSecurityReconciliationOutbox.lockedAt, expiredBefore)
          )
        )
      )
    )
    .orderBy(
      asc(providerSecurityReconciliationOutbox.availableAt),
      asc(providerSecurityReconciliationOutbox.id)
    )
    .for('update', { skipLocked: true })
    .limit(limit)
  if (candidates.length === 0) return []

  return tx
    .update(providerSecurityReconciliationOutbox)
    .set({
      status: 'processing',
      lockedAt: at,
      lastErrorCode: null,
      attemptCount: sql`${providerSecurityReconciliationOutbox.attemptCount} + 1`,
      updatedAt: at,
    })
    .where(
      and(
        eq(providerSecurityReconciliationOutbox.tenantId, tenantId),
        inArray(
          providerSecurityReconciliationOutbox.id,
          candidates.map(({ id }) => id)
        )
      )
    )
    .returning()
}

export async function resolveProviderMfaReconciliationTarget(
  tx: DatabaseTransaction,
  outboxId: string
): Promise<Readonly<ProviderMfaReconciliationTarget>> {
  if (!UUID.test(outboxId)) {
    throw new Error('PROVIDER_SECURITY_RECONCILIATION_ID_INVALID')
  }
  const rows = await tx.execute<ProviderMfaReconciliationTargetRow>(sql`
    select
      account_id as "accountId",
      identity_provider as "identityProvider",
      provider_subject as "providerSubject",
      expected_security_version as "expectedSecurityVersion"
    from openschool_private.resolve_provider_mfa_reconciliation(${outboxId}::uuid)
  `)
  const target = rows[0]
  const expectedSecurityVersion = Number(target?.expectedSecurityVersion)
  if (
    rows.length !== 1 ||
    !target ||
    !UUID.test(target.accountId) ||
    target.identityProvider.length < 1 ||
    target.identityProvider.length > 128 ||
    target.providerSubject.length < 1 ||
    target.providerSubject.length > 512 ||
    !Number.isSafeInteger(expectedSecurityVersion) ||
    expectedSecurityVersion < 1
  ) {
    throw new Error('PROVIDER_SECURITY_RECONCILIATION_TARGET_INVALID')
  }
  return Object.freeze({
    accountId: target.accountId,
    identityProvider: target.identityProvider,
    providerSubject: target.providerSubject,
    expectedSecurityVersion,
  })
}

export async function completeProviderSecurityReconciliation(
  tx: DatabaseTransaction,
  input: {
    tenantId: string
    id: string
    outcome: 'completed' | 'failed' | 'dead_letter'
    expectedAttemptCount: number
    deletedFactorCount?: number
    errorCode?: string
    retryAt?: Date
    at?: Date
  }
): Promise<ProviderSecurityReconciliationOutboxRecord> {
  if (!Number.isSafeInteger(input.expectedAttemptCount) || input.expectedAttemptCount < 1) {
    throw new Error('PROVIDER_SECURITY_RECONCILIATION_ATTEMPT_INVALID')
  }
  if (input.outcome === 'completed') {
    if (!Number.isSafeInteger(input.deletedFactorCount) || (input.deletedFactorCount ?? -1) < 0) {
      throw new Error('PROVIDER_SECURITY_RECONCILIATION_FACTOR_COUNT_INVALID')
    }
    if (input.errorCode) {
      throw new Error('PROVIDER_SECURITY_RECONCILIATION_ERROR_FORBIDDEN')
    }
  } else if (!input.errorCode) {
    throw new Error('PROVIDER_SECURITY_RECONCILIATION_ERROR_REQUIRED')
  }
  if (input.errorCode && !ERROR_CODE.test(input.errorCode)) {
    throw new Error('PROVIDER_SECURITY_RECONCILIATION_ERROR_INVALID')
  }
  const at = input.at ?? new Date()
  if (input.outcome === 'failed' && (!input.retryAt || input.retryAt <= at)) {
    throw new Error('PROVIDER_SECURITY_RECONCILIATION_FUTURE_RETRY_REQUIRED')
  }
  if (input.outcome !== 'failed' && input.retryAt) {
    throw new Error('PROVIDER_SECURITY_RECONCILIATION_RETRY_FORBIDDEN')
  }

  const [updated] = await tx
    .update(providerSecurityReconciliationOutbox)
    .set({
      status: input.outcome,
      lockedAt: null,
      ...(input.outcome === 'completed'
        ? { completedAt: at, deletedFactorCount: input.deletedFactorCount }
        : {}),
      ...(input.outcome === 'failed' ? { availableAt: input.retryAt } : {}),
      lastErrorCode: input.errorCode ?? null,
      updatedAt: at,
    })
    .where(
      and(
        eq(providerSecurityReconciliationOutbox.tenantId, input.tenantId),
        eq(providerSecurityReconciliationOutbox.id, input.id),
        eq(providerSecurityReconciliationOutbox.status, 'processing'),
        eq(providerSecurityReconciliationOutbox.attemptCount, input.expectedAttemptCount)
      )
    )
    .returning()
  if (updated) return updated

  const [existing] = await tx
    .select()
    .from(providerSecurityReconciliationOutbox)
    .where(
      and(
        eq(providerSecurityReconciliationOutbox.tenantId, input.tenantId),
        eq(providerSecurityReconciliationOutbox.id, input.id)
      )
    )
    .limit(1)
  if (existing?.status === input.outcome && input.outcome !== 'failed') return existing
  throw new Error('PROVIDER_SECURITY_RECONCILIATION_NOT_PROCESSING')
}
