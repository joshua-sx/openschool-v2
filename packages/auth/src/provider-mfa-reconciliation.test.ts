import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  providerMfaReconciliationRetryDelayMs,
  resolveProviderMfaReconciliationCompletionTime,
} from './provider-mfa-reconciliation'

describe('provider MFA reconciliation timing', () => {
  it('uses bounded exponential retry delays', () => {
    assert.equal(providerMfaReconciliationRetryDelayMs(1), 30_000)
    assert.equal(providerMfaReconciliationRetryDelayMs(2), 60_000)
    assert.equal(providerMfaReconciliationRetryDelayMs(20), 15 * 60_000)
  })

  it('does not record completion before the claim timestamp', () => {
    const claimedAt = new Date('2026-08-02T12:00:01.000Z')
    assert.deepEqual(
      resolveProviderMfaReconciliationCompletionTime(
        () => new Date('2026-08-02T12:00:00.000Z'),
        claimedAt
      ),
      claimedAt
    )
  })
})
