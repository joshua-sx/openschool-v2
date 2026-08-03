import assert from 'node:assert/strict'
import { getControlPlaneEnv, getMigrationEnv, getServerEnv } from '@openschool/config/server'
import { sql } from 'drizzle-orm'
import postgres from 'postgres'
import {
  type PlatformIdentityDatabaseContext,
  closePlatformDatabasePoolForProof,
  withPlatformPolicyTransaction,
} from './platform-transaction'
import {
  closeSupportAccess,
  expireSupportAccessGrant,
  issueSupportAccessGrant,
  listSupportAccessGrants,
  openBreakGlassAccess,
  reviewSupportAccessGrant,
  revokeSupportAccessGrant,
} from './support-access'
import {
  type SupportIdentityDatabaseContext,
  TenantDatabaseError,
  closeDatabaseExecutionPoolsForProof,
  withPolicyTenantTransaction,
  withSupportAccessClosureTransaction,
  withSupportPolicyTenantTransaction,
  withWorkerTenantTransaction,
} from './tenant-transaction'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])
const TENANT_A = '00000000-0000-4000-8000-000000000001'
const TENANT_B = '00000000-0000-4000-8000-000000000002'
const TENANT_ADMIN_ACCOUNT = '00000000-0000-4000-8000-000000000201'
const TENANT_ADMIN_PERSON = '00000000-0000-4000-8000-000000000901'
const SCHOOL_ADMIN_ACCOUNT = '00000000-0000-4000-8000-000000000202'
const SCHOOL_ADMIN_PERSON = '00000000-0000-4000-8000-000000000902'
const SCHOOL_A = '00000000-0000-4000-8000-000000000101'
const SCHOOL_B = '00000000-0000-4000-8000-000000000102'
const STUDENT_A = '00000000-0000-4000-8000-000000000401'
const STUDENT_SIBLING_SCHOOL = '00000000-0000-4000-8000-000000000402'
const STUDENT_OTHER_TENANT = '00000000-0000-4000-8000-000000000403'
const PROOF_TIMEOUT_MS = 90_000

interface VersionRow {
  membershipVersion: number | string
  securityVersion: number | string
}

function assertGuardedProof(): void {
  if (process.env.ALLOW_SUPPORT_ACCESS_POC !== 'true') {
    throw new Error(
      'Support Access proof refused: ALLOW_SUPPORT_ACCESS_POC must be exactly "true".'
    )
  }
  const urls = [
    getMigrationEnv().DATABASE_MIGRATION_URL,
    getServerEnv().DATABASE_RUNTIME_URL,
    getControlPlaneEnv().DATABASE_CONTROL_PLANE_URL,
  ].map((value) => new URL(value))
  if (urls.some((url) => !LOOPBACK_HOSTS.has(url.hostname))) {
    throw new Error('Support Access proof refused: every database host must be loopback.')
  }
  const identities = urls.map((url) => `${url.hostname}:${url.port || '5432'}${url.pathname}`)
  if (new Set(identities).size !== 1) {
    throw new Error('Support Access proof refused: every role must target one database.')
  }
}

function supportIdentity(
  providerSubject: string,
  providerSessionId: string,
  reauthenticatedAt: Date
): SupportIdentityDatabaseContext {
  return {
    identityProvider: 'supabase',
    providerSubject,
    providerSessionId,
    requestId: crypto.randomUUID(),
    assuranceLevel: 'aal2',
    reauthenticatedAt: reauthenticatedAt.toISOString(),
  }
}

function platformIdentity(
  providerSubject: string,
  providerSessionId: string,
  reauthenticatedAt: Date
): PlatformIdentityDatabaseContext {
  return {
    identityProvider: 'supabase',
    providerSubject,
    providerSessionId,
    requestId: crypto.randomUUID(),
    assuranceLevel: 'aal2',
    reauthenticatedAt: reauthenticatedAt.toISOString(),
  }
}

