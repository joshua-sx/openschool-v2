import assert from 'node:assert/strict'
import {
  TenantRequestContextError,
  type VerifiedAccountIdentity,
  processProviderMfaReconciliationBatch,
  resolveTenantRequestContext,
  toPolicyContext,
} from '@openschool/auth/server'
import { getMigrationEnv } from '@openschool/config/server'
import {
  accountLinks,
  accountSessions,
  accounts,
  affiliations,
  applyIdentityRevocation,
  auditOutbox,
  claimProviderSecurityReconciliations,
  closeDatabaseExecutionPoolsForProof,
  createMigrationClient,
  people,
  providerSecurityReconciliationOutbox,
  roleTemplateAssignments,
  withPolicyTenantTransaction,
  withTenantTransaction,
  withWorkerTenantTransaction,
} from '@openschool/db'
import {
  type AllowedPolicyDecision,
  CAPABILITIES,
  evaluatePolicy,
  selectPolicyBundle,
} from '@openschool/rbac'
import { TRPCError } from '@trpc/server'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { toDatabasePolicyContext } from '../services/database-context'
import { revokeIdentityAccess } from '../services/identity-revocation'

const TENANT_A = '00000000-0000-4000-8000-000000000001'
const TENANT_B = '00000000-0000-4000-8000-000000000002'
const ORGANIZATION_A = '00000000-0000-4000-8000-000000000001'
const SCHOOL_A = '00000000-0000-4000-8000-000000000102'
const SCHOOL_B = '00000000-0000-4000-8000-000000000103'
const ADMIN_ACCOUNT = '00000000-0000-4000-8000-000000000201'
const NOW = new Date()

function assertDisposableDatabase(url: URL): void {
  if (process.env.ALLOW_IDENTITY_REVOCATION_POC !== 'true') {
    throw new Error('Identity revocation proof refused: explicit opt-in is required.')
  }
  if (!new Set(['127.0.0.1', 'localhost', '[::1]']).has(url.hostname)) {
    throw new Error('Identity revocation proof refused: database host must be loopback.')
  }
}

function identity(
  accountId: string,
  sessionId: string,
  assuranceLevel: 'aal1' | 'aal2',
  reauthenticatedAt?: string
): VerifiedAccountIdentity {
  return Object.freeze({
    provider: 'supabase',
    subject: accountId,
    sessionId,
    email: `${accountId}@revocation-proof.test`,
    assuranceLevel,
    ...(reauthenticatedAt ? { reauthenticatedAt } : {}),
    issuedAt: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
    expiresAt: new Date(NOW.getTime() + 60 * 60_000).toISOString(),
  })
}

function accountManagementDecision(context: ReturnType<typeof toPolicyContext>, at = NOW) {
  return evaluatePolicy({
    bundle: selectPolicyBundle(),
    context,
    capability: CAPABILITIES.ACCOUNTS_MANAGE,
    resource: { kind: 'account', tenantId: context.tenantId },
    attributes: { now: at },
  })
}

function requestContext<T extends { requestId: string }>(context: T, label: string): T {
  return { ...context, requestId: `identity-revocation-proof:${label}:${crypto.randomUUID()}` }
}

function hasPostgresCode(error: unknown, code: string): boolean {
  let current = error
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== 'object' || current === null) return false
    const candidate = current as { code?: unknown; cause?: unknown }
    if (candidate.code === code) return true
    current = candidate.cause
  }
  return false
}

