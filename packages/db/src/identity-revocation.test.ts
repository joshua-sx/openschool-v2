import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyIdentityRevocation } from './identity-revocation'
import type { DatabaseTransaction } from './tenant-transaction'

const TARGET = '00000000-0000-4000-8000-000000000201'

function transactionReturning(rows: readonly Record<string, unknown>[]): DatabaseTransaction {
  return {
    async execute() {
      return rows
    },
  } as unknown as DatabaseTransaction
}

describe('identity revocation database seam', () => {
  it('normalizes bigint and timestamp wire evidence and freezes it', async () => {
    const occurredAt = new Date('2026-08-02T12:00:00.000Z')
    const result = await applyIdentityRevocation(
      transactionReturning([
        {
          affectedAccountId: TARGET,
          affectedSessionId: null,
          membershipVersion: '2',
          securityVersion: '3',
          affectedSessionCount: '4',
          occurredAt: occurredAt.toISOString(),
        },
      ]),
      { action: 'account_sessions_revoke', targetId: TARGET, reason: 'Security incident' }
    )

    assert.deepEqual(result, [
      {
        affectedAccountId: TARGET,
        affectedSessionId: null,
        membershipVersion: 2,
        securityVersion: 3,
        affectedSessionCount: 4,
        occurredAt,
      },
    ])
    assert.equal(Object.isFrozen(result), true)
    assert.equal(Object.isFrozen(result[0]), true)
  })

  it('accepts Date timestamp evidence without retaining its mutable reference', async () => {
    const occurredAt = new Date('2026-08-02T12:00:00.000Z')
    const result = await applyIdentityRevocation(
      transactionReturning([
        {
          affectedAccountId: TARGET,
          affectedSessionId: null,
          membershipVersion: 2,
          securityVersion: 3,
          affectedSessionCount: 0,
          occurredAt,
        },
      ]),
      { action: 'account_disable', targetId: TARGET, reason: 'Security incident' }
    )

    assert.deepEqual(result[0]?.occurredAt, occurredAt)
    assert.notEqual(result[0]?.occurredAt, occurredAt)
  })

  it('rejects malformed targets, reasons, and database evidence', async () => {
    await assert.rejects(
      applyIdentityRevocation(transactionReturning([]), {
        action: 'account_disable',
        targetId: 'not-an-id',
        reason: 'Security incident',
      }),
      /IDENTITY_REVOCATION_TARGET_INVALID/
    )
    await assert.rejects(
      applyIdentityRevocation(transactionReturning([]), {
        action: 'account_disable',
        targetId: TARGET,
        reason: 'x',
      }),
      /IDENTITY_REVOCATION_REASON_INVALID/
    )
    await assert.rejects(
      applyIdentityRevocation(
        transactionReturning([
          {
            affectedAccountId: TARGET,
            affectedSessionId: null,
            membershipVersion: 'NaN',
            securityVersion: '3',
            affectedSessionCount: '0',
            occurredAt: new Date(),
          },
        ]),
        { action: 'account_disable', targetId: TARGET, reason: 'Security incident' }
      ),
      /IDENTITY_REVOCATION_MEMBERSHIP_VERSION_INVALID/
    )
    await assert.rejects(
      applyIdentityRevocation(
        transactionReturning([
          {
            affectedAccountId: TARGET,
            affectedSessionId: null,
            membershipVersion: '2',
            securityVersion: '3',
            affectedSessionCount: '0',
            occurredAt: 'not-a-timestamp',
          },
        ]),
        { action: 'account_disable', targetId: TARGET, reason: 'Security incident' }
      ),
      /IDENTITY_REVOCATION_TIME_INVALID/
    )
  })
})
