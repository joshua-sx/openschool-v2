import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { claimInvitationDeliveries, completeInvitationDelivery } from './invitation-delivery-outbox'
import { invitationDeliveryOutbox } from './schema'
import type { DatabaseTransaction } from './tenant-transaction'

const transaction = {} as DatabaseTransaction
const base = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  id: '00000000-0000-4000-8000-000000000002',
  expectedAttemptCount: 1,
}

describe('invitation delivery completion validation', () => {
  it('requires a bounded future retry for failed delivery', async () => {
    await assert.rejects(
      completeInvitationDelivery(transaction, {
        ...base,
        outcome: 'failed',
        errorCode: 'PROVIDER_DELIVERY_FAILED',
      }),
      /INVITATION_DELIVERY_FUTURE_RETRY_REQUIRED/
    )
  })

  it('rejects error and retry fields on delivered completion', async () => {
    await assert.rejects(
      completeInvitationDelivery(transaction, {
        ...base,
        outcome: 'delivered',
        errorCode: 'SHOULD_NOT_EXIST',
      }),
      /INVITATION_DELIVERY_ERROR_FORBIDDEN/
    )
    await assert.rejects(
      completeInvitationDelivery(transaction, {
        ...base,
        outcome: 'delivered',
        retryAt: new Date(Date.now() + 1_000),
      }),
      /INVITATION_DELIVERY_RETRY_AT_FORBIDDEN/
    )
  })

  it('rejects unsafe lease durations before database access', async () => {
    await assert.rejects(
      claimInvitationDeliveries(transaction, base.tenantId, { leaseDurationMs: 999 }),
      /INVITATION_DELIVERY_LEASE_DURATION_INVALID/
    )
  })

  it('locks only delivery rows when selecting joined claim candidates', async () => {
    let lockStrength: string | undefined
    let lockConfig: { of?: unknown; skipLocked?: boolean } | undefined
    const query = {
      from: () => query,
      innerJoin: () => query,
      where: () => query,
      orderBy: () => query,
      for: (strength: string, config: { of?: unknown; skipLocked?: boolean }) => {
        lockStrength = strength
        lockConfig = config
        return query
      },
      limit: async () => [],
    }
    const claimTransaction = {
      select: () => query,
    } as unknown as DatabaseTransaction

    assert.deepEqual(await claimInvitationDeliveries(claimTransaction, base.tenantId), [])
    assert.equal(lockStrength, 'update')
    assert.equal(lockConfig?.of, invitationDeliveryOutbox)
    assert.equal(lockConfig?.skipLocked, true)
  })
})
