import { sql } from 'drizzle-orm'
import type { DatabaseTransaction } from './tenant-transaction'

export interface ClaimedSupportNotification extends Record<string, unknown> {
  outboxId: string
  notificationId: string
  tenantId: string
  supportGrantId: string
  operationId: string
  event:
    | 'approved'
    | 'opened'
    | 'used'
    | 'closed'
    | 'revoked'
    | 'expired'
    | 'reviewed'
    | 'break_glass_opened'
  actorAccountId: string | null
  audience: 'tenant_security_admins'
  occurredAt: Date | string
  attemptCount: number
}

export async function claimSupportNotifications(
  transaction: DatabaseTransaction,
  limit: number,
  now: Date,
  leaseSeconds = 60
): Promise<ClaimedSupportNotification[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Support notification claim limit must be between 1 and 100')
  }
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 15 || leaseSeconds > 900) {
    throw new Error('Support notification lease must be between 15 and 900 seconds')
  }
  return transaction.execute<ClaimedSupportNotification>(sql`
    with candidates as (
      select outbox.id
      from support_notification_outbox as outbox
      where outbox.status in ('pending', 'failed', 'processing')
        and outbox.available_at <= ${now}
        and (
          outbox.status <> 'processing'
          or outbox.locked_at <= ${now} - (${leaseSeconds}::text || ' seconds')::interval
        )
      order by outbox.available_at, outbox.id
      for update skip locked
      limit ${limit}
    ), claimed as (
      update support_notification_outbox as outbox
      set status = 'processing', attempt_count = outbox.attempt_count + 1,
        locked_at = ${now}, delivered_at = null, last_error_code = null, updated_at = ${now}
      from candidates
      where outbox.id = candidates.id
      returning outbox.*
    )
    select
      claimed.id as "outboxId",
      notification.id as "notificationId",
      notification.tenant_id as "tenantId",
      notification.support_grant_id as "supportGrantId",
      notification.operation_id as "operationId",
      notification.event,
      notification.actor_account_id as "actorAccountId",
      notification.audience,
      notification.occurred_at as "occurredAt",
      claimed.attempt_count as "attemptCount"
    from claimed
    inner join support_access_notifications as notification
      on notification.tenant_id = claimed.tenant_id
      and notification.id = claimed.notification_id
  `)
}

export async function markSupportNotificationDelivered(
  transaction: DatabaseTransaction,
  outboxId: string,
  deliveredAt: Date
): Promise<void> {
  const updated = await transaction.execute<{ id: string }>(sql`
    update support_notification_outbox
    set status = 'delivered', locked_at = null, delivered_at = ${deliveredAt},
      last_error_code = null, updated_at = ${deliveredAt}
    where id = ${outboxId}::uuid and status = 'processing'
    returning id
  `)
  if (updated.length !== 1) throw new Error('Support notification delivery lease was lost')
}

export async function markSupportNotificationFailed(
  transaction: DatabaseTransaction,
  outboxId: string,
  errorCode: string,
  availableAt: Date,
  deadLetter: boolean
): Promise<void> {
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(errorCode)) {
    throw new Error('Support notification failure code is invalid')
  }
  const updated = await transaction.execute<{ id: string }>(sql`
    update support_notification_outbox
    set status = ${deadLetter ? 'dead_letter' : 'failed'}, locked_at = null,
      delivered_at = null, last_error_code = ${errorCode},
      available_at = ${availableAt}, updated_at = now()
    where id = ${outboxId}::uuid and status = 'processing'
    returning id
  `)
  if (updated.length !== 1) throw new Error('Support notification delivery lease was lost')
}
