import assert from 'node:assert/strict'
import {
  TenantRequestContextError,
  type VerifiedAccountIdentity,
  resolveTenantRequestContext,
} from '@openschool/auth/server'
import { getMigrationEnv } from '@openschool/config/server'
import {
  type TenantDatabaseContext,
  accountLinks,
  accountSessions,
  accounts,
  affiliations,
  auditEvents,
  auditOutbox,
  closeDatabaseExecutionPoolsForProof,
  contactProfiles,
  createMigrationClient,
  personRelationships,
  roleTemplateAssignments,
  withPolicyTenantTransaction,
} from '@openschool/db'
import {
  type AllowedPolicyDecision,
  CAPABILITIES,
  CURRENT_POLICY_BUNDLE,
  type PolicyContext,
  evaluatePolicy,
} from '@openschool/rbac'
import { TRPCError } from '@trpc/server'
import { and, eq, inArray } from 'drizzle-orm'
import { toDatabasePolicyContext } from '../services/database-context'
import {
  createGuardianContact,
  endGuardianContact,
  findGuardianContactCandidates,
  getGuardianContacts,
  updateGuardianContact,
} from '../services/guardian-contacts'

const TENANT_A = '00000000-0000-4000-8000-000000000001'
const ORGANIZATION_ROOT = '00000000-0000-4000-8000-000000000001'
const SCHOOL_PRIMARY = '00000000-0000-4000-8000-000000000101'
const LEARNER_PRIMARY = '00000000-0000-4000-8000-000000000911'
const LEARNER_HIGH = '00000000-0000-4000-8000-000000000912'
const SIBLING_SCHOOL_CONTACT = '00000000-0000-4000-8000-000000000906'
const CROSS_TENANT_PERSON = '00000000-0000-4000-8000-000000000913'
const ORG_ADMIN_ACCOUNT = '00000000-0000-4000-8000-000000000201'
const ORG_ADMIN_PERSON = '00000000-0000-4000-8000-000000000901'
const SCHOOL_ADMIN_ACCOUNT = '00000000-0000-4000-8000-000000000202'
const SCHOOL_ADMIN_PERSON = '00000000-0000-4000-8000-000000000902'
const RUN_ID = crypto.randomUUID()
const ORG_ADMIN_SESSION = `guardian-contact-org-${RUN_ID}`
const SCHOOL_ADMIN_SESSION = `guardian-contact-school-${RUN_ID}`
const CONTACT_EMAIL = `guardian-contact-${RUN_ID}@proof.test`

function assertLocalDisposableDatabase(): void {
  if (process.env.ALLOW_GUARDIAN_CONTACTS_POC !== 'true') {
    throw new Error('Guardian contact proof refused: explicit opt-in is required.')
  }
  const hostname = new URL(getMigrationEnv().DATABASE_MIGRATION_URL).hostname
  if (!new Set(['127.0.0.1', 'localhost', '[::1]']).has(hostname)) {
    throw new Error('Guardian contact proof refused: database host must be loopback.')
  }
}

function orgPolicyContext(): PolicyContext {
  return Object.freeze({
    accountId: ORG_ADMIN_ACCOUNT,
    personId: ORG_ADMIN_PERSON,
    tenantId: TENANT_A,
    roleTemplateKeys: ['org_admin'],
    assuranceLevel: 'aal2',
    activeEducationOrganizationId: ORGANIZATION_ROOT,
  })
}

function schoolPolicyContext(): PolicyContext {
  return Object.freeze({
    accountId: SCHOOL_ADMIN_ACCOUNT,
    personId: SCHOOL_ADMIN_PERSON,
    tenantId: TENANT_A,
    roleTemplateKeys: ['school_admin'],
    assuranceLevel: 'aal2',
    activeSchoolId: SCHOOL_PRIMARY,
  })
}

