import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DatabaseTransaction } from '@openschool/db'
import { claimAuditOutbox, completeAuditOutbox } from './outbox'

const transaction = {} as DatabaseTransaction
const base = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  id: '00000000-0000-4000-8000-000000000002',
  expectedAttemptCount: 1,
}

describe('Audit Outbox completion validation', () => {
  it('requires a bounded future retry for a failed delivery', async () => {
    await assert.rejects(
      completeAuditOutbox(transaction, {
        ...base,
        outcome: 'failed',
        errorCode: 'DELIVERY_FAILED',
      }),
      /AUDIT_OUTBOX_FUTURE_RETRY_REQUIRED/
    )
  })

  it('rejects error and retry fields on published completion', async () => {
    await assert.rejects(
      completeAuditOutbox(transaction, {
        ...base,
        outcome: 'published',
        errorCode: 'SHOULD_NOT_EXIST',
      }),
      /AUDIT_OUTBOX_PUBLISHED_ERROR_FORBIDDEN/
    )
    await assert.rejects(
      completeAuditOutbox(transaction, {
        ...base,
        outcome: 'published',
        retryAt: new Date(Date.now() + 1_000),
      }),
      /AUDIT_OUTBOX_RETRY_AT_FORBIDDEN/
    )
  })

  it('rejects unsafe lease durations before database access', async () => {
    await assert.rejects(
      claimAuditOutbox(transaction, base.tenantId, { leaseDurationMs: 999 }),
      /AUDIT_OUTBOX_LEASE_DURATION_INVALID/
    )
  })
})
