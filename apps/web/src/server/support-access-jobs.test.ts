import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { processSupportAccessExpiry } from './support-access-expiry-job'
import { processSupportNotificationDelivery } from './support-notification-delivery-job'

const context = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  jobId: '00000000-0000-4000-8000-000000000002',
  jobType: 'support_notification_delivery',
  requestId: 'request-1',
}

describe('Support Access worker jobs', () => {
  it('fails closed for a mismatched job type before database access', async () => {
    await assert.rejects(
      processSupportAccessExpiry(context),
      /requires the matching worker job type/
    )
    await assert.rejects(
      processSupportNotificationDelivery(
        { ...context, jobType: 'support_access_expiry' },
        { deliver: async () => undefined }
      ),
      /requires the matching worker job type/
    )
  })

  it('rejects unsafe expiry and delivery bounds before database access', async () => {
    await assert.rejects(
      processSupportAccessExpiry({ ...context, jobType: 'support_access_expiry' }, 0),
      /expiry limit must be between 1 and 100/
    )
    await assert.rejects(
      processSupportNotificationDelivery(
        context,
        { deliver: async () => undefined },
        {
          maxAttempts: 0,
        }
      ),
      /max attempts must be between 1 and 20/
    )
    await assert.rejects(
      processSupportNotificationDelivery(
        context,
        { deliver: async () => undefined },
        {
          now: new Date('invalid'),
        }
      ),
      /claim time is invalid/
    )
  })
})