function databaseContext(label: string, actor: 'org' | 'school' = 'org'): TenantDatabaseContext {
  const organizationActor = actor === 'org'
  return Object.freeze({
    accountId: organizationActor ? ORG_ADMIN_ACCOUNT : SCHOOL_ADMIN_ACCOUNT,
    personId: organizationActor ? ORG_ADMIN_PERSON : SCHOOL_ADMIN_PERSON,
    tenantId: TENANT_A,
    sessionId: organizationActor ? ORG_ADMIN_SESSION : SCHOOL_ADMIN_SESSION,
    requestId: `guardian-contact:${RUN_ID}:${label}`,
    assuranceLevel: 'aal2',
    membershipVersion: 1,
    securityVersion: 1,
    contextPolicyVersion: 1,
    ...(organizationActor
      ? { activeEducationOrganizationId: ORGANIZATION_ROOT }
      : { activeSchoolId: SCHOOL_PRIMARY }),
  })
}

function allow(
  context: PolicyContext,
  capability:
    | typeof CAPABILITIES.GUARDIAN_CONTACTS_READ
    | typeof CAPABILITIES.GUARDIAN_CONTACTS_MANAGE,
  schoolId: string,
  requestedScope: 'organization_subtree' | 'school'
): AllowedPolicyDecision {
  const decision = evaluatePolicy({
    bundle: CURRENT_POLICY_BUNDLE,
    context,
    capability,
    requestedScope,
    resource: {
      kind: 'guardian_contact',
      tenantId: TENANT_A,
      schoolId,
      organizationAncestorIds: [ORGANIZATION_ROOT],
    },
  })
  assert.equal(decision.effect, 'allow', `${capability} must be allowed in the proof`)
  if (decision.effect !== 'allow') throw new Error('GUARDIAN_CONTACT_POLICY_DENIED')
  return decision
}

function identity(accountId: string, sessionId: string): VerifiedAccountIdentity {
  const now = Date.now()
  return Object.freeze({
    provider: 'supabase',
    subject: accountId,
    sessionId,
    email: `${accountId}@guardian-contact-proof.test`,
    assuranceLevel: 'aal1',
    issuedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 60 * 60_000).toISOString(),
  })
}

function sqlState(error: unknown): string | undefined {
  let current = error
  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== 'object') return undefined
    const candidate = current as { cause?: unknown; code?: unknown }
    if (typeof candidate.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return candidate.code
    }
    current = candidate.cause
  }
  return undefined
}

async function expectSqlState(operation: Promise<unknown>, expected: string): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.equal(sqlState(error), expected)
    return true
  })
}

async function failureFingerprint(operation: Promise<unknown>): Promise<string> {
  try {
    await operation
  } catch (error) {
    if (error instanceof TRPCError) return `${error.code}:${error.message}`
    throw error
  }
  assert.fail('Expected operation to fail')
}

async function expectNoGuardianContext(accountId: string, label: string): Promise<void> {
  await assert.rejects(
    resolveTenantRequestContext(
      identity(accountId, `guardian-contact-target-${label}-${RUN_ID}`),
      { tenantId: TENANT_A, schoolId: SCHOOL_PRIMARY },
      { requestId: `guardian-contact-context-${label}-${RUN_ID}` }
    ),
    (error: unknown) => error instanceof TenantRequestContextError
  )
}

