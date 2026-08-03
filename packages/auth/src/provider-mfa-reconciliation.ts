import {
  type ProviderSecurityReconciliationOutboxRecord,
  type WorkerDatabaseContext,
  claimProviderSecurityReconciliations,
  completeProviderSecurityReconciliation,
  resolveProviderMfaReconciliationTarget,
  withWorkerTenantTransaction,
} from '@openschool/db'
import type { MfaAdministrationAdapter } from './mfa-administration'

const MAX_RECONCILIATION_ATTEMPTS = 5
const PROVIDER_OPERATION_TIMEOUT_MS = 5_000

async function withProviderTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('PROVIDER_MFA_RESET_TIMEOUT')),
          PROVIDER_OPERATION_TIMEOUT_MS
        )
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export function providerMfaReconciliationRetryDelayMs(attemptCount: number): number {
  return Math.min(15 * 60_000, 30_000 * 2 ** Math.max(0, attemptCount - 1))
}

export function resolveProviderMfaReconciliationCompletionTime(
  clock: () => Date,
  claimedAt: Date
): Date {
  const completedAt = clock()
  return completedAt < claimedAt ? claimedAt : completedAt
}

function reconciliationErrorCode(error: unknown): string {
  let current = error
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== 'object' || current === null) break
    const candidate = current as { message?: unknown; cause?: unknown }
    if (
      candidate.message === 'PROVIDER_MFA_RESET_TIMEOUT' ||
      candidate.message === 'SUPABASE_MFA_FACTOR_LIST_FAILED' ||
      candidate.message === 'SUPABASE_MFA_FACTOR_DELETE_FAILED' ||
      candidate.message === 'IDENTITY_PROVIDER_UNSUPPORTED' ||
      candidate.message === 'PROVIDER_SECURITY_TARGET_MISMATCH'
    ) {
      return candidate.message
    }
    current = candidate.cause
  }
  return 'PROVIDER_MFA_RESET_FAILED'
}

async function reconcileOne(
  context: WorkerDatabaseContext,
  reconciliation: ProviderSecurityReconciliationOutboxRecord,
  adapter: MfaAdministrationAdapter,
  claimedAt: Date,
  clock: () => Date
): Promise<{ outcome: 'completed' | 'failed' | 'dead_letter'; deletedFactorCount: number }> {
  let deletedFactorCount = 0
  try {
    const target = await withWorkerTenantTransaction(context, (tx) =>
      resolveProviderMfaReconciliationTarget(tx, reconciliation.id)
    )
    if (
      target.accountId !== reconciliation.accountId ||
      target.expectedSecurityVersion !== reconciliation.expectedSecurityVersion
    ) {
      throw new Error('PROVIDER_SECURITY_TARGET_MISMATCH')
    }
    if (target.identityProvider !== 'supabase') {
      throw new Error('IDENTITY_PROVIDER_UNSUPPORTED')
    }
    deletedFactorCount = await withProviderTimeout(adapter.resetFactors(target.providerSubject))

    const completedAt = resolveProviderMfaReconciliationCompletionTime(clock, claimedAt)
    await withWorkerTenantTransaction(context, (tx) =>
      completeProviderSecurityReconciliation(tx, {
        tenantId: context.tenantId,
        id: reconciliation.id,
        outcome: 'completed',
        expectedAttemptCount: reconciliation.attemptCount,
        deletedFactorCount,
        at: completedAt,
      })
    )
    return { outcome: 'completed', deletedFactorCount }
  } catch (error) {
    const errorCode = reconciliationErrorCode(error)
    const failedAt = resolveProviderMfaReconciliationCompletionTime(clock, claimedAt)
    const deadLetter =
      errorCode === 'IDENTITY_PROVIDER_UNSUPPORTED' ||
      reconciliation.attemptCount >= MAX_RECONCILIATION_ATTEMPTS
    await withWorkerTenantTransaction(context, (tx) =>
      completeProviderSecurityReconciliation(tx, {
        tenantId: context.tenantId,
        id: reconciliation.id,
        outcome: deadLetter ? 'dead_letter' : 'failed',
        expectedAttemptCount: reconciliation.attemptCount,
        errorCode,
        ...(!deadLetter
          ? {
              retryAt: new Date(
                failedAt.getTime() +
                  providerMfaReconciliationRetryDelayMs(reconciliation.attemptCount)
              ),
            }
          : {}),
        at: failedAt,
      })
    )
    return { outcome: deadLetter ? 'dead_letter' : 'failed', deletedFactorCount: 0 }
  }
}

export async function processProviderMfaReconciliationBatch(
  context: WorkerDatabaseContext,
  adapter: MfaAdministrationAdapter,
  options: { limit?: number; at?: Date; clock?: () => Date; leaseDurationMs?: number } = {}
): Promise<{
  claimed: number
  completed: number
  failed: number
  deadLetter: number
  deletedFactorCount: number
}> {
  if (context.jobType !== 'provider_mfa_reconciliation') {
    throw new Error('PROVIDER_SECURITY_RECONCILIATION_JOB_TYPE_INVALID')
  }
  const at = options.at ?? new Date()
  const clock = options.clock ?? (() => new Date())
  const claimed = await withWorkerTenantTransaction(context, (tx) =>
    claimProviderSecurityReconciliations(tx, context.tenantId, {
      limit: options.limit,
      at,
      leaseDurationMs: options.leaseDurationMs,
    })
  )
  const results = []
  for (const reconciliation of claimed) {
    results.push(await reconcileOne(context, reconciliation, adapter, at, clock))
  }
  return {
    claimed: claimed.length,
    completed: results.filter(({ outcome }) => outcome === 'completed').length,
    failed: results.filter(({ outcome }) => outcome === 'failed').length,
    deadLetter: results.filter(({ outcome }) => outcome === 'dead_letter').length,
    deletedFactorCount: results.reduce((total, result) => total + result.deletedFactorCount, 0),
  }
}
