import assert from 'node:assert/strict'
import {
  type VerifiedAccountIdentity,
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
  closeDatabaseExecutionPoolsForProof,
  createMigrationClient,
  people,
  roleTemplateAssignments,
  withPolicyTenantTransaction,
  withTenantTransaction,
} from '@openschool/db'
import {
  type AllowedPolicyDecision,
  CAPABILITIES,
  evaluatePolicy,
  selectPolicyBundle,
} from '@openschool/rbac'
import { TRPCError } from '@trpc/server'
import { and, eq, inArray } from 'drizzle-orm'
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
  const adminIdentity = identity(
    ADMIN_ACCOUNT,
    `identity-revocation-admin-${runId}`,
    'aal2',
    new Date(NOW.getTime() - 60_000).toISOString()
  )
  const targetSession = (label: string) => `identity-revocation-target-${label}-${runId}`

  try {
    await db.insert(accounts).values({
      id: targetAccountId,
      identityProvider: 'supabase',
      providerSubject: targetAccountId,
      primaryEmail: `${targetAccountId}@revocation-proof.test`,
    })
    await db.insert(people).values({
      id: targetPersonA,
      tenantId: TENANT_A,
      displayName: 'Revocation Proof Target',
      normalizedDisplayName: 'revocation proof target',
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
    await assert.rejects(
      withPolicyTenantTransaction(
        requestContext(adminContext, 'rollback'),
        toDatabasePolicyContext(decision),
        async (tx) => {
          await applyIdentityRevocation(tx, {
            action: 'account_session_revoke',
            targetId: rollbackSessionId,
            reason: 'Simulated audit failure',
          })
          throw new Error('SIMULATED_AUDIT_FAILURE')
        }
      ),
      /SIMULATED_AUDIT_FAILURE/
    )
    const [rolledBack] = await db
      .select({ status: accountSessions.status })
      .from(accountSessions)
      .where(eq(accountSessions.id, rollbackSessionId))
    assert.equal(rolledBack?.status, 'active')

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
    const mfaReset = await revokeIdentityAccess(
      requestContext(adminContext, 'mfa-reset'),
      policyContext,
      decision,
      {
        action: 'account_mfa_reset',
        targetId: targetAccountId,
        reason: 'Lost authenticator recovery',
      },
      {
        async resetFactors(providerSubject) {
          resetSubjects.push(providerSubject)
          return 2
        },
      }
    )
    assert.equal(mfaReset.providerMfaReset, 'completed')
    assert.equal(mfaReset.deletedMfaFactorCount, 2)
    assert.deepEqual(resetSubjects, [targetAccountId])
    assert.equal(mfaReset.effects[0]?.securityVersion, 3)

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
    assert.deepEqual(stillActive, { status: 'active', securityVersion: 3 })

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
    assert.equal(disabled.effects[0]?.securityVersion, 4)
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
      'Identity revocation proof passed: MFA and recent-login obligations, rollback on missing evidence, one/all session revocation, MFA reset, membership invalidation, stale-context denial, cross-Tenant denial, Account disablement, and durable invalidation outbox evidence.'
    )
  } finally {
    await db
      .delete(accountSessions)
      .where(
        inArray(accountSessions.providerSessionId, [
          adminIdentity.sessionId,
          targetSession('rollback'),
          targetSession('all-0'),
          targetSession('all-1'),
          targetSession('mfa'),
          targetSession('membership'),
        ])
      )
    await db
      .delete(roleTemplateAssignments)
      .where(inArray(roleTemplateAssignments.id, [targetRoleA, targetRoleB, targetRoleCrossTenant]))
    await db
      .delete(affiliations)
      .where(
        inArray(affiliations.id, [
          targetAffiliationA,
          targetAffiliationB,
          targetAffiliationCrossTenant,
        ])
      )
    await db.delete(accountLinks).where(inArray(accountLinks.id, [targetLinkA, targetLinkB]))
    await db.delete(people).where(inArray(people.id, [targetPersonA, targetPersonB]))
    await db.delete(accounts).where(eq(accounts.id, targetAccountId))
    await closeDatabaseExecutionPoolsForProof()
    await db.$client.end({ timeout: 5 })
  }
}

await run()
