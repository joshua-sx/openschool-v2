import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  claimProviderSecurityReconciliations,
  completeProviderSecurityReconciliation,
  isProviderSecurityReady,
  resolveProviderMfaReconciliationTarget,
} from './provider-security-reconciliation-outbox'
import type { DatabaseTransaction } from './tenant-transaction'

const transaction = {} as DatabaseTransaction
const base = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  id: '00000000-0000-4000-8000-000000000002',
  expectedAttemptCount: 1,
}

describe('provider security reconciliation database seam', () => {
  it('accepts only one boolean readiness result', async () => {
    assert.equal(
      await isProviderSecurityReady(
        { execute: async () => [{ ready: false }] } as unknown as DatabaseTransaction,
        '00000000-0000-4000-8000-000000000003'
      ),
      false
    )
    await assert.rejects(
      isProviderSecurityReady(
        { execute: async () => [{ ready: 'false' }] } as unknown as DatabaseTransaction,
        '00000000-0000-4000-8000-000000000003'
      ),
      /READINESS_INVALID/
    )
  })

  it('requires valid completion evidence', async () => {
    await assert.rejects(
      completeProviderSecurityReconciliation(transaction, {
        ...base,
        outcome: 'completed',
      }),
      /FACTOR_COUNT_INVALID/
    )
    await assert.rejects(
      completeProviderSecurityReconciliation(transaction, {
        ...base,
        outcome: 'failed',
        errorCode: 'PROVIDER_MFA_RESET_FAILED',
      }),
      /FUTURE_RETRY_REQUIRED/
    )
  })

  it('rejects unsafe lease durations before database access', async () => {
    await assert.rejects(
      claimProviderSecurityReconciliations(transaction, base.tenantId, {
        leaseDurationMs: 999,
      }),
      /LEASE_DURATION_INVALID/
    )
  })

  it('normalizes and freezes worker-only provider target evidence', async () => {
    const target = await resolveProviderMfaReconciliationTarget(
      {
        execute: async () => [
          {
            accountId: '00000000-0000-4000-8000-000000000003',
            identityProvider: 'supabase',
            providerSubject: 'provider-user',
            expectedSecurityVersion: '4',
          },
        ],
      } as unknown as DatabaseTransaction,
      base.id
    )

    assert.deepEqual(target, {
      accountId: '00000000-0000-4000-8000-000000000003',
      identityProvider: 'supabase',
      providerSubject: 'provider-user',
      expectedSecurityVersion: 4,
    })
    assert.equal(Object.isFrozen(target), true)
  })
})
