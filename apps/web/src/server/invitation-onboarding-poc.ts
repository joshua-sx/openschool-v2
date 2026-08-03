import assert from 'node:assert/strict'
import {
  InvitationAcceptanceError,
  InvitationAcceptanceRateLimitError,
  type InvitationDeliveryAdapter,
  type VerifiedAccountIdentity,
  acceptAccountInvitation,
  enforceInvitationAcceptanceRateLimit,
  generateInvitationToken,
  hashInvitationToken,
  openInvitationContinuation,
  openInvitationToken,
  processInvitationDeliveryBatch,
} from '@openschool/auth/server'
import {
  getInvitationDeliveryEnv,
  getMigrationEnv,
  getServerEnv,
  getWorkerEnv,
} from '@openschool/config/server'
import {
  type TenantDatabaseContext,
  accountInvitations,
  accountLinks,
  accountSessions,
  accounts,
  affiliations,
  auditEvents,
  auditOutbox,
  closeDatabaseExecutionPoolsForProof,
  createMigrationClient,
  invitationDeliveryOutbox,
  people,
  roleTemplateAssignments,
} from '@openschool/db'
import {
  type AllowedPolicyDecision,
  CAPABILITIES,
  CURRENT_POLICY_BUNDLE,
  type PolicyContext,
  evaluatePolicy,
} from '@openschool/rbac'
import { TRPCError } from '@trpc/server'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { cancelAccountInvitation, issueAccountInvitation } from '../services/invitations'

const TENANT_A = '00000000-0000-4000-8000-000000000001'
const SCHOOL_A = '00000000-0000-4000-8000-000000000101'
const SCHOOL_B = '00000000-0000-4000-8000-000000000103'
const ADMIN_ACCOUNT = '00000000-0000-4000-8000-000000000201'
const ADMIN_PERSON = '00000000-0000-4000-8000-000000000901'
const RUN_ID = crypto.randomUUID()
const ADMIN_SESSION = `invitation-onboarding-poc-${RUN_ID}`
const RUN_SLUG = RUN_ID.replaceAll('-', '')

function assertLocalDisposableDatabase(): void {
  if (process.env.ALLOW_INVITATION_ONBOARDING_POC !== 'true') {
    throw new Error(
      'Invitation onboarding proof refused: ALLOW_INVITATION_ONBOARDING_POC must be exactly "true".'
    )
  }
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]'])
  for (const [name, connectionString] of [
    ['DATABASE_MIGRATION_URL', getMigrationEnv().DATABASE_MIGRATION_URL],
    ['DATABASE_RUNTIME_URL', getServerEnv().DATABASE_RUNTIME_URL],
    ['DATABASE_WORKER_URL', getWorkerEnv().DATABASE_WORKER_URL],
  ] as const) {
    if (!loopbackHosts.has(new URL(connectionString).hostname)) {
      throw new Error(`Invitation onboarding proof refused: ${name} host must be loopback.`)
    }
  }
}

function adminPolicyContext(now: Date): PolicyContext {
  return Object.freeze({
    accountId: ADMIN_ACCOUNT,
    personId: ADMIN_PERSON,
    tenantId: TENANT_A,
    roleTemplateKeys: ['org_admin'],
    assuranceLevel: 'aal2',
    authenticatedAt: now.toISOString(),
    activeEducationOrganizationId: TENANT_A,
  })
}

function adminDatabaseContext(requestId: string): TenantDatabaseContext {
  return Object.freeze({
    accountId: ADMIN_ACCOUNT,
    personId: ADMIN_PERSON,
    tenantId: TENANT_A,
    sessionId: ADMIN_SESSION,
    requestId,
    assuranceLevel: 'aal2',
    membershipVersion: 1,
    securityVersion: 1,
    contextPolicyVersion: 1,
    activeEducationOrganizationId: TENANT_A,
  })
}

function allowAccountDecision(
  context: PolicyContext,
  capability: typeof CAPABILITIES.ACCOUNTS_INVITE | typeof CAPABILITIES.ACCOUNTS_MANAGE
): AllowedPolicyDecision {
  const decision = evaluatePolicy({
    bundle: CURRENT_POLICY_BUNDLE,
    context,
    capability,
    resource: {
      kind: 'account',
      tenantId: TENANT_A,
      organizationId: SCHOOL_A,
      organizationAncestorIds: [TENANT_A],
      schoolId: SCHOOL_A,
    },
  })
  assert.equal(decision.effect, 'allow', `${capability} must be allowed in the proof`)
  if (decision.effect !== 'allow') throw new Error('INVITATION_POC_POLICY_DENIED')
  return decision
}