async function runProof(): Promise<void> {
  assertLocalDisposableDatabase()
  const admin = createMigrationClient()
  const orgContext = orgPolicyContext()
  const schoolContext = schoolPolicyContext()
  const orgManage = allow(
    orgContext,
    CAPABILITIES.GUARDIAN_CONTACTS_MANAGE,
    SCHOOL_PRIMARY,
    'organization_subtree'
  )
  const orgRead = allow(
    orgContext,
    CAPABILITIES.GUARDIAN_CONTACTS_READ,
    SCHOOL_PRIMARY,
    'organization_subtree'
  )
  const schoolManage = allow(
    schoolContext,
    CAPABILITIES.GUARDIAN_CONTACTS_MANAGE,
    SCHOOL_PRIMARY,
    'school'
  )
  const now = new Date()
  const contactAccountId = crypto.randomUUID()
  const contactAccountLinkId = crypto.randomUUID()
  const contactAffiliationId = crypto.randomUUID()
  const contactRoleId = crypto.randomUUID()
  let failure: unknown

  try {
    await admin.insert(accountSessions).values([
      {
        accountId: ORG_ADMIN_ACCOUNT,
        providerSessionId: ORG_ADMIN_SESSION,
        status: 'active',
        assuranceLevel: 'aal2',
        securityVersion: 1,
        authenticatedAt: now,
        expiresAt: new Date(now.getTime() + 60 * 60_000),
      },
      {
        accountId: SCHOOL_ADMIN_ACCOUNT,
        providerSessionId: SCHOOL_ADMIN_SESSION,
        status: 'active',
        assuranceLevel: 'aal2',
        securityVersion: 1,
        authenticatedAt: now,
        expiresAt: new Date(now.getTime() + 60 * 60_000),
      },
    ])

    const primaryResult = await createGuardianContact(
      databaseContext('create-primary'),
      orgContext,
      orgManage,
      {
        learnerId: LEARNER_PRIMARY,
        contact: {
          kind: 'new',
          firstName: 'Morgan',
          lastName: `Guardian ${RUN_ID.slice(0, 8)}`,
          email: CONTACT_EMAIL,
          phone: '+1 721 555 0101',
          preferredContactMethod: 'sms',
        },
        relationshipType: 'parent_of',
        legalAuthority: true,
        decisionAuthority: 'shared',
        emergencyPriority: 2,
        pickupAuthority: true,
        portalEligible: false,
        issuanceReason: 'Guardian contact isolation proof',
      }
    )
    let primaryContacts = primaryResult.contacts
    const primary = primaryContacts.find(({ email }) => email === CONTACT_EMAIL)
    assert.ok(primary)
    assert.equal(primary.accountLinked, false)
    assert.equal(primary.invitationEligible, false)
    assert.equal(primary.legalAuthority, true)
    assert.equal(primary.decisionAuthority, 'shared')
    assert.equal(primary.emergencyPriority, 2)
    assert.equal(primary.pickupAuthority, true)
    assert.equal(primary.portalEligible, false)
    const linksBeforeInvitation = await admin
      .select({ id: accountLinks.id })
      .from(accountLinks)
      .where(
        and(eq(accountLinks.tenantId, TENANT_A), eq(accountLinks.personId, primary.contactPersonId))
      )
    assert.equal(linksBeforeInvitation.length, 0)

    const unrelatedRelationshipId = crypto.randomUUID()
    await admin.insert(personRelationships).values({
      id: unrelatedRelationshipId,
      tenantId: TENANT_A,
      subjectPersonId: primary.contactPersonId,
      relatedPersonId: LEARNER_HIGH,
      type: 'other',
      status: 'active',
      validFrom: now,
      issuedByAccountId: ORG_ADMIN_ACCOUNT,
      issuanceReason: 'Non-guardian relationship mutation denial fixture',
    })
    const unrelatedContacts = await getGuardianContacts(
      databaseContext('read-unrelated-type'),
      orgContext,
      orgRead,
      LEARNER_HIGH
    )
    assert.equal(
      unrelatedContacts.some(({ relationshipId }) => relationshipId === unrelatedRelationshipId),
      false
    )
    assert.equal(
      await failureFingerprint(
        updateGuardianContact(databaseContext('update-unrelated-type'), orgContext, orgManage, {
          relationshipId: unrelatedRelationshipId,
          expectedVersion: 1,
          legalAuthority: true,
          decisionAuthority: 'sole',
          pickupAuthority: true,
          portalEligible: false,
        })
      ),
      'NOT_FOUND:Contact not found'
    )
    assert.equal(
      await failureFingerprint(
        endGuardianContact(
          databaseContext('end-unrelated-type'),
          orgContext,
          orgManage,
          unrelatedRelationshipId,
          1,
          'Non-guardian relationships cannot be ended through guardian contacts'
        )
      ),
      'NOT_FOUND:Contact not found'
    )

    const candidates = await findGuardianContactCandidates(
      databaseContext('candidate-org'),
      orgContext,
      orgManage,
      LEARNER_HIGH,
      CONTACT_EMAIL
    )
    assert.ok(candidates.some(({ id }) => id === primary.contactPersonId))

    const duplicateResult = await createGuardianContact(
      databaseContext('create-duplicate'),
      orgContext,
      orgManage,
      {
        learnerId: LEARNER_PRIMARY,
        contact: {
          kind: 'new',
          firstName: 'Morgan',
          lastName: `Guardian ${RUN_ID.slice(0, 8)}`,
          email: CONTACT_EMAIL,
          preferredContactMethod: 'email',
        },
        relationshipType: 'guardian_of',
        legalAuthority: false,
        decisionAuthority: 'limited',
        emergencyPriority: 3,
        pickupAuthority: false,
        portalEligible: false,
        issuanceReason: 'Explicit duplicate Person proof',
      }
    )
    assert.equal(duplicateResult.possibleDuplicateCount, 1)
    const duplicate = duplicateResult.contacts.find(
      ({ email, contactPersonId }) =>
        email === CONTACT_EMAIL && contactPersonId !== primary.contactPersonId
    )
    assert.ok(duplicate)
    assert.notEqual(duplicate.contactPersonId, primary.contactPersonId)

    const reuseAttempts = await Promise.allSettled([
      createGuardianContact(databaseContext('reuse-primary-a'), orgContext, orgManage, {
        learnerId: LEARNER_HIGH,
        contact: { kind: 'existing', personId: primary.contactPersonId },
        relationshipType: 'guardian_of',
        legalAuthority: false,
        decisionAuthority: 'none',
        pickupAuthority: false,
        portalEligible: false,
        issuanceReason: 'Concurrent same-Tenant contact reuse proof A',
      }),
      createGuardianContact(databaseContext('reuse-primary-b'), orgContext, orgManage, {
        learnerId: LEARNER_HIGH,
        contact: { kind: 'existing', personId: primary.contactPersonId },
        relationshipType: 'guardian_of',
        legalAuthority: false,
        decisionAuthority: 'none',
        pickupAuthority: false,
        portalEligible: false,
        issuanceReason: 'Concurrent same-Tenant contact reuse proof B',
      }),
    ])
    const successfulReuse = reuseAttempts.filter(
      (
        attempt
      ): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof createGuardianContact>>> =>
        attempt.status === 'fulfilled'
    )
    const rejectedReuse = reuseAttempts.filter(
      (attempt): attempt is PromiseRejectedResult => attempt.status === 'rejected'
    )
    assert.equal(successfulReuse.length, 1)
    assert.equal(rejectedReuse.length, 1)
    assert.ok(rejectedReuse[0]?.reason instanceof TRPCError)
    assert.equal(rejectedReuse[0]?.reason.code, 'CONFLICT')
    const reusedContacts = successfulReuse[0]?.value.contacts ?? []
    assert.ok(
      reusedContacts.some(({ contactPersonId }) => contactPersonId === primary.contactPersonId)
    )

    const schoolCandidates = await findGuardianContactCandidates(
      databaseContext('candidate-school', 'school'),
      schoolContext,
      schoolManage,
      LEARNER_PRIMARY,
      'Riley Brown'
    )
    assert.equal(
      schoolCandidates.some(({ id }) => id === SIBLING_SCHOOL_CONTACT),
      false
    )

    const siblingFailure = await failureFingerprint(
      createGuardianContact(
        databaseContext('sibling-person', 'school'),
        schoolContext,
        schoolManage,
        {
          learnerId: LEARNER_PRIMARY,
          contact: { kind: 'existing', personId: SIBLING_SCHOOL_CONTACT },
          relationshipType: 'parent_of',
          legalAuthority: false,
          decisionAuthority: 'none',
          pickupAuthority: false,
          portalEligible: false,
          issuanceReason: 'Sibling-scope denial proof',
        }
      )
    )
    const crossTenantFailure = await failureFingerprint(
      createGuardianContact(
        databaseContext('cross-tenant-person', 'school'),
        schoolContext,
        schoolManage,
        {
          learnerId: LEARNER_PRIMARY,
          contact: { kind: 'existing', personId: CROSS_TENANT_PERSON },
          relationshipType: 'parent_of',
          legalAuthority: false,
          decisionAuthority: 'none',
          pickupAuthority: false,
          portalEligible: false,
          issuanceReason: 'Cross-Tenant denial proof',
        }
      )
    )
    assert.equal(siblingFailure, crossTenantFailure)
    assert.equal(siblingFailure, 'NOT_FOUND:Contact not found')

    primaryContacts = (
      await createGuardianContact(databaseContext('create-emergency'), orgContext, orgManage, {
        learnerId: LEARNER_PRIMARY,
        contact: {
          kind: 'new',
          firstName: 'Emergency',
          lastName: `Contact ${RUN_ID.slice(0, 8)}`,
          phone: '+1 721 555 0102',
          preferredContactMethod: 'phone',
        },
        relationshipType: 'emergency_contact_of',
        legalAuthority: false,
        decisionAuthority: 'none',
        emergencyPriority: 1,
        pickupAuthority: true,
        portalEligible: false,
        issuanceReason: 'Independent emergency contact facts proof',
      })
    ).contacts
    const emergency = primaryContacts.find(
      ({ relationshipType }) => relationshipType === 'emergency_contact_of'
    )
    assert.ok(emergency)
    assert.equal(emergency.portalEligible, false)
    assert.equal(emergency.legalAuthority, false)
    assert.equal(emergency.decisionAuthority, 'none')
    assert.equal(emergency.emergencyPriority, 1)
    assert.equal(emergency.pickupAuthority, true)

    await admin.insert(accounts).values({
      id: contactAccountId,
      identityProvider: 'supabase',
      providerSubject: contactAccountId,
      primaryEmail: CONTACT_EMAIL,
    })
    await admin.insert(accountLinks).values({
      id: contactAccountLinkId,
      tenantId: TENANT_A,
      accountId: contactAccountId,
      personId: primary.contactPersonId,
      status: 'active',
      validFrom: now,
      issuanceReason: 'Separate guardian invitation proof fixture',
      activatedAt: now,
    })
    await admin.insert(affiliations).values({
      id: contactAffiliationId,
      tenantId: TENANT_A,
      personId: primary.contactPersonId,
      kind: 'guardian',
      scopeType: 'tenant',
      validFrom: now,
      issuanceReason: 'Separate guardian invitation proof fixture',
    })
    await admin.insert(roleTemplateAssignments).values({
      id: contactRoleId,
      tenantId: TENANT_A,
      affiliationId: contactAffiliationId,
      roleTemplateKey: 'parent',
      validFrom: now,
      issuanceReason: 'Separate guardian invitation proof fixture',
    })
    await expectNoGuardianContext(contactAccountId, 'portal-disabled')

    const [accountBeforeEnable] = await admin
      .select({ membershipVersion: accounts.membershipVersion })
      .from(accounts)
      .where(eq(accounts.id, contactAccountId))
    assert.ok(accountBeforeEnable)
    primaryContacts = await updateGuardianContact(
      databaseContext('enable-portal'),
      orgContext,
      orgManage,
      {
        relationshipId: primary.relationshipId,
        expectedVersion: primary.version,
        legalAuthority: true,
        decisionAuthority: 'sole',
        emergencyPriority: 1,
        pickupAuthority: true,
        portalEligible: true,
      }
    )
    const enabled = primaryContacts.find(
      ({ relationshipId }) => relationshipId === primary.relationshipId
    )
    assert.ok(enabled)
    assert.equal(enabled.version, primary.version + 1)
    assert.equal(enabled.decisionAuthority, 'sole')
    assert.equal(enabled.portalEligible, true)
    const [accountAfterEnable] = await admin
      .select({ membershipVersion: accounts.membershipVersion })
      .from(accounts)
      .where(eq(accounts.id, contactAccountId))
    assert.equal(accountAfterEnable?.membershipVersion, accountBeforeEnable.membershipVersion + 1)

    const guardianContext = await resolveTenantRequestContext(
      identity(contactAccountId, `guardian-contact-target-enabled-${RUN_ID}`),
      { tenantId: TENANT_A, schoolId: SCHOOL_PRIMARY },
      { requestId: `guardian-contact-context-enabled-${RUN_ID}` }
    )
    assert.equal(guardianContext.activeSchoolId, SCHOOL_PRIMARY)
    assert.deepEqual(guardianContext.roleTemplateKeys, ['parent'])

    primaryContacts = await endGuardianContact(
      databaseContext('end-primary'),
      orgContext,
      orgManage,
      enabled.relationshipId,
      enabled.version,
      'Guardian authority ended during isolation proof'
    )
    const ended = primaryContacts.find(
      ({ relationshipId }) => relationshipId === primary.relationshipId
    )
    assert.ok(ended)
    assert.equal(ended.status, 'revoked')
    assert.equal(ended.isCurrent, false)
    const [accountAfterEnd] = await admin
      .select({ membershipVersion: accounts.membershipVersion })
      .from(accounts)
      .where(eq(accounts.id, contactAccountId))
    assert.equal(accountAfterEnd?.membershipVersion, accountBeforeEnable.membershipVersion + 2)
    await expectNoGuardianContext(contactAccountId, 'relationship-ended')

    await expectSqlState(
      withPolicyTenantTransaction(
        databaseContext('direct-insert'),
        toDatabasePolicyContext(orgManage),
        (transaction) =>
          transaction.insert(personRelationships).values({
            tenantId: TENANT_A,
            subjectPersonId: emergency.contactPersonId,
            relatedPersonId: LEARNER_PRIMARY,
            type: 'parent_of',
            validFrom: now,
            issuanceReason: 'Direct runtime mutation denial proof',
          })
      ),
      '42501'
    )
    await expectSqlState(
      withPolicyTenantTransaction(
        databaseContext('direct-update'),
        toDatabasePolicyContext(orgManage),
        (transaction) =>
          transaction
            .update(contactProfiles)
            .set({ preferredContactMethod: 'none' })
            .where(
              and(
                eq(contactProfiles.tenantId, TENANT_A),
                eq(contactProfiles.personId, emergency.contactPersonId)
              )
            )
            .returning({ preferredContactMethod: contactProfiles.preferredContactMethod })
      ),
      '42501'
    )

    const readContacts = await getGuardianContacts(
      databaseContext('read-history'),
      orgContext,
      orgRead,
      LEARNER_PRIMARY
    )
    assert.ok(readContacts.some(({ relationshipId }) => relationshipId === ended.relationshipId))
    assert.equal(
      readContacts.find(({ relationshipId }) => relationshipId === emergency.relationshipId)
        ?.preferredContactMethod,
      'phone'
    )

    const relationshipIds = [
      ...new Set(
        [...primaryContacts, ...duplicateResult.contacts, ...reusedContacts].map(
          ({ relationshipId }) => relationshipId
        )
      ),
    ]
    const committedAudits = await admin
      .select({
        id: auditEvents.id,
        eventType: auditEvents.eventType,
        changeSummary: auditEvents.changeSummary,
      })
      .from(auditEvents)
      .where(inArray(auditEvents.targetId, relationshipIds))
    assert.ok(committedAudits.some(({ eventType }) => eventType === 'guardian.contact.create'))
    assert.ok(committedAudits.some(({ eventType }) => eventType === 'guardian.contact.update'))
    assert.ok(committedAudits.some(({ eventType }) => eventType === 'guardian.contact.end'))
    const committedOutbox = await admin
      .select({ id: auditOutbox.id })
      .from(auditOutbox)
      .where(
        inArray(
          auditOutbox.auditEventId,
          committedAudits.map(({ id }) => id)
        )
      )
    assert.equal(committedOutbox.length, committedAudits.length)
    const serializedChanges = JSON.stringify(
      committedAudits.map(({ changeSummary }) => changeSummary)
    ).toLocaleLowerCase('en')
    assert.equal(serializedChanges.includes(CONTACT_EMAIL.toLocaleLowerCase('en')), false)
    assert.equal(serializedChanges.includes('5550101'), false)

    console.log(
      'Guardian contact proof passed: Account-optional People, explicit operational and authorization facts, concurrent duplicate rejection, non-guardian relationship exclusion, same-Tenant reuse, sibling/cross-Tenant indistinguishable denial, forced-RLS mutation denial, current portal-only guardian context, membership invalidation, history, and atomic redacted audit/outbox evidence.'
    )
  } catch (error) {
    failure = error
  } finally {
    const cleanup = await Promise.allSettled([
      admin
        .delete(accountSessions)
        .where(
          inArray(accountSessions.providerSessionId, [ORG_ADMIN_SESSION, SCHOOL_ADMIN_SESSION])
        ),
    ])
    const poolClose = await Promise.allSettled([
      closeDatabaseExecutionPoolsForProof(),
      admin.$client.end({ timeout: 5 }),
    ])
    const cleanupFailure = cleanup.find((result) => result.status === 'rejected')
    const poolCloseFailure = poolClose.find((result) => result.status === 'rejected')
    if (!failure && cleanupFailure?.status === 'rejected') failure = cleanupFailure.reason
    if (!failure && poolCloseFailure?.status === 'rejected') failure = poolCloseFailure.reason
  }
  if (failure) throw failure
}

await runProof()
