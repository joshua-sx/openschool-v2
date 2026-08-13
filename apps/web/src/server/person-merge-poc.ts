import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { getServerEnv } from '@openschool/config/server'
import {
  type TenantDatabaseContext,
  accountSessions,
  closeDatabaseExecutionPoolsForProof,
  createMigrationClient,
  people,
  personDuplicateCases,
  personMergeEvents,
  personMergeOperations,
  personMergePreviewItems,
} from '@openschool/db'
import {
  type AllowedPolicyDecision,
  CAPABILITIES,
  CURRENT_POLICY_BUNDLE,
  type PolicyContext,
  evaluatePolicy,
} from '@openschool/rbac'
import { TRPCError } from '@trpc/server'
import { asc, eq, inArray } from 'drizzle-orm'
import { approvePersonMergePreview, createPersonMergePreview } from '../services/person-merges'

const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const SCHOOL_ID = '00000000-0000-4000-8000-000000000101'
const ROOT_ORGANIZATION_ID = TENANT_ID
const SCHOOL_ADMIN_ACCOUNT = '00000000-0000-4000-8000-000000000202'
const SCHOOL_ADMIN_PERSON = '00000000-0000-4000-8000-000000000902'
const ORG_ADMIN_ACCOUNT = '00000000-0000-4000-8000-000000000201'
const ORG_ADMIN_PERSON = '00000000-0000-4000-8000-000000000901'
const RUN_ID = crypto.randomUUID()
const NOW = new Date()
const SCHOOL_SESSION_ID = `person-merge-school-${RUN_ID}`
const ORG_SESSION_ID = `person-merge-org-${RUN_ID}`

function assertDisposable(): void {
  if (process.env.ALLOW_PERSON_MERGE_POC !== 'true') {
    throw new Error('Person merge proof refused: explicit opt-in is required.')
  }
  const host = new URL(getServerEnv().DATABASE_RUNTIME_URL).hostname
  if (!new Set(['127.0.0.1', 'localhost', '[::1]']).has(host)) {
    throw new Error('Person merge proof refused: database host must be loopback.')
  }
}

const schoolContext: PolicyContext = Object.freeze({
  accountId: SCHOOL_ADMIN_ACCOUNT,
  personId: SCHOOL_ADMIN_PERSON,
  tenantId: TENANT_ID,
  roleTemplateKeys: ['school_admin'],
  assuranceLevel: 'aal2',
  authenticatedAt: NOW.toISOString(),
  activeSchoolId: SCHOOL_ID,
})

const orgContext: PolicyContext = Object.freeze({
  accountId: ORG_ADMIN_ACCOUNT,
  personId: ORG_ADMIN_PERSON,
  tenantId: TENANT_ID,
  roleTemplateKeys: ['org_admin'],
  assuranceLevel: 'aal2',
  authenticatedAt: NOW.toISOString(),
  activeEducationOrganizationId: ROOT_ORGANIZATION_ID,
})

function databaseContext(
  actor: 'school' | 'org',
  label: string,
  reauthenticatedAt = NOW.toISOString()
): TenantDatabaseContext {
  const school = actor === 'school'
  return Object.freeze({
    accountId: school ? SCHOOL_ADMIN_ACCOUNT : ORG_ADMIN_ACCOUNT,
    personId: school ? SCHOOL_ADMIN_PERSON : ORG_ADMIN_PERSON,
    tenantId: TENANT_ID,
    sessionId: school ? SCHOOL_SESSION_ID : ORG_SESSION_ID,
    requestId: `person-merge:${RUN_ID}:${label}`,
    assuranceLevel: 'aal2',
    reauthenticatedAt,
    membershipVersion: 1,
    securityVersion: 1,
    contextPolicyVersion: 1,
    ...(school
      ? { activeSchoolId: SCHOOL_ID }
      : { activeEducationOrganizationId: ROOT_ORGANIZATION_ID }),
  })
}

