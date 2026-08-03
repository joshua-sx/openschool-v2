import {
  createSupabaseMfaAdministrationAdapter,
  processProviderMfaReconciliationBatch,
} from '@openschool/auth/server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const tenantId =
  process.argv[2]?.trim() || process.env.PROVIDER_MFA_RECONCILIATION_TENANT_ID?.trim()

if (!tenantId || !UUID_PATTERN.test(tenantId)) {
  throw new Error(
    'Pass a valid Tenant UUID as the first argument or PROVIDER_MFA_RECONCILIATION_TENANT_ID'
  )
}

const result = await processProviderMfaReconciliationBatch(
  {
    tenantId: tenantId.toLowerCase(),
    jobId: crypto.randomUUID(),
    jobType: 'provider_mfa_reconciliation',
    requestId: crypto.randomUUID(),
  },
  createSupabaseMfaAdministrationAdapter(),
  { limit: 25 }
)

// Emit aggregate operational evidence only. Account IDs, provider subjects,
// factor IDs, provider error payloads, and other credential data are omitted.
console.log(
  `Provider MFA reconciliation batch complete: claimed=${result.claimed}, completed=${result.completed}, failed=${result.failed}, deadLetter=${result.deadLetter}, deletedFactors=${result.deletedFactorCount}.`
)
