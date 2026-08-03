import { and, asc, eq, inArray, lte, or, sql } from 'drizzle-orm'
import {
  type InvitationDeliveryOutboxRecord,
  accountInvitations,
  invitationDeliveryOutbox,
} from './schema'
import type { DatabaseTransaction } from './tenant-transaction'

const ERROR_CODE = /^[A-Z][A-Z0-9_]{2,63}$/
const DEFAULT_LEASE_DURATION_MS = 60_000
const MIN_LEASE_DURATION_MS = 1_000
const MAX_LEASE_DURATION_MS = 15 * 60_000

export interface ClaimedInvitationDelivery {
  delivery: InvitationDeliveryOutboxRecord
  invitation: {
    intendedProviderSubject: string | null
    expiresAt: Date
    status: 'pending' | 'accepted' | 'cancelled' | 'expired'
  }
}

export async function claimInvitationDeliveries(
  tx: DatabaseTransaction,
  tenantId: string,
  options: { limit?: number; at?: Date; leaseDurationMs?: number } = {}
): Promise<ClaimedInvitationDelivery[]> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100)
  const at = options.at ?? new Date()
  const leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS
  if (
    !Number.isSafeInteger(leaseDurationMs) ||
    leaseDurationMs < MIN_LEASE_DURATION_MS ||
    leaseDurationMs > MAX_LEASE_DURATION_MS
  ) {
    throw new Error('INVITATION_DELIVERY_LEASE_DURATION_INVALID')
  }
  const expiredBefore = new Date(at.getTime() - leaseDurationMs)
  const candidates = await tx
    .select({ id: invitationDeliveryOutbox.id })
    .from(invitationDeliveryOutbox)
    .innerJoin(
      accountInvitations,
      and(
        eq(accountInvitations.tenantId, invitationDeliveryOutbox.tenantId),
        eq(accountInvitations.id, invitationDeliveryOutbox.invitationId)
      )
    )
    .where(
      and(
        eq(invitationDeliveryOutbox.tenantId, tenantId),
        or(
          and(
            inArray(invitationDeliveryOutbox.status, ['pending', 'failed']),
            lte(invitationDeliveryOutbox.availableAt, at)
          ),
          and(
            eq(invitationDeliveryOutbox.status, 'processing'),
            lte(invitationDeliveryOutbox.lockedAt, expiredBefore)
          )
        )
      )
    )
    .orderBy(asc(invitationDeliveryOutbox.availableAt), asc(invitationDeliveryOutbox.id))
    .for('update', { of: invitationDeliveryOutbox, skipLocked: true })
    .limit(limit)
  if (candidates.length === 0) return []

  const claimed = await tx
    .update(invitationDeliveryOutbox)
    .set({
      status: 'processing',
      lockedAt: at,
      lastErrorCode: null,
      attemptCount: sql`${invitationDeliveryOutbox.attemptCount} + 1`,
      updatedAt: at,
    })
    .where(
      and(
        eq(invitationDeliveryOutbox.tenantId, tenantId),
        inArray(
          invitationDeliveryOutbox.id,
          candidates.map(({ id }) => id)
        )
      )
    )
    .returning()

  const invitations = await tx
    .select({
      id: accountInvitations.id,
      intendedProviderSubject: accountInvitations.intendedProviderSubject,
      expiresAt: accountInvitations.expiresAt,
      status: accountInvitations.status,
    })
    .from(accountInvitations)
    .where(
      and(
        eq(accountInvitations.tenantId, tenantId),
        inArray(
          accountInvitations.id,
          claimed.map(({ invitationId }) => invitationId)
        )
      )
    )
  const invitationById = new Map(invitations.map((invitation) => [invitation.id, invitation]))
  return claimed.map((delivery) => {
    const invitation = invitationById.get(delivery.invitationId)
    if (!invitation) throw new Error('INVITATION_DELIVERY_INVITATION_MISSING')
    return {
      delivery,
      invitation: {
        intendedProviderSubject: invitation.intendedProviderSubject,
        expiresAt: invitation.expiresAt,
        status: invitation.status,
      },
    }
  })
}

export async function completeInvitationDelivery(
  tx: DatabaseTransaction,
  input: {
    tenantId: string
    id: string
    outcome: 'delivered' | 'failed' | 'dead_letter'
    expectedAttemptCount: number
    errorCode?: string
    retryAt?: Date
    at?: Date
  }
): Promise<InvitationDeliveryOutboxRecord> {
  if (!Number.isSafeInteger(input.expectedAttemptCount) || input.expectedAttemptCount < 1) {
    throw new Error('INVITATION_DELIVERY_ATTEMPT_INVALID')
  }
  if (input.outcome !== 'delivered' && !input.errorCode) {
    throw new Error('INVITATION_DELIVERY_ERROR_CODE_REQUIRED')
  }
  if (input.outcome === 'delivered' && input.errorCode) {
    throw new Error('INVITATION_DELIVERY_ERROR_FORBIDDEN')
  }
  if (input.errorCode && !ERROR_CODE.test(input.errorCode)) {
    throw new Error('INVITATION_DELIVERY_ERROR_CODE_INVALID')
  }
  const at = input.at ?? new Date()
  if (input.outcome === 'failed' && (!input.retryAt || input.retryAt <= at)) {
    throw new Error('INVITATION_DELIVERY_FUTURE_RETRY_REQUIRED')
  }
  if (input.outcome !== 'failed' && input.retryAt) {
    throw new Error('INVITATION_DELIVERY_RETRY_AT_FORBIDDEN')
  }

  const [updated] = await tx
    .update(invitationDeliveryOutbox)
    .set({
      status: input.outcome,
      ...(input.outcome !== 'failed'
        ? {
            encryptionKeyId: null,
            tokenCiphertext: null,
            tokenIv: null,
            tokenAuthTag: null,
          }
        : {}),
      ...(input.outcome === 'delivered' ? { deliveredAt: at } : {}),
      ...(input.outcome === 'failed' ? { availableAt: input.retryAt } : {}),
      lastErrorCode: input.errorCode,
      lockedAt: null,
      updatedAt: at,
    })
    .where(
      and(
        eq(invitationDeliveryOutbox.tenantId, input.tenantId),
        eq(invitationDeliveryOutbox.id, input.id),
        eq(invitationDeliveryOutbox.status, 'processing'),
        eq(invitationDeliveryOutbox.attemptCount, input.expectedAttemptCount)
      )
    )
    .returning()
  if (updated) return updated

  const [existing] = await tx
    .select()
    .from(invitationDeliveryOutbox)
    .where(
      and(
        eq(invitationDeliveryOutbox.tenantId, input.tenantId),
        eq(invitationDeliveryOutbox.id, input.id)
      )
    )
    .limit(1)
  if (existing?.status === input.outcome && input.outcome === 'delivered') return existing
  throw new Error('INVITATION_DELIVERY_NOT_PROCESSING')
}
