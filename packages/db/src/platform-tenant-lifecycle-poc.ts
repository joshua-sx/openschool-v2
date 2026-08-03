import assert from 'node:assert/strict'
import { getControlPlaneEnv, getMigrationEnv, getServerEnv } from '@openschool/config/server'
import { sql } from 'drizzle-orm'
import postgres from 'postgres'
import {
  type PlatformIdentityDatabaseContext,
  closePlatformDatabasePoolForProof,
  resolvePlatformDatabaseContext,
  withPlatformPolicyTransaction,
} from './platform-transaction'
import { applyTenantLifecycle } from './tenant-lifecycle'
import { TenantDatabaseError, createDatabaseExecutionProofHarness } from './tenant-transaction'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])
const TENANT_A = '00000000-0000-4000-8000-000000000001'
const TENANT_B = '00000000-0000-4000-8000-000000000002'
const TENANT_A_ACCOUNT = '00000000-0000-4000-8000-000000000201'
const TENANT_A_PERSON = '00000000-0000-4000-8000-000000000901'
const TENANT_B_ACCOUNT = '00000000-0000-4000-8000-000000000207'
const TENANT_B_PERSON = '00000000-0000-4000-8000-000000000908'

interface PostgresErrorLike {
  code?: string
  message?: string
  cause?: unknown
}

function hasPostgresError(error: unknown, code?: string, message?: string): boolean {
  let current = error
  for (let depth = 0; depth < 6; depth += 1) {
    if (typeof current !== 'object' || current === null) return false
    const candidate = current as PostgresErrorLike
    if ((!code || candidate.code === code) && (!message || candidate.message?.includes(message))) {
      return true
    }
    current = candidate.cause
  }
  return false
}

function assertGuardedProof(): void {
  if (process.env.ALLOW_PLATFORM_TENANT_LIFECYCLE_POC !== 'true') {
    throw new Error(
      'Platform Tenant lifecycle proof refused: ALLOW_PLATFORM_TENANT_LIFECYCLE_POC must be exactly "true".'
    )
  }
  const urls = [
    getMigrationEnv().DATABASE_MIGRATION_URL,
    getServerEnv().DATABASE_RUNTIME_URL,
    getControlPlaneEnv().DATABASE_CONTROL_PLANE_URL,
  ].map((value) => new URL(value))
  if (urls.some((url) => !LOOPBACK_HOSTS.has(url.hostname))) {
    throw new Error(
      'Platform Tenant lifecycle proof refused: every database host must be loopback.'
    )
  }
  const identities = urls.map((url) => `${url.hostname}:${url.port || '5432'}${url.pathname}`)
  if (new Set(identities).size !== 1) {
    throw new Error('Platform Tenant lifecycle proof refused: every role must target one database.')
  }
}

function platformIdentity(
  providerSubject: string,
  providerSessionId: string,
  assuranceLevel: 'aal1' | 'aal2',
  reauthenticatedAt: Date,
  requestId = crypto.randomUUID()
): PlatformIdentityDatabaseContext {
  return {
    identityProvider: 'supabase',
    providerSubject,
    providerSessionId,
    requestId,
    assuranceLevel,
    reauthenticatedAt: reauthenticatedAt.toISOString(),
  }
}

function platformPolicy(correlationId: string) {
  return {
    capability: 'platform.tenants.manage',
    policyVersion: '2026-08-03.v2',
    queryConstraints: [{ kind: 'platform' }] as const,
    correlationId,
  }
}

function tenantContext(
  tenantId: string,
  accountId: string,
  personId: string,
  sessionId: string,
  membershipVersion: number,
  securityVersion: number
) {
  return {
    accountId,
    personId,
    tenantId,
    sessionId,
    requestId: crypto.randomUUID(),
    assuranceLevel: 'aal2' as const,
    membershipVersion,
    securityVersion,
    contextPolicyVersion: 1,
  }
}

