import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyTenantLifecycle } from './tenant-lifecycle'
import type { DatabaseTransaction } from './tenant-transaction'

const TENANT_ID = 'a0000000-0000-4000-8000-000000000001'

describe('Tenant lifecycle database seam', () => {
  it('canonicalizes uppercase UUID input before validating database evidence', async () => {
    const transaction = {
      execute: async () => [
        {
          tenantId: TENANT_ID,
          tenantStatus: 'suspended',
          auditEventId: 'b0000000-0000-4000-8000-000000000001',
          outboxId: 'c0000000-0000-4000-8000-000000000001',
          occurredAt: '2026-08-02T12:00:00.000Z',
        },
      ],
    } as unknown as DatabaseTransaction

    const effect = await applyTenantLifecycle(transaction, {
      action: 'suspend',
      tenantId: TENANT_ID.toUpperCase(),
      reason: 'Canonical UUID proof',
    })

    assert.equal(effect.tenantId, TENANT_ID)
    assert.equal(effect.tenantStatus, 'suspended')
    assert.equal(effect.occurredAt.toISOString(), '2026-08-02T12:00:00.000Z')
  })
})
