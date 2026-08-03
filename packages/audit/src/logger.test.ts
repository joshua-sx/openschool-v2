import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DatabaseTransaction, TenantDatabaseContext } from '@openschool/db'
import type { PolicyContext, PolicyDecision } from '@openschool/rbac'
import { appendAuditEventInTransaction } from './logger'

const tenantId = '00000000-0000-4000-8000-000000000001'
const accountId = '00000000-0000-4000-8000-000000000002'
const personId = '00000000-0000-4000-8000-000000000003'
const policyContext = {
  tenantId,
  accountId,
  personId,
  assuranceLevel: 'aal1',
  roleTemplateKeys: [],
} as PolicyContext
const databaseContext: TenantDatabaseContext = {
  tenantId,
  accountId,
  personId,
  assuranceLevel: 'aal1',
  sessionId: 'logger-test-session',
  requestId: 'logger-test-request',
  membershipVersion: 1,
  securityVersion: 1,
  contextPolicyVersion: 1,
}

describe('Audit Ledger input validation', () => {
  it('rejects an outbox topic that the database constraint would reject', async () => {
    await assert.rejects(
      appendAuditEventInTransaction(
        {} as DatabaseTransaction,
        databaseContext,
        policyContext,
        {} as PolicyDecision,
        {
          eventType: 'student.update',
          outcome: 'succeeded',
          targetType: 'student',
          dataClasses: ['internal'],
          outbox: {
            topic: 'Invalid:Topic',
            deduplicationKey: 'logger-test-deduplication',
          },
        },
        { requireObligation: false }
      ),
      /AUDIT_OUTBOX_TOPIC_INVALID/
    )
  })
})
