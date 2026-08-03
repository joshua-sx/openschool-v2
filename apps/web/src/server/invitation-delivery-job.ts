import {
  createSupabaseInvitationDeliveryAdapter,
  processInvitationDeliveryBatch,
} from '@openschool/auth/server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const tenantId = process.env.INVITATION_DELIVERY_TENANT_ID?.trim()

if (!tenantId || !UUID_PATTERN.test(tenantId)) {
  throw new Error('INVITATION_DELIVERY_TENANT_ID must be a valid Tenant UUID')
}

const result = await processInvitationDeliveryBatch(
  {
    tenantId,
    jobId: crypto.randomUUID(),
    jobType: 'invitation_delivery',
    requestId: crypto.randomUUID(),
  },
  createSupabaseInvitationDeliveryAdapter(),
  { limit: 25 }
)

// Deliberately emit aggregate operational evidence only. Recipient identities,
// redirect URLs, ciphertext, and raw invitation tokens are never logged.
console.log(
  `Invitation delivery batch complete: claimed=${result.claimed}, delivered=${result.delivered}, failed=${result.failed}, deadLetter=${result.deadLetter}.`
)
