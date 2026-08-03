import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  claimSupportNotifications,
  markSupportNotificationDelivered,
  markSupportNotificationFailed,
} from './support-notification-outbox'
import type { DatabaseTransaction } from './tenant-transaction'

const transaction = {} as DatabaseTransaction

describe('Support Access notification outbox validation', () => {
  it('rejects unsafe claim limits and leases before database access', async () => {
    await assert.rejects(
      claimSupportNotifications(transaction, 0, new Date()),
      /claim limit must be between 1 and 100/
    )
    await assert.rejects(
      claimSupportNotifications(transaction, 1, new Date(), 14),
      /lease must be between 15 and 900 seconds/
    )
  })

  it('requires a bounded machine-readable delivery failure code', async () => {
    await assert.rejects(
      markSupportNotificationFailed(
        transaction,
        '00000000-0000-4000-8000-000000000001',
        'unsafe message',
        new Date(),
        false
      ),
      /failure code is invalid/
    )
  })

  it('never reports completion after a delivery lease is lost', async () => {
    const lostLease = {
      execute: async () => [],
    } as unknown as DatabaseTransaction
    await assert.rejects(
      markSupportNotificationDelivered(
        lostLease,
        '00000000-0000-4000-8000-000000000001',
        new Date()
      ),
      /delivery lease was lost/
    )
    await assert.rejects(
      markSupportNotificationFailed(
        lostLease,
        '00000000-0000-4000-8000-000000000001',
        'DELIVERY_FAILED',
        new Date(),
        false
      ),
      /delivery lease was lost/
    )
  })
})