function verifiedIdentity(email: string, suffix: string, now: Date): VerifiedAccountIdentity {
  return Object.freeze({
    provider: 'supabase',
    subject: `invitation-poc-subject-${RUN_ID}-${suffix}`,
    sessionId: `invitation-poc-session-${RUN_ID}-${suffix}`,
    email,
    assuranceLevel: 'aal1',
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
  })
}

function emailFor(suffix: string): string {
  return `invitation-poc-${RUN_SLUG}-${suffix}@example.test`
}

function hasPostgresConstraint(error: unknown, constraintName: string): boolean {
  const seen = new Set<object>()
  let current = error

  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current)
    const record = current as Record<string, unknown>
    if (record.constraint_name === constraintName) return true
    current = record.cause
  }

  return false
}

async function expectAcceptanceReason(
  operation: Promise<unknown>,
  reason: InvitationAcceptanceError['reason']
): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof InvitationAcceptanceError)
    assert.equal(error.reason, reason)
    return true
  })
}

async function runProof(): Promise<void> {
  assertLocalDisposableDatabase()
  const admin = createMigrationClient()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000)
  const policyContext = adminPolicyContext(now)
  const inviteDecision = allowAccountDecision(policyContext, CAPABILITIES.ACCOUNTS_INVITE)
  const manageDecision = allowAccountDecision(policyContext, CAPABILITIES.ACCOUNTS_MANAGE)
  const personIds = {
    success: crypto.randomUUID(),
    stolen: crypto.randomUUID(),
    cancelled: crypto.randomUUID(),
    duplicate: crypto.randomUUID(),
    expired: crypto.randomUUID(),
    rollback: crypto.randomUUID(),
    approvalDenied: crypto.randomUUID(),
    deliveryPoison: crypto.randomUUID(),
    deliveryValid: crypto.randomUUID(),
  }
  const emails = {
    success: emailFor('success'),
    stolen: emailFor('stolen'),
    cancelled: emailFor('cancelled'),
    duplicate: emailFor('duplicate'),
    expired: emailFor('expired'),
    rollback: emailFor('rollback'),
    approvalDenied: emailFor('approval-denied'),
    deliveryPoison: emailFor('delivery-poison'),
    deliveryValid: emailFor('delivery-valid'),
  }

  try {
    const [acceptorRole] = await admin.execute<
      Record<string, unknown> & { canLogin: boolean; bypassesRls: boolean; functionOwner: string }
    >(sql`
      select
        role.rolcanlogin as "canLogin",
        role.rolbypassrls as "bypassesRls",
        pg_get_userbyid(routine.proowner) as "functionOwner"
      from pg_catalog.pg_roles as role
      join pg_catalog.pg_proc as routine on pg_get_userbyid(routine.proowner) = role.rolname
      join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
      where role.rolname = 'openschool_invitation_acceptor'
        and namespace.nspname = 'openschool_private'
        and routine.proname = 'accept_account_invitation'
    `)
    assert.equal(acceptorRole?.canLogin, false)
    assert.equal(acceptorRole?.bypassesRls, false)
    assert.equal(acceptorRole?.functionOwner, 'openschool_invitation_acceptor')

    const rateLimitedIdentity = verifiedIdentity(emailFor('rate-limit'), 'rate-limit', now)
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      await enforceInvitationAcceptanceRateLimit(
        rateLimitedIdentity,
        `invitation-poc-${RUN_ID}-rate-limit-${attempt}`
      )
    }
    await assert.rejects(
      enforceInvitationAcceptanceRateLimit(
        rateLimitedIdentity,
        `invitation-poc-${RUN_ID}-rate-limit-blocked`
      ),
      InvitationAcceptanceRateLimitError
    )

    await admin.insert(accountSessions).values({
      accountId: ADMIN_ACCOUNT,
      providerSessionId: ADMIN_SESSION,
      status: 'active',
      assuranceLevel: 'aal2',
      securityVersion: 1,
      authenticatedAt: now,
      expiresAt,
    })
    await admin.insert(people).values(
      Object.entries(personIds).map(([suffix, id]) => ({
        id,
        tenantId: TENANT_A,
        displayName: `Invitation proof ${suffix}`,
        normalizedDisplayName: `invitation proof ${suffix} ${RUN_SLUG}`,
        email: emails[suffix as keyof typeof emails],
        normalizedEmail: emails[suffix as keyof typeof emails],
        source: 'native' as const,
      }))
    )

    await assert.rejects(
      admin.insert(accountInvitations).values({
        id: crypto.randomUUID(),
        tenantId: TENANT_A,
        personId: personIds.approvalDenied,
        intendedEmail: emails.approvalDenied,
        tokenHash: hashInvitationToken(generateInvitationToken()),
        affiliationKind: 'guardian',
        scopeType: 'school',
        schoolId: SCHOOL_A,
        roleTemplateKeys: ['student'],
        expiresAt,
        issuedByAccountId: ADMIN_ACCOUNT,
        issuanceReason: 'Database role-to-affiliation denial proof',
        createdAt: now,
        updatedAt: now,
      }),
      (error: unknown) => hasPostgresConstraint(error, 'account_invitations_roles_check')
    )

    const approvalDeniedRequestId = `invitation-poc-${RUN_ID}-approval-denied`
    await assert.rejects(
      issueAccountInvitation(
        adminDatabaseContext(approvalDeniedRequestId),
        policyContext,
        inviteDecision,
        {
          personId: personIds.approvalDenied,
          intendedEmail: emails.approvalDenied,
          affiliationKind: 'guardian',
          scope: { type: 'school', schoolId: SCHOOL_A },
          roleTemplateKeys: ['student'],
          issuanceReason: 'Approval-time denial audit proof',
        },
        now
      ),
      (error: unknown) =>
        error instanceof TRPCError && error.message === 'INVITATION_AFFILIATION_MISMATCH'
    )
    const [approvalDenialAudit] = await admin
      .select({ outcome: auditEvents.outcome, targetId: auditEvents.targetId })
      .from(auditEvents)
      .where(eq(auditEvents.requestId, approvalDeniedRequestId))
      .limit(1)
    assert.equal(approvalDenialAudit?.outcome, 'failed')
    assert.ok(approvalDenialAudit?.targetId)

    const success = await issueAccountInvitation(
      adminDatabaseContext(`invitation-poc-${RUN_ID}-issue-success`),
      policyContext,
      inviteDecision,
      {
        personId: personIds.success,
        intendedEmail: emails.success,
        affiliationKind: 'guardian',
        scope: { type: 'school', schoolId: SCHOOL_A },
        roleTemplateKeys: ['parent'],
        issuanceReason: 'Invitation onboarding atomicity proof',
      },
      now
    )
    const [storedInvitation] = await admin
      .select()
      .from(accountInvitations)
      .where(eq(accountInvitations.id, success.invitationId))
      .limit(1)
    const [storedDelivery] = await admin
      .select()
      .from(invitationDeliveryOutbox)
      .where(eq(invitationDeliveryOutbox.id, success.deliveryId))
      .limit(1)
    assert.ok(storedInvitation)
    assert.ok(storedDelivery)
    assert.equal(JSON.stringify({ storedInvitation, storedDelivery }).includes('osi_v1.'), false)
    assert.match(storedInvitation.tokenHash, /^[0-9a-f]{64}$/)

    let deliveredRedirect: string | undefined
    const adapter: InvitationDeliveryAdapter = {
      async deliver(request) {
        assert.equal(request.idempotencyKey, success.deliveryId)
        assert.equal(request.recipientEmail, emails.success)
        deliveredRedirect = request.redirectTo
      },
    }
    const deliveryResult = await processInvitationDeliveryBatch(
      {
        tenantId: TENANT_A,
        jobId: crypto.randomUUID(),
        jobType: 'invitation_delivery',
        requestId: `invitation-poc-${RUN_ID}-delivery`,
      },
      adapter,
      { limit: 1, at: new Date(now.getTime() + 1_000) }
    )
    assert.deepEqual(deliveryResult, { claimed: 1, delivered: 1, failed: 0, deadLetter: 0 })
    const [terminalDelivery] = await admin
      .select()
      .from(invitationDeliveryOutbox)
      .where(eq(invitationDeliveryOutbox.id, success.deliveryId))
      .limit(1)
    assert.equal(terminalDelivery?.status, 'delivered')
    assert.equal(terminalDelivery?.encryptionKeyId, null)
    assert.equal(terminalDelivery?.tokenCiphertext, null)
    assert.equal(terminalDelivery?.tokenIv, null)
    assert.equal(terminalDelivery?.tokenAuthTag, null)
    assert.ok(deliveredRedirect)
    const deliveryRedirect = new URL(deliveredRedirect)
    assert.equal(deliveryRedirect.pathname, '/auth/confirm')
    const continuation = deliveryRedirect.searchParams.get('invitation_continuation')
    assert.ok(continuation)
    const successToken = openInvitationContinuation(continuation, {
      activeKeyId: getInvitationDeliveryEnv().INVITATION_TOKEN_ENCRYPTION_KEY_ID,
      keys: getInvitationDeliveryEnv().INVITATION_TOKEN_ENCRYPTION_KEYS,
    }).token
    assert.equal(hashInvitationToken(successToken), storedInvitation.tokenHash)

    const successIdentity = verifiedIdentity(emails.success, 'success', now)
    const accepted = await acceptAccountInvitation(
      successIdentity,
      successToken,
      `invitation-poc-${RUN_ID}-accept-success`,
      new Date(now.getTime() + 2_000)
    )
    assert.equal(accepted.invitationId, success.invitationId)
    assert.equal(accepted.personId, personIds.success)
    const [acceptedInvitation] = await admin
      .select()
      .from(accountInvitations)
      .where(eq(accountInvitations.id, success.invitationId))
      .limit(1)
    assert.equal(acceptedInvitation?.status, 'accepted')
    const [acceptedAccount] = await admin
      .select()
      .from(accounts)
      .where(eq(accounts.providerSubject, successIdentity.subject))
      .limit(1)
    assert.equal(acceptedAccount?.id, accepted.accountId)
    const [link] = await admin
      .select()
      .from(accountLinks)
      .where(
        and(
          eq(accountLinks.tenantId, TENANT_A),
          eq(accountLinks.personId, personIds.success),
          eq(accountLinks.accountId, accepted.accountId)
        )
      )
      .limit(1)
    assert.equal(link?.status, 'active')
    const [affiliation] = await admin
      .select()
      .from(affiliations)
      .where(and(eq(affiliations.tenantId, TENANT_A), eq(affiliations.personId, personIds.success)))
      .limit(1)
    assert.equal(affiliation?.kind, 'guardian')
    assert.equal(affiliation?.schoolId, SCHOOL_A)
    assert.ok(affiliation)
    const [assignment] = await admin
      .select()
      .from(roleTemplateAssignments)
      .where(eq(roleTemplateAssignments.affiliationId, affiliation.id))
      .limit(1)
    assert.equal(assignment?.roleTemplateKey, 'parent')
    const [session] = await admin
      .select()
      .from(accountSessions)
      .where(eq(accountSessions.providerSessionId, successIdentity.sessionId))
      .limit(1)
    assert.equal(session?.status, 'active')
    const [acceptanceAudit] = await admin
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, 'account.invitation.accept'),
          eq(auditEvents.targetId, success.invitationId)
        )
      )
      .limit(1)
    assert.equal(acceptanceAudit?.actorAccountId, accepted.accountId)
    assert.ok(acceptanceAudit)
    const [acceptanceOutbox] = await admin
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.auditEventId, acceptanceAudit.id))
      .limit(1)
    assert.equal(acceptanceOutbox?.status, 'pending')
    await expectAcceptanceReason(
      acceptAccountInvitation(
        successIdentity,
        successToken,
        `invitation-poc-${RUN_ID}-replay`,
        new Date(now.getTime() + 3_000)
      ),
      'INVITATION_UNAVAILABLE'
    )

    const validIsolationDelivery = await issueAccountInvitation(
      adminDatabaseContext(`invitation-poc-${RUN_ID}-issue-delivery-valid`),
      policyContext,
      inviteDecision,
      {
        personId: personIds.deliveryValid,
        intendedEmail: emails.deliveryValid,
        affiliationKind: 'guardian',
        scope: { type: 'school', schoolId: SCHOOL_A },
        roleTemplateKeys: ['parent'],
        issuanceReason: 'Delivery poison-row isolation proof',
      },
      now
    )
    const poisonInvitationId = crypto.randomUUID()
    const poisonDeliveryId = crypto.randomUUID()
    const poisonToken = generateInvitationToken()
    const deliveryEnvironment = getInvitationDeliveryEnv()
    await admin.insert(accountInvitations).values({
      id: poisonInvitationId,
      tenantId: TENANT_A,
      personId: personIds.deliveryPoison,
      intendedEmail: emails.deliveryPoison,
      tokenHash: hashInvitationToken(poisonToken),
      affiliationKind: 'guardian',
      scopeType: 'school',
      schoolId: SCHOOL_A,
      roleTemplateKeys: ['parent'],
      expiresAt,
      issuedByAccountId: ADMIN_ACCOUNT,
      issuanceReason: 'Corrupt delivery isolation proof',
      createdAt: now,
      updatedAt: now,
    })
    await assert.rejects(
      admin.insert(invitationDeliveryOutbox).values({
        id: poisonDeliveryId,
        tenantId: TENANT_A,
        invitationId: poisonInvitationId,
        recipientEmail: emails.deliveryPoison,
        status: 'pending',
        availableAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      (error: unknown) => hasPostgresConstraint(error, 'invitation_delivery_encryption_check')
    )
    await admin.insert(invitationDeliveryOutbox).values({
      id: poisonDeliveryId,
      tenantId: TENANT_A,
      invitationId: poisonInvitationId,
      recipientEmail: emails.deliveryPoison,
      encryptionKeyId: deliveryEnvironment.INVITATION_TOKEN_ENCRYPTION_KEY_ID,
      tokenCiphertext: 'A'.repeat(80),
      tokenIv: 'A'.repeat(16),
      tokenAuthTag: 'A'.repeat(22),
      status: 'pending',
      availableAt: now,
      createdAt: now,
      updatedAt: now,
    })
    const deliveryCompletionTime = new Date(now.getTime() + 5 * 60 * 1000)
    const isolatedRecipients: string[] = []
    const isolatedDeliveryResult = await processInvitationDeliveryBatch(
      {
        tenantId: TENANT_A,
        jobId: crypto.randomUUID(),
        jobType: 'invitation_delivery',
        requestId: `invitation-poc-${RUN_ID}-delivery-isolation`,
      },
      {
        async deliver(request) {
          isolatedRecipients.push(request.recipientEmail)
        },
      },
      {
        limit: 2,
        at: new Date(now.getTime() + 4_000),
        clock: () => deliveryCompletionTime,
      }
    )
    assert.deepEqual(isolatedDeliveryResult, {
      claimed: 2,
      delivered: 1,
      failed: 1,
      deadLetter: 0,
    })
    assert.deepEqual(isolatedRecipients, [emails.deliveryValid])
    const [poisonDelivery] = await admin
      .select()
      .from(invitationDeliveryOutbox)
      .where(eq(invitationDeliveryOutbox.id, poisonDeliveryId))
      .limit(1)
    assert.equal(poisonDelivery?.status, 'failed')
    assert.equal(poisonDelivery?.lastErrorCode, 'INVITATION_CREDENTIAL_UNAVAILABLE')
    assert.ok(poisonDelivery?.availableAt && poisonDelivery.availableAt > deliveryCompletionTime)
    const [validTerminalDelivery] = await admin
      .select()
      .from(invitationDeliveryOutbox)
      .where(eq(invitationDeliveryOutbox.id, validIsolationDelivery.deliveryId))
      .limit(1)
    assert.equal(validTerminalDelivery?.status, 'delivered')
    assert.equal(validTerminalDelivery?.tokenCiphertext, null)

    const stolen = await issueAccountInvitation(
      adminDatabaseContext(`invitation-poc-${RUN_ID}-issue-stolen`),
      policyContext,
      inviteDecision,
      {
        personId: personIds.stolen,
        intendedEmail: emails.stolen,
        affiliationKind: 'guardian',
        scope: { type: 'school', schoolId: SCHOOL_A },
        roleTemplateKeys: ['parent'],
        issuanceReason: 'Stolen token rejection proof',
      },
      now
    )
    const stolenToken = await readInvitationToken(admin, stolen.invitationId, stolen.deliveryId)
    await expectAcceptanceReason(
      acceptAccountInvitation(
        verifiedIdentity(emailFor('attacker'), 'attacker', now),
        stolenToken,
        `invitation-poc-${RUN_ID}-stolen`,
        now
      ),
      'INVITATION_IDENTITY_MISMATCH'
    )
    assert.equal(
      (
        await admin
          .select({ status: accountInvitations.status })
          .from(accountInvitations)
          .where(eq(accountInvitations.id, stolen.invitationId))
          .limit(1)
      )[0]?.status,
      'pending'
    )

    const cancelled = await issueAccountInvitation(
      adminDatabaseContext(`invitation-poc-${RUN_ID}-issue-cancelled`),
      policyContext,
      inviteDecision,
      {
        personId: personIds.cancelled,
        intendedEmail: emails.cancelled,
        affiliationKind: 'guardian',
        scope: { type: 'school', schoolId: SCHOOL_A },
        roleTemplateKeys: ['parent'],
        issuanceReason: 'Cancellation rejection proof',
      },
      now
    )
    const cancelledToken = await readInvitationToken(
      admin,
      cancelled.invitationId,
      cancelled.deliveryId
    )
    await cancelAccountInvitation(
      adminDatabaseContext(`invitation-poc-${RUN_ID}-cancel`),
      policyContext,
      manageDecision,
      cancelled.invitationId,
      'Invitation withdrawn during proof',
      new Date(now.getTime() + 1_000)
    )
    await expectAcceptanceReason(
      acceptAccountInvitation(
        verifiedIdentity(emails.cancelled, 'cancelled', now),
        cancelledToken,
        `invitation-poc-${RUN_ID}-accept-cancelled`,
        now
      ),
      'INVITATION_UNAVAILABLE'
    )

    await issueAccountInvitation(
      adminDatabaseContext(`invitation-poc-${RUN_ID}-issue-duplicate-first`),
      policyContext,
      inviteDecision,
      {
        personId: personIds.duplicate,
        intendedEmail: emails.duplicate,
        affiliationKind: 'guardian',
        scope: { type: 'school', schoolId: SCHOOL_A },
        roleTemplateKeys: ['parent'],
        issuanceReason: 'Duplicate invitation rejection proof',
      },
      now
    )
    await assert.rejects(
      issueAccountInvitation(
        adminDatabaseContext(`invitation-poc-${RUN_ID}-issue-duplicate-second`),
        policyContext,
        inviteDecision,
        {
          personId: personIds.duplicate,
          intendedEmail: emails.duplicate,
          affiliationKind: 'guardian',
          scope: { type: 'school', schoolId: SCHOOL_A },
          roleTemplateKeys: ['parent'],
          issuanceReason: 'Duplicate invitation rejection proof',
        },
        now
      )
    )

    await assert.rejects(
      issueAccountInvitation(
        adminDatabaseContext(`invitation-poc-${RUN_ID}-cross-tenant`),
        policyContext,
        inviteDecision,
        {
          personId: personIds.expired,
          intendedEmail: emails.expired,
          affiliationKind: 'guardian',
          scope: { type: 'school', schoolId: SCHOOL_B },
          roleTemplateKeys: ['parent'],
          issuanceReason: 'Cross-Tenant scope rejection proof',
        },
        now
      ),
      (error: unknown) => error instanceof TRPCError && error.message === 'INVITATION_SCOPE_DENIED'
    )

    const expiredToken = generateInvitationToken()
    const expiredInvitationId = crypto.randomUUID()
    await admin.insert(accountInvitations).values({
      id: expiredInvitationId,
      tenantId: TENANT_A,
      personId: personIds.expired,
      intendedEmail: emails.expired,
      tokenHash: hashInvitationToken(expiredToken),
      affiliationKind: 'guardian',
      scopeType: 'school',
      schoolId: SCHOOL_A,
      roleTemplateKeys: ['parent'],
      expiresAt: new Date(now.getTime() - 60 * 60 * 1000),
      issuedByAccountId: ADMIN_ACCOUNT,
      issuanceReason: 'Expired invitation rejection proof',
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      updatedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    })
    await expectAcceptanceReason(
      acceptAccountInvitation(
        verifiedIdentity(emails.expired, 'expired', now),
        expiredToken,
        `invitation-poc-${RUN_ID}-expired`,
        now
      ),
      'INVITATION_UNAVAILABLE'
    )

    const rollbackToken = generateInvitationToken()
    const rollbackInvitationId = crypto.randomUUID()
    await admin.insert(accountInvitations).values({
      id: rollbackInvitationId,
      tenantId: TENANT_A,
      personId: personIds.rollback,
      intendedEmail: emails.rollback,
      tokenHash: hashInvitationToken(rollbackToken),
      affiliationKind: 'guardian',
      scopeType: 'school',
      schoolId: SCHOOL_A,
      roleTemplateKeys: ['parent'],
      expiresAt,
      issuedByAccountId: ADMIN_ACCOUNT,
      issuanceReason: 'Transactional rollback proof',
      createdAt: now,
      updatedAt: now,
    })
    const rollbackIdentity = verifiedIdentity(emails.rollback, 'rollback', now)
    await admin.insert(accountSessions).values({
      accountId: ADMIN_ACCOUNT,
      providerSessionId: rollbackIdentity.sessionId,
      status: 'active',
      assuranceLevel: 'aal1',
      securityVersion: 1,
      authenticatedAt: now,
      expiresAt,
    })
    await expectAcceptanceReason(
      acceptAccountInvitation(
        rollbackIdentity,
        rollbackToken,
        `invitation-poc-${RUN_ID}-rollback`,
        now
      ),
      'INVITATION_ACCOUNT_CONFLICT'
    )
    assert.equal(
      (
        await admin
          .select({ status: accountInvitations.status })
          .from(accountInvitations)
          .where(eq(accountInvitations.id, rollbackInvitationId))
          .limit(1)
      )[0]?.status,
      'pending'
    )
    assert.equal(
      (
        await admin
          .select({ id: accounts.id })
          .from(accounts)
          .where(eq(accounts.providerSubject, rollbackIdentity.subject))
      ).length,
      0
    )

    const denialTargetIds = [
      success.invitationId,
      stolen.invitationId,
      cancelled.invitationId,
      expiredInvitationId,
    ]
    const denialEvidence = await admin
      .select({
        targetId: auditEvents.targetId,
        actorType: auditEvents.actorType,
        actorAccountId: auditEvents.actorAccountId,
        actorPersonId: auditEvents.actorPersonId,
        policyDecision: auditEvents.policyDecision,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, 'account.invitation.accept'),
          eq(auditEvents.outcome, 'denied'),
          inArray(auditEvents.targetId, denialTargetIds)
        )
      )
    assert.deepEqual(
      denialEvidence.map(({ targetId }) => targetId).sort(),
      [...denialTargetIds].sort()
    )
    for (const evidence of denialEvidence) {
      assert.equal(evidence.actorType, 'system')
      assert.equal(evidence.actorAccountId, null)
      assert.equal(evidence.actorPersonId, null)
      const serialized = JSON.stringify(evidence.policyDecision)
      assert.equal(serialized.includes('@example.test'), false)
      assert.equal(serialized.includes('osi_v1.'), false)
    }

    console.log(
      'Invitation onboarding proof passed: issuance, encrypted delivery, atomic acceptance, replay/cancellation/expiry rejection, Tenant isolation, and rollback are enforced.'
    )
  } finally {
    await closeDatabaseExecutionPoolsForProof()
    await admin.$client.end({ timeout: 5 })
  }
}

async function readInvitationToken(
  admin: ReturnType<typeof createMigrationClient>,
  invitationId: string,
  deliveryId: string
): Promise<string> {
  const [delivery] = await admin
    .select()
    .from(invitationDeliveryOutbox)
    .where(eq(invitationDeliveryOutbox.id, deliveryId))
    .limit(1)
  assert.ok(delivery)
  assert.ok(delivery.encryptionKeyId)
  assert.ok(delivery.tokenCiphertext)
  assert.ok(delivery.tokenIv)
  assert.ok(delivery.tokenAuthTag)
  const environment = getInvitationDeliveryEnv()
  return openInvitationToken(
    {
      encryptionKeyId: delivery.encryptionKeyId,
      tokenCiphertext: delivery.tokenCiphertext,
      tokenIv: delivery.tokenIv,
      tokenAuthTag: delivery.tokenAuthTag,
    },
    { tenantId: TENANT_A, invitationId, deliveryId },
    {
      activeKeyId: environment.INVITATION_TOKEN_ENCRYPTION_KEY_ID,
      keys: environment.INVITATION_TOKEN_ENCRYPTION_KEYS,
    }
  )
}

await runProof()
