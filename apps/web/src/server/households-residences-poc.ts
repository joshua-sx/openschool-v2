import assert from 'node:assert/strict'
import { getMigrationEnv } from '@openschool/config/server'
import {
  type TenantDatabaseContext,
  accountSessions,
  auditEvents,
  auditOutbox,
  closeDatabaseExecutionPoolsForProof,
  createMigrationClient,
  households,
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
  addHouseholdAddress,
  addHouseholdMember,
  createHousehold,
  endHouseholdMember,
  findHouseholdMemberCandidates,
  getLearnerHouseholds,
  reviseHouseholdAddress,
  reviseHouseholdMember,
} from '../services/households'

const TENANT_A = '00000000-0000-4000-8000-000000000001'
const ORGANIZATION_ROOT = '00000000-0000-4000-8000-000000000001'
const SCHOOL_PRIMARY = '00000000-0000-4000-8000-000000000101'
const LEARNER_PRIMARY = '00000000-0000-4000-8000-000000000911'
const LEARNER_HIGH = '00000000-0000-4000-8000-000000000912'
const CROSS_TENANT_PERSON = '00000000-0000-4000-8000-000000000913'
const ORG_ADMIN_ACCOUNT = '00000000-0000-4000-8000-000000000201'
const ORG_ADMIN_PERSON = '00000000-0000-4000-8000-000000000901'
const SCHOOL_ADMIN_ACCOUNT = '00000000-0000-4000-8000-000000000202'
const SCHOOL_ADMIN_PERSON = '00000000-0000-4000-8000-000000000902'
const RUN_ID = crypto.randomUUID()
const ORG_SESSION = `household-org-${RUN_ID}`
const SCHOOL_SESSION = `household-school-${RUN_ID}`

function assertLocalDisposableDatabase(): void {
  if (process.env.ALLOW_HOUSEHOLDS_RESIDENCES_POC !== 'true') {
    throw new Error('Household proof refused: explicit opt-in is required.')
  }
  const hostname = new URL(getMigrationEnv().DATABASE_MIGRATION_URL).hostname
  if (!new Set(['127.0.0.1', 'localhost', '[::1]']).has(hostname)) {
    throw new Error('Household proof refused: database host must be loopback.')
  }
}

function policyContext(actor: 'org' | 'school'): PolicyContext {
  return Object.freeze({
    accountId: actor === 'org' ? ORG_ADMIN_ACCOUNT : SCHOOL_ADMIN_ACCOUNT,
    personId: actor === 'org' ? ORG_ADMIN_PERSON : SCHOOL_ADMIN_PERSON,
    tenantId: TENANT_A,
    roleTemplateKeys: [actor === 'org' ? 'org_admin' : 'school_admin'],
    assuranceLevel: 'aal2',
    ...(actor === 'org'
      ? { activeEducationOrganizationId: ORGANIZATION_ROOT }
      : { activeSchoolId: SCHOOL_PRIMARY }),
  })
}

function databaseContext(label: string, actor: 'org' | 'school' = 'org'): TenantDatabaseContext {
  return Object.freeze({
    accountId: actor === 'org' ? ORG_ADMIN_ACCOUNT : SCHOOL_ADMIN_ACCOUNT,
    personId: actor === 'org' ? ORG_ADMIN_PERSON : SCHOOL_ADMIN_PERSON,
    tenantId: TENANT_A,
    sessionId: actor === 'org' ? ORG_SESSION : SCHOOL_SESSION,
    requestId: `household:${RUN_ID}:${label}`,
    assuranceLevel: 'aal2',
    membershipVersion: 1,
    securityVersion: 1,
    contextPolicyVersion: 1,
    ...(actor === 'org'
      ? { activeEducationOrganizationId: ORGANIZATION_ROOT }
      : { activeSchoolId: SCHOOL_PRIMARY }),
  })
}

