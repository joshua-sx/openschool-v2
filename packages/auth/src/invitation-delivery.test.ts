import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveInvitationDeliveryCompletionTime } from './invitation-delivery'

describe('invitation delivery completion time', () => {
  const claimedAt = new Date('2026-08-03T05:50:36.000Z')

  it('uses wall-clock completion after the claim', () => {
    const completedAt = new Date('2026-08-03T05:50:40.000Z')

    assert.equal(
      resolveInvitationDeliveryCompletionTime(() => completedAt, claimedAt),
      completedAt
    )
  })

  it('clamps a fast completion to a future claim timestamp', () => {
    const wallClock = new Date('2026-08-03T05:50:35.000Z')

    assert.equal(
      resolveInvitationDeliveryCompletionTime(() => wallClock, claimedAt),
      claimedAt
    )
  })
})