async function run(): Promise<void> {
  assertGuardedProof()
  const admin = postgres(getMigrationEnv().DATABASE_MIGRATION_URL, { max: 2, prepare: false })
  const runtime = createDatabaseExecutionProofHarness('runtime', 2)
  const worker = createDatabaseExecutionProofHarness('worker', 1)
  const directControlPlane = postgres(getControlPlaneEnv().DATABASE_CONTROL_PLANE_URL, {
    max: 1,
    prepare: false,
  })
  const directRuntime = postgres(getServerEnv().DATABASE_RUNTIME_URL, { max: 1, prepare: false })

  const platformAccountId = crypto.randomUUID()
  const platformGrantId = crypto.randomUUID()
  const platformProviderSubject = `platform-proof-${platformAccountId}`
  const platformProviderSessionId = `platform-proof-session-${platformAccountId}`
  const tenantASessionId = `tenant-a-proof-session-${platformAccountId}`
  const tenantBSessionId = `tenant-b-proof-session-${platformAccountId}`
  const staleReauthentication = new Date(Date.now() - 20 * 60 * 1000)
  const freshReauthentication = new Date(Date.now() - 60 * 1000)
  const authenticatedAt = new Date(Date.now() - 25 * 60 * 1000)
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
  let outboxInsertRevoked = false

  try {
    const [tenantAAccount] = await admin<
      Array<{ membershipVersion: number; securityVersion: number }>
    >`
      select membership_version as "membershipVersion", security_version as "securityVersion"
      from accounts where id = ${TENANT_A_ACCOUNT}
    `
    const [tenantBAccount] = await admin<
      Array<{ membershipVersion: number; securityVersion: number }>
    >`
      select membership_version as "membershipVersion", security_version as "securityVersion"
      from accounts where id = ${TENANT_B_ACCOUNT}
    `
    assert.ok(tenantAAccount)
    assert.ok(tenantBAccount)

    await admin`
      update tenants set status = 'active', updated_at = now()
      where id in (${TENANT_A}, ${TENANT_B})
    `
    await admin`
      insert into accounts (
        id, identity_provider, provider_subject, primary_email,
        status, membership_version, security_version
      ) values (
        ${platformAccountId}, 'supabase', ${platformProviderSubject},
        ${`platform-proof-${platformAccountId}@example.test`}, 'active', 1, 1
      )
    `
    await admin`
      insert into account_sessions (
        account_id, provider_session_id, status, assurance_level,
        security_version, authenticated_at, reauthenticated_at, expires_at
      ) values
        (${platformAccountId}, ${platformProviderSessionId}, 'active', 'aal1', 1,
          ${authenticatedAt}, ${staleReauthentication}, ${expiresAt}),
        (${TENANT_A_ACCOUNT}, ${tenantASessionId}, 'active', 'aal2',
          ${tenantAAccount.securityVersion}, ${authenticatedAt}, ${freshReauthentication}, ${expiresAt}),
        (${TENANT_B_ACCOUNT}, ${tenantBSessionId}, 'active', 'aal2',
          ${tenantBAccount.securityVersion}, ${authenticatedAt}, ${freshReauthentication}, ${expiresAt})
    `
    await admin`
      insert into platform_access_grants (
        id, account_id, role_template_key, status, valid_from, valid_until,
        issuance_source, issuance_reason
      ) values (
        ${platformGrantId}, ${platformAccountId}, 'super_admin', 'active',
        ${new Date(Date.now() - 60 * 1000)}, ${expiresAt}, 'bootstrap',
        'Guarded platform Tenant lifecycle proof'
      )
    `

    const [controlPlaneEvidence] = await directControlPlane<
      Array<{
        currentUser: string
        canSelectTenants: boolean
        canSelectStudents: boolean
        canSelectPlatformGrants: boolean
        canApplyLifecycle: boolean
      }>
    >`
      select
        current_user as "currentUser",
        has_table_privilege(current_user, 'public.tenants', 'SELECT') as "canSelectTenants",
        has_table_privilege(current_user, 'public.students', 'SELECT') as "canSelectStudents",
        has_table_privilege(current_user, 'public.platform_access_grants', 'SELECT')
          as "canSelectPlatformGrants",
        has_function_privilege(
          current_user,
          'openschool_private.apply_tenant_lifecycle(text,uuid,text)'::regprocedure,
          'EXECUTE'
        ) as "canApplyLifecycle"
    `
    assert.deepEqual(controlPlaneEvidence, {
      currentUser: 'openschool_control_plane',
      canSelectTenants: false,
      canSelectStudents: false,
      canSelectPlatformGrants: false,
      canApplyLifecycle: true,
    })
    await assert.rejects(
      directControlPlane`select id from public.students limit 1`,
      (error: unknown) => hasPostgresError(error, '42501')
    )

    const [runtimeAuthority] = await directRuntime<
      Array<{
        canApplyLifecycle: boolean
        canResolvePlatformAccess: boolean
        canResolveTenantAdmission: boolean
        canUpdateTenants: boolean
      }>
    >`
      select
        has_function_privilege(
          current_user,
          'openschool_private.apply_tenant_lifecycle(text,uuid,text)'::regprocedure,
          'EXECUTE'
        ) as "canApplyLifecycle",
        has_function_privilege(
          current_user,
          'openschool_private.resolve_platform_access()'::regprocedure,
          'EXECUTE'
        ) as "canResolvePlatformAccess",
        has_function_privilege(
          current_user,
          'openschool_private.resolve_tenant_admission_status(uuid)'::regprocedure,
          'EXECUTE'
        ) as "canResolveTenantAdmission",
        has_table_privilege(current_user, 'public.tenants', 'UPDATE') as "canUpdateTenants"
    `
    assert.deepEqual(runtimeAuthority, {
      canApplyLifecycle: false,
      canResolvePlatformAccess: false,
      canResolveTenantAdmission: true,
      canUpdateTenants: false,
    })

    const aal1Identity = platformIdentity(
      platformProviderSubject,
      platformProviderSessionId,
      'aal1',
      staleReauthentication
    )
    assert.equal(
      (await resolvePlatformDatabaseContext(aal1Identity)).roleTemplateKey,
      'super_admin'
    )
    await assert.rejects(
      withPlatformPolicyTransaction(
        aal1Identity,
        platformPolicy(aal1Identity.requestId),
        (transaction) =>
          applyTenantLifecycle(transaction, {
            action: 'suspend',
            tenantId: TENANT_A,
            reason: 'AAL1 must not operate Tenant lifecycle',
          })
      ),
      (error: unknown) => hasPostgresError(error, '22023', 'TENANT_LIFECYCLE_CONTEXT_INVALID')
    )

    await admin`
      update account_sessions
      set assurance_level = 'aal2', updated_at = now()
      where account_id = ${platformAccountId} and provider_session_id = ${platformProviderSessionId}
    `
    const staleIdentity = platformIdentity(
      platformProviderSubject,
      platformProviderSessionId,
      'aal2',
      staleReauthentication
    )
    await assert.rejects(
      withPlatformPolicyTransaction(
        staleIdentity,
        platformPolicy(staleIdentity.requestId),
        (transaction) =>
          applyTenantLifecycle(transaction, {
            action: 'suspend',
            tenantId: TENANT_A,
            reason: 'Stale reauthentication must not operate Tenant lifecycle',
          })
      ),
      (error: unknown) => hasPostgresError(error, '22023', 'TENANT_LIFECYCLE_CONTEXT_INVALID')
    )

    await admin`
      update account_sessions
      set reauthenticated_at = ${freshReauthentication}, updated_at = now()
      where account_id = ${platformAccountId} and provider_session_id = ${platformProviderSessionId}
    `
    const freshIdentity = platformIdentity(
      platformProviderSubject,
      platformProviderSessionId,
      'aal2',
      freshReauthentication
    )

    const tenantAContext = tenantContext(
      TENANT_A,
      TENANT_A_ACCOUNT,
      TENANT_A_PERSON,
      tenantASessionId,
      tenantAAccount.membershipVersion,
      tenantAAccount.securityVersion
    )
    const tenantBContext = tenantContext(
      TENANT_B,
      TENANT_B_ACCOUNT,
      TENANT_B_PERSON,
      tenantBSessionId,
      tenantBAccount.membershipVersion,
      tenantBAccount.securityVersion
    )

    let releaseInFlight!: () => void
    let markInFlightEntered!: () => void
    const inFlightEntered = new Promise<void>((resolve) => {
      markInFlightEntered = resolve
    })
    const releaseInFlightSignal = new Promise<void>((resolve) => {
      releaseInFlight = resolve
    })
    const inFlight = runtime.withTenantTransaction(tenantAContext, async (transaction) => {
      markInFlightEntered()
      await releaseInFlightSignal
      await transaction.execute(sql`select 1`)
    })
    await inFlightEntered

    let suspensionSettled = false
    const suspendIdentity = { ...freshIdentity, requestId: crypto.randomUUID() }
    const suspension = withPlatformPolicyTransaction(
      suspendIdentity,
      platformPolicy(suspendIdentity.requestId),
      (transaction) =>
        applyTenantLifecycle(transaction, {
          action: 'suspend',
          tenantId: TENANT_A,
          reason: 'Guarded proof of immediate Tenant suspension',
        })
    ).finally(() => {
      suspensionSettled = true
    })
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.equal(suspensionSettled, false)
    releaseInFlight()
    await inFlight
    const suspended = await suspension
    assert.equal(suspended.tenantStatus, 'suspended')

    await assert.rejects(
      runtime.withTenantTransaction(tenantAContext, async () => undefined),
      (error: unknown) =>
        error instanceof TenantDatabaseError && error.reason === 'TENANT_SUSPENDED'
    )
    await assert.rejects(
      worker.withWorkerTenantTransaction(
        {
          tenantId: TENANT_A,
          jobId: crypto.randomUUID(),
          jobType: 'platform_suspension_proof',
          requestId: crypto.randomUUID(),
        },
        async () => undefined
      ),
      (error: unknown) =>
        error instanceof TenantDatabaseError && error.reason === 'TENANT_SUSPENDED'
    )
    await runtime.withTenantTransaction(tenantBContext, async (transaction) => {
      await transaction.execute(sql`select 1`)
    })

    const [suspensionEvidence] = await admin<
      Array<{
        tenantStatus: string
        actorType: string
        actorPersonId: string | null
        source: string
        topic: string
        outboxStatus: string
      }>
    >`
      select
        tenant.status as "tenantStatus",
        event.actor_type as "actorType",
        event.actor_person_id as "actorPersonId",
        event.source,
        outbox.topic,
        outbox.status as "outboxStatus"
      from tenants as tenant
      inner join audit_events as event
        on event.tenant_id = tenant.id and event.id = ${suspended.auditEventId}
      inner join audit_outbox as outbox
        on outbox.tenant_id = event.tenant_id
        and outbox.audit_event_id = event.id
        and outbox.audit_event_occurred_at = event.occurred_at
      where tenant.id = ${TENANT_A}
    `
    assert.deepEqual(suspensionEvidence, {
      tenantStatus: 'suspended',
      actorType: 'platform',
      actorPersonId: null,
      source: 'platform',
      topic: 'security.context.invalidate',
      outboxStatus: 'pending',
    })

    await admin.unsafe(
      'revoke insert on table public.audit_outbox from openschool_tenant_lifecycle_manager'
    )
    outboxInsertRevoked = true
    const failedRequestId = crypto.randomUUID()
    await assert.rejects(
      withPlatformPolicyTransaction(
        { ...freshIdentity, requestId: failedRequestId },
        platformPolicy(failedRequestId),
        (transaction) =>
          applyTenantLifecycle(transaction, {
            action: 'reactivate',
            tenantId: TENANT_A,
            reason: 'Induced outbox failure must roll back everything',
          })
      ),
      (error: unknown) => hasPostgresError(error, '42501')
    )
    const [rollbackEvidence] = await admin<
      Array<{ tenantStatus: string; auditCount: number; outboxCount: number }>
    >`
      select
        (select status from tenants where id = ${TENANT_A}) as "tenantStatus",
        (select count(*)::int from audit_events where request_id = ${failedRequestId}) as "auditCount",
        (select count(*)::int from audit_outbox where context ->> 'requestId' = ${failedRequestId})
          as "outboxCount"
    `
    assert.deepEqual(rollbackEvidence, {
      tenantStatus: 'suspended',
      auditCount: 0,
      outboxCount: 0,
    })
    await admin.unsafe(
      'grant insert on table public.audit_outbox to openschool_tenant_lifecycle_manager'
    )
    outboxInsertRevoked = false

    const reactivateIdentity = { ...freshIdentity, requestId: crypto.randomUUID() }
    const reactivated = await withPlatformPolicyTransaction(
      reactivateIdentity,
      platformPolicy(reactivateIdentity.requestId),
      (transaction) =>
        applyTenantLifecycle(transaction, {
          action: 'reactivate',
          tenantId: TENANT_A,
          reason: 'Restore Tenant after guarded suspension proof',
        })
    )
    assert.equal(reactivated.tenantStatus, 'active')
    await runtime.withTenantTransaction(tenantAContext, async (transaction) => {
      await transaction.execute(sql`select 1`)
    })

    await admin`
      update platform_access_grants
      set status = 'revoked', revoked_at = now(), revoked_by_account_id = ${platformAccountId},
        revocation_reason = 'Proof of immediate platform grant revocation', updated_at = now()
      where id = ${platformGrantId}
    `
    await assert.rejects(
      resolvePlatformDatabaseContext({ ...freshIdentity, requestId: crypto.randomUUID() }),
      (error: unknown) => hasPostgresError(error, '42501', 'PLATFORM_ACCESS_DENIED')
    )

    console.log(
      'Platform Tenant lifecycle proof passed: isolated role, MFA/reauth, grant revocation, in-flight linearization, cross-Tenant continuity, runtime/worker suspension denial, atomic audit/outbox rollback, and reactivation.'
    )
  } finally {
    if (outboxInsertRevoked) {
      await admin.unsafe(
        'grant insert on table public.audit_outbox to openschool_tenant_lifecycle_manager'
      )
    }
    await admin`
      update tenants set status = 'active', updated_at = now() where id in (${TENANT_A}, ${TENANT_B})
    `
    await admin`
      delete from account_sessions
      where provider_session_id in (
        ${platformProviderSessionId}, ${tenantASessionId}, ${tenantBSessionId}
      )
    `
    await runtime.close()
    await worker.close()
    await closePlatformDatabasePoolForProof()
    await directControlPlane.end()
    await directRuntime.end()
    await admin.end()
  }
}

await run()