function allow(
  context: PolicyContext,
  capability: typeof CAPABILITIES.HOUSEHOLDS_READ | typeof CAPABILITIES.HOUSEHOLDS_MANAGE,
  scope: 'organization_subtree' | 'school'
): AllowedPolicyDecision {
  const decision = evaluatePolicy({
    bundle: CURRENT_POLICY_BUNDLE,
    context,
    capability,
    requestedScope: scope,
    resource: {
      kind: 'household',
      tenantId: TENANT_A,
      schoolId: SCHOOL_PRIMARY,
      organizationAncestorIds: [ORGANIZATION_ROOT],
    },
  })
  assert.equal(decision.effect, 'allow')
  if (decision.effect !== 'allow') throw new Error('HOUSEHOLD_POLICY_DENIED')
  return decision
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

function tomorrow(after: Date): Date {
  return new Date(after.getTime() + 24 * 60 * 60_000)
}

const baseAddress = {
  addressType: 'residential' as const,
  label: 'Home',
  line1: '10 Proof Lane',
  locality: 'Philipsburg',
  administrativeArea: 'Sint Maarten',
  postalCode: null,
  countryCode: 'SX',
  deliveryInstructions: 'Use the front entrance',
}

async function runProof(): Promise<void> {
  assertLocalDisposableDatabase()
  const admin = createMigrationClient()
  const orgContext = policyContext('org')
  const schoolContext = policyContext('school')
  const orgManage = allow(orgContext, CAPABILITIES.HOUSEHOLDS_MANAGE, 'organization_subtree')
  const orgRead = allow(orgContext, CAPABILITIES.HOUSEHOLDS_READ, 'organization_subtree')
  const schoolManage = allow(schoolContext, CAPABILITIES.HOUSEHOLDS_MANAGE, 'school')
  const schoolRead = allow(schoolContext, CAPABILITIES.HOUSEHOLDS_READ, 'school')
  const startedAt = new Date()
  const effective = new Date(startedAt.getTime() - 24 * 60 * 60_000)
  let failure: unknown
  let householdId: string | undefined

  try {
    await admin.insert(accountSessions).values([
      {
        accountId: ORG_ADMIN_ACCOUNT,
        providerSessionId: ORG_SESSION,
        status: 'active',
        assuranceLevel: 'aal2',
        securityVersion: 1,
        authenticatedAt: startedAt,
        expiresAt: new Date(startedAt.getTime() + 60 * 60_000),
      },
      {
        accountId: SCHOOL_ADMIN_ACCOUNT,
        providerSessionId: SCHOOL_SESSION,
        status: 'active',
        assuranceLevel: 'aal2',
        securityVersion: 1,
        authenticatedAt: startedAt,
        expiresAt: new Date(startedAt.getTime() + 60 * 60_000),
      },
    ])

    let records = await createHousehold(databaseContext('create'), orgContext, orgManage, {
      learnerId: LEARNER_PRIMARY,
      displayName: `Morgan proof ${RUN_ID.slice(0, 8)}`,
      address: baseAddress,
      isPrimaryResidence: true,
      isPrimaryMailing: true,
      effectiveAt: effective,
      reason: 'Household and residence isolation proof',
    })
    assert.equal(records.length, 1)
    householdId = records[0]?.householdId
    assert.ok(householdId)
    assert.equal(records[0]?.membership.isPrimaryResidence, true)
    assert.equal(records[0]?.membership.isPrimaryMailing, true)
    assert.equal(records[0]?.addresses[0]?.line1, baseAddress.line1)

    const currentHouseholdId = householdId
    const schoolReadRows = await getLearnerHouseholds(
      databaseContext('school-read', 'school'),
      schoolContext,
      schoolRead,
      LEARNER_PRIMARY
    )
    assert.equal(schoolReadRows[0]?.householdId, currentHouseholdId)

    const orgCandidates = await findHouseholdMemberCandidates(
      databaseContext('org-candidates'),
      orgContext,
      orgManage,
      LEARNER_PRIMARY,
      'Noah'
    )
    assert.ok(orgCandidates.some(({ personId }) => personId === LEARNER_HIGH))
    const schoolCandidates = await findHouseholdMemberCandidates(
      databaseContext('school-candidates', 'school'),
      schoolContext,
      schoolManage,
      LEARNER_PRIMARY,
      'Noah'
    )
    assert.equal(
      schoolCandidates.some(({ personId }) => personId === LEARNER_HIGH),
      false
    )

    const schoolSiblingDenial = await failureFingerprint(
      addHouseholdMember(
        databaseContext('school-sibling-denial', 'school'),
        schoolContext,
        schoolManage,
        {
          learnerId: LEARNER_PRIMARY,
          householdId: currentHouseholdId,
          personId: LEARNER_HIGH,
          membershipKind: 'resident',
          isPrimaryResidence: false,
          isPrimaryMailing: false,
          effectiveAt: effective,
          reason: 'Sibling school denial proof',
        }
      )
    )
    const crossTenantDenial = await failureFingerprint(
      addHouseholdMember(databaseContext('cross-tenant-denial'), orgContext, orgManage, {
        learnerId: LEARNER_PRIMARY,
        householdId: currentHouseholdId,
        personId: CROSS_TENANT_PERSON,
        membershipKind: 'resident',
        isPrimaryResidence: false,
        isPrimaryMailing: false,
        effectiveAt: effective,
        reason: 'Cross tenant denial proof',
      })
    )
    assert.equal(schoolSiblingDenial, crossTenantDenial)

    records = await addHouseholdMember(databaseContext('link-sibling'), orgContext, orgManage, {
      learnerId: LEARNER_PRIMARY,
      householdId: currentHouseholdId,
      personId: LEARNER_HIGH,
      membershipKind: 'resident',
      isPrimaryResidence: false,
      isPrimaryMailing: false,
      effectiveAt: effective,
      reason: 'Authorized sibling household proof',
    })
    assert.ok(records[0]?.currentMembers.some(({ personId }) => personId === LEARNER_HIGH))
    const siblingRows = await getLearnerHouseholds(
      databaseContext('sibling-read'),
      orgContext,
      orgRead,
      LEARNER_HIGH
    )
    assert.equal(siblingRows[0]?.householdId, currentHouseholdId)

    assert.equal(
      await failureFingerprint(
        createHousehold(databaseContext('overlap'), orgContext, orgManage, {
          learnerId: LEARNER_PRIMARY,
          displayName: `Overlapping proof ${RUN_ID.slice(0, 8)}`,
          address: { ...baseAddress, line1: '12 Conflict Lane' },
          isPrimaryResidence: true,
          isPrimaryMailing: false,
          effectiveAt: effective,
          reason: 'Overlapping primary residence denial proof',
        })
      ),
      'CONFLICT:These household dates or primary preferences overlap existing records'
    )

    const learnerMembership = records[0]?.membership
    assert.ok(learnerMembership)
    const revisedAt = tomorrow(effective)
    records = await reviseHouseholdMember(databaseContext('preferences'), orgContext, orgManage, {
      learnerId: LEARNER_PRIMARY,
      membershipId: learnerMembership.id,
      expectedVersion: learnerMembership.version,
      membershipKind: 'resident',
      isPrimaryResidence: true,
      isPrimaryMailing: false,
      effectiveAt: revisedAt,
      reason: 'Separate mailing preference proof',
    })
    assert.equal(records[0]?.membership.version, learnerMembership.version + 1)
    assert.equal(records[0]?.membership.isPrimaryMailing, false)
    assert.equal(
      await failureFingerprint(
        reviseHouseholdMember(databaseContext('stale'), orgContext, orgManage, {
          learnerId: LEARNER_PRIMARY,
          membershipId: learnerMembership.id,
          expectedVersion: learnerMembership.version,
          membershipKind: 'resident',
          isPrimaryResidence: true,
          isPrimaryMailing: true,
          effectiveAt: tomorrow(revisedAt),
          reason: 'Stale version denial proof',
        })
      ),
      'NOT_FOUND:Household not found'
    )

    records = await addHouseholdAddress(databaseContext('add-address'), orgContext, orgManage, {
      learnerId: LEARNER_PRIMARY,
      householdId: currentHouseholdId,
      ...baseAddress,
      addressType: 'mailing',
      label: 'Mailing',
      line1: '20 Post Office Road',
      isPrimary: false,
      effectiveAt: revisedAt,
      reason: 'Alternative mailing address proof',
    })
    const mailing = records[0]?.addresses.find(({ label }) => label === 'Mailing')
    assert.ok(mailing)
    records = await reviseHouseholdAddress(
      databaseContext('revise-address'),
      orgContext,
      orgManage,
      {
        learnerId: LEARNER_PRIMARY,
        addressId: mailing.id,
        expectedVersion: mailing.version,
        ...baseAddress,
        addressType: 'mailing',
        label: 'Updated mailing',
        line1: '22 Post Office Road',
        isPrimary: false,
        effectiveAt: tomorrow(revisedAt),
        reason: 'Versioned address correction proof',
      }
    )
    assert.ok(
      records[0]?.addresses.some(
        ({ version, line1 }) => version === 2 && line1 === '22 Post Office Road'
      )
    )
    assert.ok(
      records[0]?.addresses.some(
        ({ status, line1 }) => status === 'ended' && line1 === '20 Post Office Road'
      )
    )

    await assert.rejects(
      withPolicyTenantTransaction(
        databaseContext('direct-write'),
        toDatabasePolicyContext(orgManage),
        (db) =>
          db.insert(households).values({
            tenantId: TENANT_A,
            displayName: 'Forbidden direct write',
            normalizedDisplayName: 'forbidden direct write',
            createdByAccountId: ORG_ADMIN_ACCOUNT,
            creationReason: 'Direct write denial proof',
          })
      ),
      (error: unknown) => {
        let current = error
        for (let depth = 0; depth < 8; depth += 1) {
          if (!current || typeof current !== 'object') break
          const candidate = current as { cause?: unknown; code?: unknown }
          if (candidate.code === '42501') return true
          current = candidate.cause
        }
        return false
      }
    )

    const highMembership = records[0]?.currentMembers.find(
      ({ personId }) => personId === LEARNER_HIGH
    )
    assert.ok(highMembership)
    await endHouseholdMember(databaseContext('end-sibling'), orgContext, orgManage, {
      learnerId: LEARNER_PRIMARY,
      membershipId: highMembership.membershipId,
      expectedVersion: highMembership.version,
      effectiveAt: tomorrow(tomorrow(revisedAt)),
      reason: 'Effective household history proof',
    })

    const audits = await admin
      .select({
        id: auditEvents.id,
        eventType: auditEvents.eventType,
        change: auditEvents.changeSummary,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.tenantId, TENANT_A),
          eq(auditEvents.targetId, currentHouseholdId),
          eq(auditEvents.outcome, 'succeeded')
        )
      )
    assert.ok(audits.some(({ eventType }) => eventType === 'household.create'))
    assert.ok(audits.some(({ eventType }) => eventType === 'household.member.add'))
    assert.ok(audits.some(({ eventType }) => eventType === 'household.address.add'))
    const outbox = await admin
      .select({ id: auditOutbox.id })
      .from(auditOutbox)
      .where(
        inArray(
          auditOutbox.auditEventId,
          audits.map(({ id }) => id)
        )
      )
    assert.equal(outbox.length, audits.length)
    const auditPayload = JSON.stringify(audits.map(({ change }) => change)).toLocaleLowerCase('en')
    assert.equal(auditPayload.includes('proof lane'), false)
    assert.equal(auditPayload.includes('post office road'), false)

    console.log(
      'Household proof passed: multiple effective residences, independent primary preferences, sibling summaries, school and cross-Tenant denial parity, overlap and stale-write rejection, address history, direct-write denial, and atomic redacted audit/outbox evidence.'
    )
  } catch (error) {
    failure = error
  } finally {
    const cleanup = await Promise.allSettled([
      admin
        .delete(accountSessions)
        .where(inArray(accountSessions.providerSessionId, [ORG_SESSION, SCHOOL_SESSION])),
    ])
    const poolClose = await Promise.allSettled([
      closeDatabaseExecutionPoolsForProof(),
      admin.$client.end({ timeout: 5 }),
    ])
    const cleanupFailure = cleanup.find((result) => result.status === 'rejected')
    const closeFailure = poolClose.find((result) => result.status === 'rejected')
    if (!failure && cleanupFailure?.status === 'rejected') failure = cleanupFailure.reason
    if (!failure && closeFailure?.status === 'rejected') failure = closeFailure.reason
  }
  if (failure) throw failure
}

await runProof()
