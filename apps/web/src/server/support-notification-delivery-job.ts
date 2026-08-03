import {
  type ClaimedSupportNotification,
  type WorkerDatabaseContext,
  claimSupportNotifications,
  markSupportNotificationDelivered,
  markSupportNotificationFailed,
  withWorkerTenantTransaction,
} from '@openschool/db'

export interface SupportNotificationDeliveryAdapter {
  deliver(notification: Readonly<ClaimedSupportNotification>): Promise<void>
}

export interface SupportNotificationDeliveryResult {
  claimed: number
  delivered: number
  failed: number
  deadLetter: number
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const value = String((error as { code: unknown }).code).toUpperCase()
    if (/^[A-Z][A-Z0-9_]{2,63}$/.test(value)) return value
  }
  return 'DELIVERY_FAILED'
}

/**
 * Delivers the durable tenant-security notification queue through an injected
 * channel adapter. The database record remains the in-app source of truth even
 * when an email, SMS, or webhook adapter is temporarily unavailable.
 */
export async function processSupportNotificationDelivery(
  context: WorkerDatabaseContext,
  adapter: SupportNotificationDeliveryAdapter,
  options: { limit?: number; maxAttempts?: number; now?: Date } = {}
): Promise<Readonly<SupportNotificationDeliveryResult>> {
  if (context.jobType !== 'support_notification_delivery') {
    throw new Error('Support notification delivery requires the matching worker job type')
  }
  const now = options.now ?? new Date()
  const limit = options.limit ?? 25
  const maxAttempts = options.maxAttempts ?? 8
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
    throw new Error('Support notification max attempts must be between 1 and 20')
  }
  if (Number.isNaN(now.getTime())) throw new Error('Support notification claim time is invalid')
  const claimed = await withWorkerTenantTransaction(context, (transaction) =>
    claimSupportNotifications(transaction, limit, now)
  )
  let delivered = 0
  let failed = 0
  let deadLetter = 0

  for (const notification of claimed) {
    try {
      await adapter.deliver(Object.freeze({ ...notification }))
      await withWorkerTenantTransaction(context, (transaction) =>
        markSupportNotificationDelivered(transaction, notification.outboxId, new Date())
      )
      delivered += 1
    } catch (error) {
      const isDeadLetter = notification.attemptCount >= maxAttempts
      const retryAt = new Date(Date.now() + Math.min(60, 2 ** notification.attemptCount) * 60_000)
      await withWorkerTenantTransaction(context, (transaction) =>
        markSupportNotificationFailed(
          transaction,
          notification.outboxId,
          errorCode(error),
          retryAt,
          isDeadLetter
        )
      )
      if (isDeadLetter) deadLetter += 1
      else failed += 1
    }
  }

  return Object.freeze({ claimed: claimed.length, delivered, failed, deadLetter })
}