async function run(): Promise<void> {
  assertGuardedProof()
  let proofStage = 'initialize proof dependencies'
  const proofWatchdog = setTimeout(() => {
    console.error('Support Access proof timed out.', { stage: proofStage })
    process.exit(1)
  }, PROOF_TIMEOUT_MS)
  const admin = postgres(getMigrationEnv().DATABASE_MIGRATION_URL, { max: 2, prepare: false })
  const supportAccountId = crypto.randomUUID()
  const supportPlatformGrantId = crypto.randomUUID()
  const supportProviderSubject = `support-proof-${supportAccountId}`
  const supportSessionA = `support-proof-a-${supportAccountId}`
  const supportSessionB = `support-proof-b-${supportAccountId}`
  const breakGlassAccountId = crypto.randomUUID()
  const breakGlassPlatformGrantId = crypto.randomUUID()
  const breakGlassProviderSubject = `break-glass-proof-${breakGlassAccountId}`
  const breakGlassSession = `break-glass-proof-${breakGlassAccountId}`
  const adminSession = `support-admin-proof-${supportAccountId}`
  const schoolAdminSession = `support-school-admin-proof-${supportAccountId}`
  const freshReauthentication = new Date(Date.now() - 30_000)
  const authenticatedAt = new Date(Date.now() - 60_000)
  const platformValidUntil = new Date(Date.now() + 60 * 60 * 1000)
  let failure: unknown

  try {
    proofStage = 'prepare support, break-glass, and Tenant administrator identities'
    const [adminVersion] = await admin<VersionRow[]>`
      select membership_version as "membershipVersion", security_version as "securityVersion"
      from accounts where id = ${TENANT_ADMIN_ACCOUNT}
    `
    const [schoolAdminVersion] = await admin<VersionRow[]>`
      select membership_version as "membershipVersion", security_version as "securityVersion"
      from accounts where id = ${SCHOOL_ADMIN_ACCOUNT}
    `
    assert.ok(adminVersion)
    assert.ok(schoolAdminVersion)
    const membershipVersion = Number(adminVersion.membershipVersion)
    const securityVersion = Number(adminVersion.securityVersion)
    const schoolAdminMembershipVersion = Number(schoolAdminVersion.membershipVersion)
    const schoolAdminSecurityVersion = Number(schoolAdminVersion.securityVersion)
    assert.equal(Number.isSafeInteger(membershipVersion), true)
    assert.equal(Number.isSafeInteger(securityVersion), true)
    assert.equal(Number.isSafeInteger(schoolAdminMembershipVersion), true)
    assert.equal(Number.isSafeInteger(schoolAdminSecurityVersion), true)

    await admin`
      insert into accounts (
        id, identity_provider, provider_subject, primary_email,
        status, membership_version, security_version
      ) values
        (${supportAccountId}, 'supabase', ${supportProviderSubject},
          ${`support-${supportAccountId}@example.test`}, 'active', 1, 1),
        (${breakGlassAccountId}, 'supabase', ${breakGlassProviderSubject},
          ${`break-glass-${breakGlassAccountId}@example.test`}, 'active', 1, 1)
    `
    await admin`
      insert into account_sessions (
        account_id, provider_session_id, status, assurance_level,
        security_version, authenticated_at, reauthenticated_at, expires_at
      ) values
        (${TENANT_ADMIN_ACCOUNT}, ${adminSession}, 'active', 'aal2', ${securityVersion},
          ${authenticatedAt}, ${freshReauthentication}, ${platformValidUntil}),
        (${SCHOOL_ADMIN_ACCOUNT}, ${schoolAdminSession}, 'active', 'aal2', ${schoolAdminSecurityVersion},
          ${authenticatedAt}, ${freshReauthentication}, ${platformValidUntil}),
        (${supportAccountId}, ${supportSessionA}, 'active', 'aal2', 1,
          ${authenticatedAt}, ${freshReauthentication}, ${platformValidUntil}),
        (${supportAccountId}, ${supportSessionB}, 'active', 'aal2', 1,
          ${authenticatedAt}, ${freshReauthentication}, ${platformValidUntil}),
        (${breakGlassAccountId}, ${breakGlassSession}, 'active', 'aal2', 1,
          ${authenticatedAt}, ${freshReauthentication}, ${platformValidUntil})
    `
    await admin`
      insert into platform_access_grants (
        id, account_id, role_template_key, status, valid_from, valid_until,
        issuance_source, issuance_reason
      ) values
        (${supportPlatformGrantId}, ${supportAccountId}, 'support_agent', 'active',
          ${new Date(Date.now() - 60_000)}, ${platformValidUntil}, 'bootstrap',
          'Guarded Support Access proof'),
        (${breakGlassPlatformGrantId}, ${breakGlassAccountId}, 'break_glass_operator', 'active',
          ${new Date(Date.now() - 60_000)}, ${platformValidUntil}, 'bootstrap',
          'Guarded break-glass proof')
    `

    const adminContext = {
      accountId: TENANT_ADMIN_ACCOUNT,
      personId: TENANT_ADMIN_PERSON,
      tenantId: TENANT_A,
      sessionId: adminSession,
      requestId: crypto.randomUUID(),
      assuranceLevel: 'aal2' as const,
      reauthenticatedAt: freshReauthentication.toISOString(),
      membershipVersion,
      securityVersion,
      contextPolicyVersion: 1,
      activeEducationOrganizationId: TENANT_A,
    }
    const managementPolicy = {
      capability: 'tenant.support.grants.manage',
      policyVersion: '2026-08-03.v4',
      queryConstraints: [{ kind: 'tenant' as const, tenantId: TENANT_A }],
      correlationId: crypto.randomUUID(),
    }
    const schoolAdminContext = {
      accountId: SCHOOL_ADMIN_ACCOUNT,
      personId: SCHOOL_ADMIN_PERSON,
      tenantId: TENANT_A,
      sessionId: schoolAdminSession,
      requestId: crypto.randomUUID(),
      assuranceLevel: 'aal2' as const,
      reauthenticatedAt: freshReauthentication.toISOString(),
      membershipVersion: schoolAdminMembershipVersion,
      securityVersion: schoolAdminSecurityVersion,
      contextPolicyVersion: 1,
      activeSchoolId: SCHOOL_A,
    }
    const schoolManagementPolicy = {
      capability: 'tenant.support.grants.manage',
      policyVersion: '2026-08-03.v4',
      queryConstraints: [{ kind: 'school' as const, tenantId: TENANT_A, schoolId: SCHOOL_A }],
      correlationId: crypto.randomUUID(),
    }

    proofStage = 'approve an exact-school Support Grant through Tenant authority'
    const approval = await withPolicyTenantTransaction(
      adminContext,
      managementPolicy,
      (transaction) =>
        issueSupportAccessGrant(transaction, {
          supportAccountId,
          scopeType: 'school',
          schoolId: SCHOOL_A,
          allowedCapabilities: ['support.schools.read', 'support.students.read'],
          purpose: 'customer_support',
          ticketReference: 'SUPPORT-POC-1',
          authorizationReason: 'Investigate the guarded support proof fixture',
          validUntil: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        })
    )
    assert.equal(approval.status, 'approved')

    proofStage = 'prove exact scope, cross-Tenant denial, and single-session binding'
    const supportA = supportIdentity(supportProviderSubject, supportSessionA, freshReauthentication)
    const schoolRows = await withSupportPolicyTenantTransaction(
      supportA,
      TENANT_A,
      approval.supportGrantId,
      {
        capability: 'support.schools.read',
        policyVersion: '2026-08-03.v4',
        correlationId: crypto.randomUUID(),
      },
      (transaction, context) => {
        assert.deepEqual(context.queryConstraints, [
          { kind: 'school', tenantId: TENANT_A, schoolId: SCHOOL_A },
        ])
        return transaction.execute<{ id: string }>(sql`select id from schools order by id`)
      }
    )
    assert.deepEqual(schoolRows, [{ id: SCHOOL_A }])

    const studentRows = await withSupportPolicyTenantTransaction(
      { ...supportA, requestId: crypto.randomUUID() },
      TENANT_A,
      approval.supportGrantId,
      {
        capability: 'support.students.read',
        policyVersion: '2026-08-03.v4',
        correlationId: crypto.randomUUID(),
      },
      (transaction) =>
        transaction.execute<{ id: string; schoolId: string }>(sql`
        select id, school_id as "schoolId" from students order by id
      `)
    )
    assert.equal(
      studentRows.some(({ id }) => id === STUDENT_A),
      true
    )
    assert.equal(
      studentRows.some(({ id }) => id === STUDENT_SIBLING_SCHOOL),
      false
    )
    assert.equal(
      studentRows.some(({ id }) => id === STUDENT_OTHER_TENANT),
      false
    )
    assert.equal(studentRows.length > 0, true)
    assert.equal(
      studentRows.every(({ schoolId }) => schoolId === SCHOOL_A),
      true
    )
    await assert.rejects(
      withSupportPolicyTenantTransaction(
        { ...supportA, requestId: crypto.randomUUID() },
        TENANT_B,
        approval.supportGrantId,
        {
          capability: 'support.schools.read',
          policyVersion: '2026-08-03.v4',
          correlationId: crypto.randomUUID(),
        },
        async () => undefined
      ),
      (error: unknown) =>
        error instanceof TenantDatabaseError && error.reason === 'DATABASE_CONTEXT_STALE'
    )
    await assert.rejects(
      withSupportPolicyTenantTransaction(
        supportIdentity(supportProviderSubject, supportSessionB, freshReauthentication),
        TENANT_A,
        approval.supportGrantId,
        {
          capability: 'support.schools.read',
          policyVersion: '2026-08-03.v4',
          correlationId: crypto.randomUUID(),
        },
        async () => undefined
      ),
      (error: unknown) =>
        error instanceof TenantDatabaseError && error.reason === 'DATABASE_CONTEXT_STALE'
    )

    proofStage = 'close Support Access and prove immediate invalidation'
    const closure = await withSupportAccessClosureTransaction(
      { ...supportA, requestId: crypto.randomUUID() },
      TENANT_A,
      approval.supportGrantId,
      {
        capability: 'support.sessions.use',
        policyVersion: '2026-08-03.v4',
        correlationId: crypto.randomUUID(),
      },
      (transaction) =>
        closeSupportAccess(
          transaction,
          TENANT_A,
          approval.supportGrantId,
          'Proof completed successfully'
        )
    )
    assert.equal(closure.status, 'closed')
    await assert.rejects(
      withSupportPolicyTenantTransaction(
        { ...supportA, requestId: crypto.randomUUID() },
        TENANT_A,
        approval.supportGrantId,
        {
          capability: 'support.schools.read',
          policyVersion: '2026-08-03.v4',
          correlationId: crypto.randomUUID(),
        },
        async () => undefined
      ),
      (error: unknown) =>
        error instanceof TenantDatabaseError && error.reason === 'DATABASE_CONTEXT_STALE'
    )

    proofStage = 'prove Tenant revocation and mandatory post-access review'
    const revocable = await withPolicyTenantTransaction(
      { ...adminContext, requestId: crypto.randomUUID() },
      { ...managementPolicy, correlationId: crypto.randomUUID() },
      (transaction) =>
        issueSupportAccessGrant(transaction, {
          supportAccountId,
          scopeType: 'school',
          schoolId: SCHOOL_B,
          allowedCapabilities: ['support.schools.read'],
          purpose: 'customer_support',
          ticketReference: 'SUPPORT-POC-2',
          authorizationReason: 'Prove Tenant revocation before use',
          validUntil: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        })
    )
    const revoked = await withPolicyTenantTransaction(
      { ...adminContext, requestId: crypto.randomUUID() },
      { ...managementPolicy, correlationId: crypto.randomUUID() },
      (transaction) =>
        revokeSupportAccessGrant(
          transaction,
          revocable.supportGrantId,
          'Tenant administrator ended proof access'
        )
    )
    assert.equal(revoked.status, 'revoked')
    const reviewed = await withPolicyTenantTransaction(
      { ...adminContext, requestId: crypto.randomUUID() },
      { ...managementPolicy, correlationId: crypto.randomUUID() },
      (transaction) =>
        reviewSupportAccessGrant(
          transaction,
          revocable.supportGrantId,
          'confirmed',
          'Proof events and scope matched the approved request'
        )
    )
    assert.equal(reviewed.reviewStatus, 'completed')

    proofStage = 'prove school administrators see notifications only for their authority scope'
    const schoolAdminNotifications = await withPolicyTenantTransaction(
      schoolAdminContext,
      schoolManagementPolicy,
      (transaction) =>
        transaction.execute<{ supportGrantId: string }>(sql`
          select support_grant_id as "supportGrantId"
          from support_access_notifications
          where tenant_id = ${TENANT_A}::uuid
          order by occurred_at, id
        `)
    )
    assert.equal(
      schoolAdminNotifications.some(
        (notification) => notification.supportGrantId === approval.supportGrantId
      ),
      true
    )
    assert.equal(
      schoolAdminNotifications.some(
        (notification) => notification.supportGrantId === revocable.supportGrantId
      ),
      false
    )

    const visibleGrants = await withPolicyTenantTransaction(
      { ...adminContext, requestId: crypto.randomUUID() },
      { ...managementPolicy, correlationId: crypto.randomUUID() },
      (transaction) => listSupportAccessGrants(transaction, 20)
    )
    assert.equal(
      visibleGrants.some((grant) => grant.supportGrantId === approval.supportGrantId),
      true
    )
    assert.equal(
      visibleGrants.some((grant) => grant.supportGrantId === revocable.supportGrantId),
      true
    )

    proofStage = 'open dedicated break-glass access and expire it through the worker role'
    const breakGlass = await withPlatformPolicyTransaction(
      platformIdentity(breakGlassProviderSubject, breakGlassSession, freshReauthentication),
      {
        capability: 'platform.break_glass.open',
        policyVersion: '2026-08-03.v4',
        queryConstraints: [{ kind: 'platform' }],
        correlationId: crypto.randomUUID(),
      },
      (transaction) =>
        openBreakGlassAccess(transaction, {
          tenantId: TENANT_A,
          scopeType: 'school',
          schoolId: SCHOOL_A,
          allowedCapabilities: ['support.schools.read'],
          ticketReference: 'INCIDENT-POC-1',
          emergencyRuleReference: 'SECURITY-RUNBOOK-1',
          authorizationReason: 'Prove isolated and expiring emergency access',
          validUntil: new Date(Date.now() + 3_000).toISOString(),
        })
    )
    assert.equal(breakGlass.status, 'active')
    await withSupportPolicyTenantTransaction(
      supportIdentity(breakGlassProviderSubject, breakGlassSession, freshReauthentication),
      TENANT_A,
      breakGlass.supportGrantId,
      {
        capability: 'support.schools.read',
        policyVersion: '2026-08-03.v4',
        correlationId: crypto.randomUUID(),
      },
      (transaction, context) => {
        assert.equal(context.supportKind, 'break_glass')
        assert.equal(context.roleTemplateKey, 'break_glass_operator')
        return transaction.execute(sql`select id from schools`)
      }
    )
    await new Promise((resolve) => setTimeout(resolve, 3_100))
    const expired = await withWorkerTenantTransaction(
      {
        tenantId: TENANT_A,
        jobId: crypto.randomUUID(),
        jobType: 'support_access_expiry',
        requestId: crypto.randomUUID(),
      },
      (transaction) => expireSupportAccessGrant(transaction, breakGlass.supportGrantId)
    )
    assert.equal(expired.status, 'expired')

    proofStage = 'verify immutable audit and Tenant-visible notification evidence'
    const [evidence] = await admin<
      Array<{
        auditCount: number | string
        notificationCount: number | string
        outboxCount: number | string
      }>
    >`
      select
        (select count(*) from audit_events
          where tenant_id = ${TENANT_A}
            and event_type like 'support.%'
            and (
              support_grant_id in (
                ${approval.supportGrantId}, ${revocable.supportGrantId}, ${breakGlass.supportGrantId}
              )
              or target_id in (
                ${approval.supportGrantId}, ${revocable.supportGrantId}, ${breakGlass.supportGrantId}
              )
            )
        ) as "auditCount",
        (select count(*) from support_access_notifications
          where tenant_id = ${TENANT_A}
            and support_grant_id in (${approval.supportGrantId}, ${revocable.supportGrantId}, ${breakGlass.supportGrantId})
        ) as "notificationCount",
        (select count(*) from support_notification_outbox as outbox
          inner join support_access_notifications as notification
            on notification.tenant_id = outbox.tenant_id
            and notification.id = outbox.notification_id
          where notification.support_grant_id in (
            ${approval.supportGrantId}, ${revocable.supportGrantId}, ${breakGlass.supportGrantId}
          )
        ) as "outboxCount"
    `
    assert.ok(evidence)
    assert.equal(Number(evidence.auditCount) >= 8, true)
    assert.equal(Number(evidence.notificationCount) >= 10, true)
    assert.equal(Number(evidence.outboxCount), Number(evidence.notificationCount))

    console.log('Support Access proof passed.', {
      supportGrant: approval.supportGrantId,
      revokedGrant: revocable.supportGrantId,
      breakGlassGrant: breakGlass.supportGrantId,
      auditEvents: Number(evidence.auditCount),
      notifications: Number(evidence.notificationCount),
    })
  } catch (error) {
    failure = error
  } finally {
    clearTimeout(proofWatchdog)
    const cleanup = await Promise.allSettled([
      admin.end({ timeout: 5 }),
      closeDatabaseExecutionPoolsForProof(),
      closePlatformDatabasePoolForProof(),
    ])
    const cleanupFailure = cleanup.find((result) => result.status === 'rejected')
    if (!failure && cleanupFailure?.status === 'rejected') failure = cleanupFailure.reason
  }

  if (failure) throw failure
}

await run()