async function run(): Promise<void> {
  const databaseUrl = new URL(getMigrationEnv().DATABASE_MIGRATION_URL)
  assertDisposableDatabase(databaseUrl)
  const db = createMigrationClient()
  const runId = crypto.randomUUID()
  const targetAccountId = crypto.randomUUID()
  const targetPersonA = crypto.randomUUID()
  const targetPersonB = crypto.randomUUID()
  const targetLinkA = crypto.randomUUID()
  const targetLinkB = crypto.randomUUID()
  const targetAffiliationA = crypto.randomUUID()
  const targetAffiliationB = crypto.randomUUID()
  const targetAffiliationCrossTenant = crypto.randomUUID()
  const targetRoleA = crypto.randomUUID()
  const targetRoleB = crypto.randomUUID()
  const targetRoleCrossTenant = crypto.randomUUID()
  const unsupportedAccountId = crypto.randomUUID()
  const unsupportedPersonId = crypto.randomUUID()
  const unsupportedLinkId = crypto.randomUUID()
  const unsupportedAffiliationId = crypto.randomUUID()
  const adminIdentity = identity(
    ADMIN_ACCOUNT,
    `identity-revocation-admin-${runId}`,
    'aal2',
    new Date(NOW.getTime() - 60_000).toISOString()
  )
  const targetSession = (label: string) => `identity-revocation-target-${label}-${runId}`
  const reconciliationContext = () => ({
    tenantId: TENANT_A,
    jobId: crypto.randomUUID(),
    jobType: 'provider_mfa_reconciliation',
    requestId: crypto.randomUUID(),
  })
  let proofFailure: unknown
  const cleanupErrors: Error[] = []

  try {
    await db.insert(accounts).values({
      id: targetAccountId,
      identityProvider: 'supabase',
      providerSubject: targetAccountId,
      primaryEmail: `${targetAccountId}@revocation-proof.test`,
    })
    await db.insert(accounts).values({
      id: unsupportedAccountId,
      identityProvider: 'unsupported-proof-provider',
      providerSubject: unsupportedAccountId,
      primaryEmail: `${unsupportedAccountId}@revocation-proof.test`,
    })
    await db.insert(people).values({
      id: targetPersonA,
      tenantId: TENANT_A,
      displayName: 'Revocation Proof Target',
      normalizedDisplayName: 'revocation proof target',
      source: 'native',
    })
    await db.insert(people).values({
      id: unsupportedPersonId,
      tenantId: TENANT_A,
      displayName: 'Unsupported Provider Proof Target',
      normalizedDisplayName: 'unsupported provider proof target',
      source: 'native',
    })
    await db.insert(people).values({
      id: targetPersonB,
      tenantId: TENANT_B,
      displayName: 'Cross Tenant Revocation Target',
      normalizedDisplayName: 'cross tenant revocation target',
      source: 'native',
    })
    await db.insert(accountLinks).values({
      id: targetLinkA,
      tenantId: TENANT_A,
      accountId: targetAccountId,
      personId: targetPersonA,
      status: 'active',
      validFrom: new Date(NOW.getTime() - 60_000),
      issuanceReason: 'Identity revocation proof',
      activatedAt: new Date(NOW.getTime() - 60_000),
    })
    await db.insert(accountLinks).values({
      id: unsupportedLinkId,
      tenantId: TENANT_A,
      accountId: unsupportedAccountId,
      personId: unsupportedPersonId,
      status: 'active',
      validFrom: new Date(NOW.getTime() - 60_000),
      issuanceReason: 'Unsupported provider reconciliation proof',
      activatedAt: new Date(NOW.getTime() - 60_000),
    })
    await assert.rejects(
      db.insert(accountLinks).values({
        id: crypto.randomUUID(),
        tenantId: TENANT_A,
        accountId: targetAccountId,
        personId: targetPersonA,
        status: 'active',
        validFrom: new Date(NOW.getTime() - 60_000),
        issuanceReason: 'Overlapping active link denial proof',
        activatedAt: new Date(NOW.getTime() - 60_000),
      }),
      (error: unknown) => hasPostgresCode(error, '23P01')
    )
    await db.insert(affiliations).values([
      {
        id: targetAffiliationA,
        tenantId: TENANT_A,
        personId: targetPersonA,
        kind: 'employee',
        scopeType: 'school',
        schoolId: SCHOOL_A,
        validFrom: new Date(NOW.getTime() - 60_000),
        issuanceReason: 'Identity revocation proof',
      },
      {
        id: targetAffiliationB,
        tenantId: TENANT_A,
        personId: targetPersonA,
        kind: 'member',
        scopeType: 'school',
        schoolId: SCHOOL_A,
        validFrom: new Date(NOW.getTime() - 60_000),
        issuanceReason: 'Identity revocation proof',
      },
      {
        id: unsupportedAffiliationId,
        tenantId: TENANT_A,
        personId: unsupportedPersonId,
        kind: 'employee',
        scopeType: 'school',
        schoolId: SCHOOL_A,
        validFrom: new Date(NOW.getTime() - 60_000),
        issuanceReason: 'Unsupported provider reconciliation proof',
      },
    ])
    await db.insert(roleTemplateAssignments).values([
      {
        id: targetRoleA,
        tenantId: TENANT_A,
        affiliationId: targetAffiliationA,
        roleTemplateKey: 'staff',
        validFrom: new Date(NOW.getTime() - 60_000),
        issuanceReason: 'Identity revocation proof',
      },
      {
        id: targetRoleB,
        tenantId: TENANT_A,
        affiliationId: targetAffiliationB,
        roleTemplateKey: 'staff',
        validFrom: new Date(NOW.getTime() - 60_000),
        issuanceReason: 'Identity revocation proof',
      },
    ])

    const adminContext = await resolveTenantRequestContext(
      adminIdentity,
      { tenantId: TENANT_A, educationOrganizationId: ORGANIZATION_A },
      { requestId: `identity-revocation-admin-context:${runId}` },
      { at: NOW, comparisonMode: 'off' }
    )
    assert.equal(adminContext.reauthenticatedAt, adminIdentity.reauthenticatedAt)
    const policyContext = toPolicyContext(adminContext, adminIdentity)
    const allowed = accountManagementDecision(policyContext)
    assert.equal(allowed.effect, 'allow')
    const decision = allowed as AllowedPolicyDecision

    await assert.rejects(
      withPolicyTenantTransaction(
        requestContext(adminContext, 'runtime-queue-read-denied'),
        toDatabasePolicyContext(decision),
        (tx) => tx.execute(sql`select id from provider_security_reconciliation_outbox limit 1`)
      ),
      (error: unknown) => hasPostgresCode(error, '42501')
    )

    const adminContextWithoutRecentLogin = { ...adminContext }
    Reflect.deleteProperty(adminContextWithoutRecentLogin, 'reauthenticatedAt')
    const aal1 = toPolicyContext(
      { ...adminContextWithoutRecentLogin, assuranceLevel: 'aal1' },
      adminIdentity
    )
    assert.equal(accountManagementDecision(aal1).reason, 'MFA_REQUIRED')
    const policyWithoutRecentLogin = { ...policyContext }
    Reflect.deleteProperty(policyWithoutRecentLogin, 'authenticatedAt')
    assert.equal(
      accountManagementDecision(policyWithoutRecentLogin).reason,
      'REAUTHENTICATION_REQUIRED'
    )
    assert.equal(
      accountManagementDecision(
        { ...policyContext, authenticatedAt: new Date(NOW.getTime() - 16 * 60_000).toISOString() },
        NOW
      ).reason,
      'REAUTHENTICATION_REQUIRED'
    )

    const rollbackSessionId = crypto.randomUUID()
    await db.insert(accountSessions).values({
      id: rollbackSessionId,
      accountId: targetAccountId,
      providerSessionId: targetSession('rollback'),
      assuranceLevel: 'aal1',
      securityVersion: 1,
      authenticatedAt: new Date(NOW.getTime() - 60_000),
      expiresAt: new Date(NOW.getTime() + 60 * 60_000),
    })
    const rollbackContext = requestContext(adminContext, 'rollback')
    await assert.rejects(
      withPolicyTenantTransaction(
        rollbackContext,
        toDatabasePolicyContext(decision),
        async (tx) => {
          await applyIdentityRevocation(tx, {
            action: 'account_mfa_reset',
            targetId: targetAccountId,
            reason: 'Simulated audit failure',
          })
          throw new Error('SIMULATED_AUDIT_FAILURE')
        }
      ),
      /SIMULATED_AUDIT_FAILURE/
    )
    const [rolledBack] = await db
      .select({
        status: accountSessions.status,
        securityVersion: accounts.securityVersion,
      })
      .from(accountSessions)
      .innerJoin(accounts, eq(accounts.id, accountSessions.accountId))
      .where(eq(accountSessions.id, rollbackSessionId))
    assert.deepEqual(rolledBack, { status: 'active', securityVersion: 1 })
    const rollbackReconciliations = await db
      .select({ id: providerSecurityReconciliationOutbox.id })
      .from(providerSecurityReconciliationOutbox)
      .where(eq(providerSecurityReconciliationOutbox.requestId, rollbackContext.requestId))
    assert.equal(rollbackReconciliations.length, 0)

    const revokedOne = await revokeIdentityAccess(
      requestContext(adminContext, 'revoke-one'),
      policyContext,
      decision,
      {
        action: 'account_session_revoke',
        targetId: rollbackSessionId,
        reason: 'Revoke one proof session',
      }
    )
    assert.equal(revokedOne.effects[0]?.affectedSessionCount, 1)

    const raceSessionId = crypto.randomUUID()
    await db.insert(accountSessions).values({
      id: raceSessionId,
      accountId: targetAccountId,
      providerSessionId: targetSession('race'),
      assuranceLevel: 'aal1',
      securityVersion: 1,
      authenticatedAt: new Date(NOW.getTime() - 60_000),
      expiresAt: new Date(NOW.getTime() + 60 * 60_000),
    })
    const raceResults = await Promise.allSettled([
      revokeIdentityAccess(requestContext(adminContext, 'race-a'), policyContext, decision, {
        action: 'account_session_revoke',
        targetId: raceSessionId,
        reason: 'Concurrent revocation proof A',
      }),
      revokeIdentityAccess(requestContext(adminContext, 'race-b'), policyContext, decision, {
        action: 'account_session_revoke',
        targetId: raceSessionId,
        reason: 'Concurrent revocation proof B',
      }),
    ])
    const raceSuccesses = raceResults.filter((result) => result.status === 'fulfilled')
    const raceFailures = raceResults.filter((result) => result.status === 'rejected')
    assert.equal(raceSuccesses.length, 1)
    assert.equal(raceFailures.length, 1)
    assert.ok(
      raceFailures[0]?.reason instanceof TRPCError &&
        raceFailures[0].reason.message === 'SECURITY_TARGET_UNAVAILABLE'
    )

    const allSessionIds = [crypto.randomUUID(), crypto.randomUUID()]
    await db.insert(accountSessions).values(
      allSessionIds.map((id, index) => ({
        id,
        accountId: targetAccountId,
        providerSessionId: targetSession(`all-${index}`),
        assuranceLevel: 'aal1' as const,
        securityVersion: 1,
        authenticatedAt: new Date(NOW.getTime() - 60_000),
        expiresAt: new Date(NOW.getTime() + 60 * 60_000),
      }))
    )
    const revokedAll = await revokeIdentityAccess(
      requestContext(adminContext, 'revoke-all'),
      policyContext,
      decision,
      {
        action: 'account_sessions_revoke',
        targetId: targetAccountId,
        reason: 'Revoke all proof sessions',
      }
    )
    assert.equal(revokedAll.effects[0]?.securityVersion, 2)
    assert.equal(revokedAll.effects[0]?.affectedSessionCount, 2)

    const mfaSessionId = crypto.randomUUID()
    await db.insert(accountSessions).values({
      id: mfaSessionId,
      accountId: targetAccountId,
      providerSessionId: targetSession('mfa'),
      assuranceLevel: 'aal2',
      securityVersion: 2,
      authenticatedAt: new Date(NOW.getTime() - 60_000),
      reauthenticatedAt: new Date(NOW.getTime() - 60_000),
      expiresAt: new Date(NOW.getTime() + 60 * 60_000),
    })
    const resetSubjects: string[] = []
    let providerAttempts = 0
    const providerAdapter = {
      async resetFactors(providerSubject: string) {
        resetSubjects.push(providerSubject)
        providerAttempts += 1
        if (providerAttempts === 1) {
          throw new Error('SUPABASE_MFA_FACTOR_LIST_FAILED')
        }
        return 2
      },
    }
    const mfaReset = await revokeIdentityAccess(
      requestContext(adminContext, 'mfa-reset'),
      policyContext,
      decision,
      {
        action: 'account_mfa_reset',
        targetId: targetAccountId,
        reason: 'Lost authenticator recovery',
      }
    )
    assert.equal(mfaReset.providerMfaReset, 'pending')
    assert.equal(mfaReset.effects[0]?.securityVersion, 3)
    const recoveryPendingIdentity = identity(
      targetAccountId,
      targetSession('recovery-pending'),
      'aal2'
    )
    const expectRecoveryPending = () =>
      assert.rejects(
        resolveTenantRequestContext(
          recoveryPendingIdentity,
          { tenantId: TENANT_A, schoolId: SCHOOL_A },
          { requestId: crypto.randomUUID() },
          { at: NOW, comparisonMode: 'off' }
        ),
        (error: unknown) =>
          error instanceof TenantRequestContextError && error.reason === 'MFA_RECOVERY_PENDING'
      )
    await expectRecoveryPending()

    const firstAttemptAt = new Date()
    const firstBatch = await processProviderMfaReconciliationBatch(
      reconciliationContext(),
      providerAdapter,
      {
        at: firstAttemptAt,
        clock: () => new Date(firstAttemptAt.getTime() + 1_000),
      }
    )
    assert.deepEqual(firstBatch, {
      claimed: 1,
      completed: 0,
      failed: 1,
      deadLetter: 0,
      deletedFactorCount: 0,
    })
    const [failedReconciliation] = await db
      .select()
      .from(providerSecurityReconciliationOutbox)
      .where(
        and(
          eq(providerSecurityReconciliationOutbox.accountId, targetAccountId),
          eq(providerSecurityReconciliationOutbox.expectedSecurityVersion, 3)
        )
      )
    assert.ok(failedReconciliation)
    assert.equal(failedReconciliation.status, 'failed')
    assert.equal(failedReconciliation.attemptCount, 1)
    assert.equal(failedReconciliation.lastErrorCode, 'SUPABASE_MFA_FACTOR_LIST_FAILED')
    await expectRecoveryPending()

    const retryAt = failedReconciliation.availableAt
    const retryBatch = await processProviderMfaReconciliationBatch(
      reconciliationContext(),
      providerAdapter,
      { at: retryAt, clock: () => retryAt }
    )
    assert.deepEqual(retryBatch, {
      claimed: 1,
      completed: 1,
      failed: 0,
      deadLetter: 0,
      deletedFactorCount: 2,
    })
    const [completedReconciliation] = await db
      .select()
      .from(providerSecurityReconciliationOutbox)
      .where(eq(providerSecurityReconciliationOutbox.id, failedReconciliation.id))
    assert.equal(completedReconciliation?.status, 'completed')
    assert.equal(completedReconciliation?.attemptCount, 2)
    assert.equal(completedReconciliation?.deletedFactorCount, 2)

    const leaseReset = await revokeIdentityAccess(
      requestContext(adminContext, 'mfa-reset-lease-reclaim'),
      policyContext,
      decision,
      {
        action: 'account_mfa_reset',
        targetId: targetAccountId,
        reason: 'Lease reclamation proof',
      }
    )
    assert.equal(leaseReset.effects[0]?.securityVersion, 4)
    const leaseClaimAt = new Date(retryAt.getTime() + 1_000)
    const leaseClaim = await withWorkerTenantTransaction(reconciliationContext(), (tx) =>
      claimProviderSecurityReconciliations(tx, TENANT_A, { limit: 1, at: leaseClaimAt })
    )
    assert.equal(leaseClaim.length, 1)
    assert.equal(leaseClaim[0]?.expectedSecurityVersion, 4)
    await expectRecoveryPending()
    const reclaimedAt = new Date(leaseClaimAt.getTime() + 5 * 60_000 + 1)
    const reclaimedBatch = await processProviderMfaReconciliationBatch(
      reconciliationContext(),
      providerAdapter,
      { at: reclaimedAt, clock: () => reclaimedAt }
    )
    assert.equal(reclaimedBatch.completed, 1)
    const [reclaimed] = await db
      .select()
      .from(providerSecurityReconciliationOutbox)
      .where(
        and(
          eq(providerSecurityReconciliationOutbox.accountId, targetAccountId),
          eq(providerSecurityReconciliationOutbox.expectedSecurityVersion, 4)
        )
      )
    assert.equal(reclaimed?.status, 'completed')
    assert.equal(reclaimed?.attemptCount, 2)

    const unsupportedReset = await revokeIdentityAccess(
      requestContext(adminContext, 'unsupported-provider'),
      policyContext,
      decision,
      {
        action: 'account_mfa_reset',
        targetId: unsupportedAccountId,
        reason: 'Unsupported provider dead-letter proof',
      }
    )
    assert.equal(unsupportedReset.providerMfaReset, 'pending')
    const unsupportedBatch = await processProviderMfaReconciliationBatch(
      reconciliationContext(),
      {
        async resetFactors() {
          throw new Error('UNSUPPORTED_PROVIDER_MUST_NOT_REACH_ADAPTER')
        },
      },
      { at: new Date(reclaimedAt.getTime() + 1_000) }
    )
    assert.equal(unsupportedBatch.deadLetter, 1)
    const [unsupportedReconciliation] = await db
      .select()
      .from(providerSecurityReconciliationOutbox)
      .where(eq(providerSecurityReconciliationOutbox.accountId, unsupportedAccountId))
    assert.equal(unsupportedReconciliation?.status, 'dead_letter')
    assert.equal(unsupportedReconciliation?.lastErrorCode, 'IDENTITY_PROVIDER_UNSUPPORTED')
    assert.deepEqual(resetSubjects, [targetAccountId, targetAccountId, targetAccountId])

    const targetIdentity = identity(targetAccountId, targetSession('membership'), 'aal1')
    const targetContext = await resolveTenantRequestContext(
      targetIdentity,
      { tenantId: TENANT_A, schoolId: SCHOOL_A },
      { requestId: `identity-revocation-target-context:${runId}` },
      { at: NOW, comparisonMode: 'off' }
    )
    const revokedRole = await revokeIdentityAccess(
      requestContext(adminContext, 'role'),
      policyContext,
      decision,
      { action: 'role_revoke', targetId: targetRoleB, reason: 'Remove duplicate staff role' }
    )
    assert.equal(revokedRole.effects[0]?.membershipVersion, 2)
    const revokedAffiliation = await revokeIdentityAccess(
      requestContext(adminContext, 'affiliation'),
      policyContext,
      decision,
      {
        action: 'affiliation_revoke',
        targetId: targetAffiliationA,
        reason: 'Employment ended',
      }
    )
    assert.equal(revokedAffiliation.effects[0]?.membershipVersion, 3)
    await assert.rejects(
      withTenantTransaction(targetContext, async () => undefined),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'reason' in error &&
        error.reason === 'DATABASE_CONTEXT_STALE'
    )

    await db.insert(accountLinks).values({
      id: targetLinkB,
      tenantId: TENANT_B,
      accountId: targetAccountId,
      personId: targetPersonB,
      status: 'active',
      validFrom: new Date(NOW.getTime() - 60_000),
      issuanceReason: 'Cross Tenant denial proof',
      activatedAt: new Date(NOW.getTime() - 60_000),
    })
    await db.insert(affiliations).values({
      id: targetAffiliationCrossTenant,
      tenantId: TENANT_B,
      personId: targetPersonB,
      kind: 'employee',
      scopeType: 'school',
      schoolId: SCHOOL_B,
      validFrom: new Date(NOW.getTime() - 60_000),
      issuanceReason: 'Cross Tenant denial proof',
    })
    await db.insert(roleTemplateAssignments).values({
      id: targetRoleCrossTenant,
      tenantId: TENANT_B,
      affiliationId: targetAffiliationCrossTenant,
      roleTemplateKey: 'staff',
      validFrom: new Date(NOW.getTime() - 60_000),
      issuanceReason: 'Cross Tenant denial proof',
    })
    await assert.rejects(
      revokeIdentityAccess(requestContext(adminContext, 'cross-tenant'), policyContext, decision, {
        action: 'account_disable',
        targetId: targetAccountId,
        reason: 'Cross Tenant attempt',
      }),
      (error: unknown) =>
        error instanceof TRPCError && error.message === 'SECURITY_TARGET_OUT_OF_SCOPE'
    )
    const [stillActive] = await db
      .select({ status: accounts.status, securityVersion: accounts.securityVersion })
      .from(accounts)
      .where(eq(accounts.id, targetAccountId))
    assert.deepEqual(stillActive, { status: 'active', securityVersion: 4 })

    await db
      .update(roleTemplateAssignments)
      .set({
        status: 'revoked',
        validUntil: NOW,
        revokedAt: NOW,
        revocationReason: 'Proof cleanup',
      })
      .where(eq(roleTemplateAssignments.id, targetRoleCrossTenant))
    await db
      .update(affiliations)
      .set({
        status: 'revoked',
        validUntil: NOW,
        revokedAt: NOW,
        revocationReason: 'Proof cleanup',
      })
      .where(eq(affiliations.id, targetAffiliationCrossTenant))
    await db
      .update(accountLinks)
      .set({
        status: 'revoked',
        validUntil: NOW,
        revokedAt: NOW,
        revocationReason: 'Proof cleanup',
      })
      .where(eq(accountLinks.id, targetLinkB))

    const disabled = await revokeIdentityAccess(
      requestContext(adminContext, 'disable'),
      policyContext,
      decision,
      { action: 'account_disable', targetId: targetAccountId, reason: 'Disable account proof' }
    )
    assert.equal(disabled.effects[0]?.securityVersion, 5)
    const [disabledAccount] = await db
      .select({ status: accounts.status })
      .from(accounts)
      .where(eq(accounts.id, targetAccountId))
    assert.equal(disabledAccount?.status, 'disabled')

    const securityOutboxRows = await db
      .select({ topic: auditOutbox.topic })
      .from(auditOutbox)
      .where(
        and(
          eq(auditOutbox.tenantId, TENANT_A),
          eq(auditOutbox.topic, 'security.context.invalidate')
        )
      )
    assert.ok(securityOutboxRows.length >= 6)

    console.log(
      'Identity revocation proof passed: MFA and recent-login obligations, atomic queue rollback, serialized revocation races, one/all session revocation, provider retry, lease reclaim, unsupported-provider dead letter, membership invalidation, stale-context denial, cross-Tenant denial, Account disablement, and durable invalidation evidence.'
    )
  } catch (cause) {
    proofFailure = cause
  } finally {
    const cleanupStep = async (label: string, action: () => Promise<unknown>): Promise<void> => {
      try {
        await action()
      } catch (cause) {
        cleanupErrors.push(
          new Error(`Identity revocation proof cleanup failed: ${label}`, { cause })
        )
      }
    }
    await cleanupStep('provider security reconciliation rows', () =>
      db
        .delete(providerSecurityReconciliationOutbox)
        .where(
          inArray(providerSecurityReconciliationOutbox.accountId, [
            targetAccountId,
            unsupportedAccountId,
          ])
        )
    )
    await cleanupStep('Account Sessions', () =>
      db
        .delete(accountSessions)
        .where(
          inArray(accountSessions.providerSessionId, [
            adminIdentity.sessionId,
            targetSession('rollback'),
            targetSession('race'),
            targetSession('all-0'),
            targetSession('all-1'),
            targetSession('mfa'),
            targetSession('membership'),
            targetSession('recovery-pending'),
          ])
        )
    )
    await cleanupStep('Role Template Assignments', () =>
      db
        .delete(roleTemplateAssignments)
        .where(
          inArray(roleTemplateAssignments.id, [targetRoleA, targetRoleB, targetRoleCrossTenant])
        )
    )
    await cleanupStep('Affiliations', () =>
      db
        .delete(affiliations)
        .where(
          inArray(affiliations.id, [
            targetAffiliationA,
            targetAffiliationB,
            targetAffiliationCrossTenant,
            unsupportedAffiliationId,
          ])
        )
    )
    await cleanupStep('Account Links', () =>
      db
        .delete(accountLinks)
        .where(inArray(accountLinks.id, [targetLinkA, targetLinkB, unsupportedLinkId]))
    )
    await cleanupStep('People', () =>
      db
        .delete(people)
        .where(inArray(people.id, [targetPersonA, targetPersonB, unsupportedPersonId]))
    )
    await cleanupStep('Accounts', () =>
      db.delete(accounts).where(inArray(accounts.id, [targetAccountId, unsupportedAccountId]))
    )
    await cleanupStep('database execution pools', () => closeDatabaseExecutionPoolsForProof())
    await cleanupStep('migration client', () => db.$client.end({ timeout: 5 }))
  }

  if (proofFailure !== undefined) {
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [proofFailure, ...cleanupErrors],
        'Identity revocation proof and cleanup both failed'
      )
    }
    throw proofFailure
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Identity revocation proof cleanup was incomplete')
  }
}

await run()