function allow(
  context: PolicyContext,
  capability: typeof CAPABILITIES.PEOPLE_MERGES_PREVIEW | typeof CAPABILITIES.PEOPLE_MERGES_APPROVE
): AllowedPolicyDecision {
  const decision = evaluatePolicy({
    bundle: CURRENT_POLICY_BUNDLE,
    context,
    capability,
    requestedScope: 'school',
    resource: {
      kind: 'person_merge',
      tenantId: TENANT_ID,
      schoolId: SCHOOL_ID,
      organizationAncestorIds: [
        ROOT_ORGANIZATION_ID,
        '00000000-0000-4000-8000-000000000011',
        '00000000-0000-4000-8000-000000000013',
      ],
    },
    attributes: { now: NOW },
  })
  assert.equal(decision.effect, 'allow', `${capability} must be allowed in the proof`)
  if (decision.effect !== 'allow') throw new Error('PERSON_MERGE_POLICY_DENIED')
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

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function runProof(): Promise<void> {
  assertDisposable()
  const admin = createMigrationClient()
  const schoolPreviewDecision = allow(schoolContext, CAPABILITIES.PEOPLE_MERGES_PREVIEW)
  const schoolApprovalDecision = allow(schoolContext, CAPABILITIES.PEOPLE_MERGES_APPROVE)
  const orgApprovalDecision = allow(orgContext, CAPABILITIES.PEOPLE_MERGES_APPROVE)
  const sourcePersonId = crypto.randomUUID()
  const targetPersonId = crypto.randomUUID()
  const [firstPersonId, secondPersonId] = [sourcePersonId, targetPersonId].sort()
  const duplicateCaseId = crypto.randomUUID()
  try {
    await admin.insert(accountSessions).values([
      {
        accountId: SCHOOL_ADMIN_ACCOUNT,
        providerSessionId: SCHOOL_SESSION_ID,
        status: 'active',
        assuranceLevel: 'aal2',
        securityVersion: 1,
        authenticatedAt: NOW,
        reauthenticatedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 60 * 60_000),
      },
      {
        accountId: ORG_ADMIN_ACCOUNT,
        providerSessionId: ORG_SESSION_ID,
        status: 'active',
        assuranceLevel: 'aal2',
        securityVersion: 1,
        authenticatedAt: NOW,
        reauthenticatedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 60 * 60_000),
      },
    ])
    await admin.insert(people).values([
      {
        id: sourcePersonId,
        tenantId: TENANT_ID,
        displayName: `Merge Source ${RUN_ID}`,
        normalizedDisplayName: `merge source ${RUN_ID}`,
        source: 'native' as const,
      },
      {
        id: targetPersonId,
        tenantId: TENANT_ID,
        displayName: `Merge Target ${RUN_ID}`,
        normalizedDisplayName: `merge target ${RUN_ID}`,
        source: 'native' as const,
      },
    ])
    await admin.insert(personDuplicateCases).values({
      id: duplicateCaseId,
      tenantId: TENANT_ID,
      reviewSchoolId: SCHOOL_ID,
      firstPersonId,
      secondPersonId,
      status: 'merge_approval_requested',
      currentVersion: 1,
      currentScore: 80,
      currentSignals: ['same_normalized_name', 'same_date_of_birth'],
      currentEvidenceHash: hash(`person-merge-proof:${RUN_ID}`),
      createdByAccountId: SCHOOL_ADMIN_ACCOUNT,
    })

    const preview = await createPersonMergePreview(
      databaseContext('school', 'preview'),
      schoolContext,
      schoolPreviewDecision,
      {
        caseId: duplicateCaseId,
        expectedCaseVersion: 1,
        sourcePersonId,
        targetPersonId,
        reason: 'Validate the controlled Person merge approval boundary',
      }
    )
    assert.equal(preview.status, 'pending_approval')
    assert.equal(preview.conflictCount, 0)
    assert.ok(preview.dependencyCount >= 2)

    assert.equal(
      await failureFingerprint(
        approvePersonMergePreview(
          databaseContext('school', 'same-actor-denial'),
          schoolContext,
          schoolApprovalDecision,
          {
            operationId: preview.operationId,
            expectedOperationVersion: 1,
            expectedPreviewDigest: preview.previewDigest,
            reason: 'The initiating administrator must not approve',
          }
        )
      ),
      'NOT_FOUND:Merge case not found'
    )

    const approval = await approvePersonMergePreview(
      databaseContext('org', 'distinct-approval'),
      orgContext,
      orgApprovalDecision,
      {
        operationId: preview.operationId,
        expectedOperationVersion: 1,
        expectedPreviewDigest: preview.previewDigest,
        reason: 'Independently verified current evidence and dependency digest',
      }
    )
    assert.equal(approval.status, 'approved')
    assert.equal(approval.version, 2)

    const [operation] = await admin
      .select()
      .from(personMergeOperations)
      .where(eq(personMergeOperations.id, preview.operationId))
    assert.equal(operation?.approvedByAccountId, ORG_ADMIN_ACCOUNT)
    assert.equal(operation?.executedAt, null)
    const events = await admin
      .select({ eventType: personMergeEvents.eventType })
      .from(personMergeEvents)
      .where(eq(personMergeEvents.operationId, preview.operationId))
      .orderBy(asc(personMergeEvents.version))
    assert.deepEqual(
      events.map(({ eventType }) => eventType),
      ['preview_created', 'approval_granted']
    )
    assert.ok(
      (
        await admin
          .select({ id: personMergePreviewItems.id })
          .from(personMergePreviewItems)
          .where(eq(personMergePreviewItems.operationId, preview.operationId))
      ).length >= 2
    )
    const survivingPeople = await admin
      .select({ id: people.id })
      .from(people)
      .where(inArray(people.id, [sourcePersonId, targetPersonId]))
    assert.equal(survivingPeople.length, 2)

    console.info(
      'Person merge proof passed: locked preview, distinct approval, same-actor denial, append-only evidence, and no Person mutation.'
    )
  } finally {
    await closeDatabaseExecutionPoolsForProof()
    try {
      await admin
        .delete(accountSessions)
        .where(inArray(accountSessions.providerSessionId, [SCHOOL_SESSION_ID, ORG_SESSION_ID]))
    } finally {
      await admin.$client.end({ timeout: 5 })
    }
  }
}

await runProof()
