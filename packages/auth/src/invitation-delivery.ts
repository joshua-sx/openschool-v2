import { getPublicEnv } from '@openschool/config/public'
import { getInvitationDeliveryEnv, getSupabaseAdminEnv } from '@openschool/config/server'
import {
  type ClaimedInvitationDelivery,
  type WorkerDatabaseContext,
  claimInvitationDeliveries,
  completeInvitationDelivery,
  withWorkerTenantTransaction,
} from '@openschool/db'
import { createClient } from '@supabase/supabase-js'
import { openInvitationToken } from './invitation-token'

const MAX_DELIVERY_ATTEMPTS = 5

export interface InvitationDeliveryRequest {
  recipientEmail: string
  redirectTo: string
  existingProviderSubject: string | null
  expiresAt: Date
}

export interface InvitationDeliveryAdapter {
  deliver(request: InvitationDeliveryRequest): Promise<void>
}

export function createSupabaseInvitationDeliveryAdapter(): InvitationDeliveryAdapter {
  const publicEnvironment = getPublicEnv()
  const { SUPABASE_SECRET_KEY } = getSupabaseAdminEnv()
  const supabase = createClient(publicEnvironment.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })

  return Object.freeze({
    async deliver(request: InvitationDeliveryRequest): Promise<void> {
      let result = request.existingProviderSubject
        ? await supabase.auth.signInWithOtp({
            email: request.recipientEmail,
            options: { shouldCreateUser: false, emailRedirectTo: request.redirectTo },
          })
        : await supabase.auth.admin.inviteUserByEmail(request.recipientEmail, {
            redirectTo: request.redirectTo,
          })
      // A provider identity can predate its first OpenSchool Account (for
      // example after an interrupted earlier invite). In that case the admin
      // invite endpoint refuses to recreate it; send an existing-user OTP and
      // let acceptance bind the verified provider subject to the Person.
      if (
        !request.existingProviderSubject &&
        (result.error?.code === 'email_exists' || result.error?.code === 'user_already_exists')
      ) {
        result = await supabase.auth.signInWithOtp({
          email: request.recipientEmail,
          options: { shouldCreateUser: false, emailRedirectTo: request.redirectTo },
        })
      }
      if (result.error) {
        const error = new Error('SUPABASE_INVITATION_DELIVERY_FAILED')
        error.cause = result.error
        throw error
      }
    },
  })
}

function retryDelayMs(attemptCount: number): number {
  return Math.min(15 * 60_000, 30_000 * 2 ** Math.max(0, attemptCount - 1))
}

function deliveryRedirect(appOrigin: string, token: string): string {
  const callback = new URL('/auth/callback', appOrigin)
  callback.searchParams.set('next', '/auth/invitation')
  // URI fragments are preserved by the browser across the callback redirect
  // but never sent in HTTP request targets or application access logs.
  callback.hash = new URLSearchParams({ invitation_token: token }).toString()
  return callback.toString()
}

async function deliverOne(
  context: WorkerDatabaseContext,
  claimed: ClaimedInvitationDelivery,
  adapter: InvitationDeliveryAdapter,
  at: Date,
  keyring: ReturnType<typeof getInvitationDeliveryEnv>,
  clock: () => Date
): Promise<'delivered' | 'failed' | 'dead_letter'> {
  if (claimed.invitation.status !== 'pending' || claimed.invitation.expiresAt <= at) {
    await withWorkerTenantTransaction(context, (tx) =>
      completeInvitationDelivery(tx, {
        tenantId: context.tenantId,
        id: claimed.delivery.id,
        outcome: 'dead_letter',
        expectedAttemptCount: claimed.delivery.attemptCount,
        errorCode: 'INVITATION_UNAVAILABLE',
        at,
      })
    )
    return 'dead_letter'
  }

  let failureCode = 'INVITATION_CREDENTIAL_UNAVAILABLE'
  try {
    if (
      !claimed.delivery.encryptionKeyId ||
      !claimed.delivery.tokenCiphertext ||
      !claimed.delivery.tokenIv ||
      !claimed.delivery.tokenAuthTag
    ) {
      throw new Error('INVITATION_DELIVERY_CREDENTIAL_MISSING')
    }
    const token = openInvitationToken(
      {
        encryptionKeyId: claimed.delivery.encryptionKeyId,
        tokenCiphertext: claimed.delivery.tokenCiphertext,
        tokenIv: claimed.delivery.tokenIv,
        tokenAuthTag: claimed.delivery.tokenAuthTag,
      },
      {
        tenantId: claimed.delivery.tenantId,
        invitationId: claimed.delivery.invitationId,
        deliveryId: claimed.delivery.id,
      },
      {
        activeKeyId: keyring.INVITATION_TOKEN_ENCRYPTION_KEY_ID,
        keys: keyring.INVITATION_TOKEN_ENCRYPTION_KEYS,
      }
    )
    failureCode = 'PROVIDER_DELIVERY_FAILED'
    await adapter.deliver({
      recipientEmail: claimed.delivery.recipientEmail,
      redirectTo: deliveryRedirect(getPublicEnv().NEXT_PUBLIC_APP_URL, token),
      existingProviderSubject: claimed.invitation.intendedProviderSubject,
      expiresAt: claimed.invitation.expiresAt,
    })
  } catch {
    const failedAt = clock()
    const deadLetter = claimed.delivery.attemptCount >= MAX_DELIVERY_ATTEMPTS
    await withWorkerTenantTransaction(context, (tx) =>
      completeInvitationDelivery(tx, {
        tenantId: context.tenantId,
        id: claimed.delivery.id,
        outcome: deadLetter ? 'dead_letter' : 'failed',
        expectedAttemptCount: claimed.delivery.attemptCount,
        errorCode: failureCode,
        ...(!deadLetter
          ? {
              retryAt: new Date(failedAt.getTime() + retryDelayMs(claimed.delivery.attemptCount)),
            }
          : {}),
        at: failedAt,
      })
    )
    return deadLetter ? 'dead_letter' : 'failed'
  }

  const deliveredAt = clock()
  await withWorkerTenantTransaction(context, (tx) =>
    completeInvitationDelivery(tx, {
      tenantId: context.tenantId,
      id: claimed.delivery.id,
      outcome: 'delivered',
      expectedAttemptCount: claimed.delivery.attemptCount,
      at: deliveredAt,
    })
  )
  return 'delivered'
}

export async function processInvitationDeliveryBatch(
  context: WorkerDatabaseContext,
  adapter: InvitationDeliveryAdapter,
  options: { limit?: number; at?: Date; clock?: () => Date } = {}
): Promise<{ claimed: number; delivered: number; failed: number; deadLetter: number }> {
  const at = options.at ?? new Date()
  const clock = options.clock ?? (() => new Date())
  // Validate the deployed keyring once. A missing worker configuration is a
  // batch-level deployment error; a missing historical key or corrupt row is
  // isolated per delivery below and cannot poison later claims.
  const keyring = getInvitationDeliveryEnv()
  const claimed = await withWorkerTenantTransaction(context, (tx) =>
    claimInvitationDeliveries(tx, context.tenantId, { limit: options.limit, at })
  )
  const results = []
  for (const delivery of claimed) {
    results.push(await deliverOne(context, delivery, adapter, at, keyring, clock))
  }
  return {
    claimed: claimed.length,
    delivered: results.filter((result) => result === 'delivered').length,
    failed: results.filter((result) => result === 'failed').length,
    deadLetter: results.filter((result) => result === 'dead_letter').length,
  }
}
