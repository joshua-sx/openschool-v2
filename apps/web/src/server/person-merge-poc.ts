import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { getServerEnv } from '@openschool/config/server'
import {
  type TenantDatabaseContext,
  accountLinks,
  accountSessions,
  accounts,
  auditEvents,
  auditOutbox,
  closeDatabaseExecutionPoolsForProof,
  createMigrationClient,
  people,
  personDuplicateCaseEvents,
  personDuplicateCases,
  personMergeAliases,
  personMergeEvents,
  personMergeMoves,
  personMergeOperations,
  personMergePreviewItems,
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
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { toDatabasePolicyContext } from '../services/database-context'
import {
  approvePersonMergePreview,
  createPersonMergePreview,
  executePersonMerge,
} from '../services/person-merges'

const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const SCHOOL_ID = '00000000-0000-4000-8000-000000000101'
const ROOT_ORGANIZATION_ID = TENANT_ID
const SCHOOL_ADMIN_ACCOUNT = '00000000-0000-4000-8000-000000000202'
const SCHOOL_ADMIN_PERSON = '00000000-0000-4000-8000-000000000902'
const ORG_ADMIN_ACCOUNT = '00000000-0000-4000-8000-000000000201'
const ORG_ADMIN_PERSON = '00000000-0000-4000-8000-000000000901'
const RUN_ID = crypto.randomUUID()
const NOW = new Date()
const LINKED_ACCOUNT_ID = crypto.randomUUID()
const SCHOOL_SESSION_ID = `person-merge-school-${RUN_ID}`
const ORG_SESSION_ID = `person-merge-org-${RUN_ID}`
const LINKED_SESSION_ID = `person-merge-linked-${RUN_ID}`

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
  capability:
    | typeof CAPABILITIES.PEOPLE_MERGES_PREVIEW
    | typeof CAPABILITIES.PEOPLE_MERGES_APPROVE
    | typeof CAPABILITIES.PEOPLE_MERGES_EXECUTE
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

async function runProof(): Promise<void> {
  assertDisposable()
  const admin = createMigrationClient()
  const schoolPreviewDecision = allow(schoolContext, CAPABILITIES.PEOPLE_MERGES_PREVIEW)
  const schoolApprovalDecision = allow(schoolContext, CAPABILITIES.PEOPLE_MERGES_APPROVE)
  const schoolExecutionDecision = allow(schoolContext, CAPABILITIES.PEOPLE_MERGES_EXECUTE)
  const orgApprovalDecision = allow(orgContext, CAPABILITIES.PEOPLE_MERGES_APPROVE)
  const sourcePersonId = crypto.randomUUID()
  const targetPersonId = crypto.randomUUID()
  const [firstPersonId, secondPersonId] = [sourcePersonId, targetPersonId].sort()
  const duplicateCaseId = crypto.randomUUID()
  try {
    await admin.insert(accounts).values({
      id: LINKED_ACCOUNT_ID,
      identityProvider: 'supabase',
      providerSubject: `person-merge-proof-${RUN_ID}`,
      primaryEmail: `person-merge-proof-${RUN_ID}@example.test`,
      status: 'active',
    })
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
      {
        accountId: LINKED_ACCOUNT_ID,
        providerSessionId: LINKED_SESSION_ID,
        status: 'active',
        assuranceLevel: 'aal1',
        securityVersion: 1,
        authenticatedAt: NOW,
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
    await admin.insert(accountLinks).values({
      tenantId: TENANT_ID,
      accountId: LINKED_ACCOUNT_ID,
      personId: sourcePersonId,
      status: 'active',
      validFrom: NOW,
      issuedByAccountId: SCHOOL_ADMIN_ACCOUNT,
      issuanceReason: 'Person merge execution proof',
      activatedAt: NOW,
    })
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
    assert.ok(preview.dependencyCount >= 3)

    assert.equal(
      await failureFingerprint(
        approvePersonMergePreview(
          databaseContext('school', 'same-actor-denial'),
          schoolContext,
          schoolApprovalDecision,
          {
            operationId: preview.operationId,
            expectedOperationVersion: 2,
            expectedPreviewDigest: preview.previewDigest,
            reason: 'The initiating administrator must not approve',
          }
        )
      ),
      'NOT_FOUND:Merge case not found'
    )

    await admin
      .update(people)
      .set({ displayName: `Changed Merge Source ${RUN_ID}` })
      .where(eq(people.id, sourcePersonId))
    assert.equal(
      await failureFingerprint(
        approvePersonMergePreview(
          databaseContext('org', 'stale-person-denial'),
          orgContext,
          orgApprovalDecision,
          {
            operationId: preview.operationId,
            expectedOperationVersion: 2,
            expectedPreviewDigest: preview.previewDigest,
            reason: 'A changed Person must invalidate the reviewed preview',
          }
        )
      ),
      'CONFLICT:MERGE_CASE_CHANGED'
    )
    await admin
      .update(people)
      .set({ displayName: `Merge Source ${RUN_ID}` })
      .where(eq(people.id, sourcePersonId))

    const approval = await approvePersonMergePreview(
      databaseContext('org', 'distinct-approval'),
      orgContext,
      orgApprovalDecision,
      {
        operationId: preview.operationId,
        expectedOperationVersion: 2,
        expectedPreviewDigest: preview.previewDigest,
        reason: 'Independently verified current evidence and dependency digest',
      }
    )
    assert.equal(approval.status, 'approved')
    assert.equal(approval.version, 3)

    const [operation] = await admin
      .select()
      .from(personMergeOperations)
      .where(eq(personMergeOperations.id, preview.operationId))
    assert.equal(operation?.approvedByAccountId, ORG_ADMIN_ACCOUNT)
    assert.equal(operation?.executedAt, null)
    await assert.rejects(
      withPolicyTenantTransaction(
        databaseContext('org', 'direct-write-denial'),
        toDatabasePolicyContext(orgApprovalDecision),
        (db) =>
          db
            .update(personMergeOperations)
            .set({ status: 'executed' })
            .where(eq(personMergeOperations.id, preview.operationId))
      ),
      (error: unknown) => sqlState(error) === '42501'
    )
    const events = await admin
      .select({ eventType: personMergeEvents.eventType })
      .from(personMergeEvents)
      .where(eq(personMergeEvents.operationId, preview.operationId))
      .orderBy(asc(personMergeEvents.version))
    assert.deepEqual(
      events.map(({ eventType }) => eventType),
      ['preview_created', 'preview_created', 'approval_granted']
    )

    await admin.execute(sql`
      create or replace function openschool_private.reject_person_merge_execution_proof()
      returns trigger language plpgsql as $$
      begin
        raise exception 'PERSON_MERGE_INJECTED_FAILURE';
      end
      $$
    `)
    await admin.execute(sql`
      create trigger person_merge_execution_failure_proof
      before insert on person_merge_aliases
      for each row execute function openschool_private.reject_person_merge_execution_proof()
    `)
    try {
      await assert.rejects(
        executePersonMerge(
          databaseContext('school', 'fault-rollback'),
          schoolContext,
          schoolExecutionDecision,
          {
            operationId: preview.operationId,
            expectedOperationVersion: approval.version,
            expectedPreviewDigest: approval.previewDigest,
            reason: 'Prove every merge mutation rolls back after an injected failure',
          }
        ),
        (error: unknown) => sqlState(error) === 'P0001'
      )
    } finally {
      await admin.execute(sql`
        drop trigger if exists person_merge_execution_failure_proof on person_merge_aliases
      `)
      await admin.execute(sql`
        drop function if exists openschool_private.reject_person_merge_execution_proof()
      `)
    }
    const [rolledBackOperation] = await admin
      .select()
      .from(personMergeOperations)
      .where(eq(personMergeOperations.id, preview.operationId))
    assert.equal(rolledBackOperation?.status, 'approved')
    assert.equal(
      (
        await admin
          .select({ id: personMergeAliases.id })
          .from(personMergeAliases)
          .where(eq(personMergeAliases.operationId, preview.operationId))
      ).length,
      0
    )
    assert.equal(
      (
        await admin
          .select({ id: personMergeMoves.id })
          .from(personMergeMoves)
          .where(eq(personMergeMoves.operationId, preview.operationId))
      ).length,
      0
    )

    const execution = await executePersonMerge(
      databaseContext('school', 'execution'),
      schoolContext,
      schoolExecutionDecision,
      {
        operationId: preview.operationId,
        expectedOperationVersion: approval.version,
        expectedPreviewDigest: approval.previewDigest,
        reason: 'Execute the independently approved canonical identity reconciliation',
      }
    )
    assert.equal(execution.status, 'executed')
    assert.equal(execution.version, 4)
    assert.equal(execution.invalidationCount, 1)
    assert.match(execution.executionDigest, /^[0-9a-f]{64}$/)

    const [executedOperation] = await admin
      .select()
      .from(personMergeOperations)
      .where(eq(personMergeOperations.id, preview.operationId))
    assert.equal(executedOperation?.status, 'executed')
    assert.equal(executedOperation?.executionDigest, execution.executionDigest)
    assert.equal(executedOperation?.executedByAccountId, SCHOOL_ADMIN_ACCOUNT)
    const [alias] = await admin
      .select()
      .from(personMergeAliases)
      .where(eq(personMergeAliases.operationId, preview.operationId))
    assert.equal(alias?.sourcePersonId, sourcePersonId)
    assert.equal(alias?.targetPersonId, targetPersonId)
    assert.equal(alias?.status, 'active')
    const moves = await admin
      .select()
      .from(personMergeMoves)
      .where(eq(personMergeMoves.operationId, preview.operationId))
      .orderBy(asc(personMergeMoves.sequence))
    assert.ok(moves.length >= preview.dependencyCount)
    assert.equal(
      moves.some(({ action }) => action === 'invalidate'),
      true
    )
    assert.equal(
      moves.some(({ action }) => action === 'repoint'),
      true
    )
    assert.equal(
      moves.some(({ action }) => action === 'archive_source'),
      true
    )

    const proofLinks = await admin
      .select()
      .from(accountLinks)
      .where(eq(accountLinks.issuanceReason, 'Person merge execution proof'))
    assert.equal(proofLinks[0]?.personId, targetPersonId)
    const [revokedSession] = await admin
      .select()
      .from(accountSessions)
      .where(eq(accountSessions.providerSessionId, LINKED_SESSION_ID))
    assert.equal(revokedSession?.status, 'revoked')
    const [invalidatedAccount] = await admin
      .select()
      .from(accounts)
      .where(eq(accounts.id, LINKED_ACCOUNT_ID))
    assert.equal(Number(invalidatedAccount?.membershipVersion), 2)
    assert.equal(Number(invalidatedAccount?.securityVersion), 2)

    const mergedPeople = await admin
      .select({ id: people.id, status: people.status })
      .from(people)
      .where(inArray(people.id, [sourcePersonId, targetPersonId]))
    assert.equal(mergedPeople.find(({ id }) => id === sourcePersonId)?.status, 'archived')
    assert.equal(mergedPeople.find(({ id }) => id === targetPersonId)?.status, 'active')
    const [closedCase] = await admin
      .select()
      .from(personDuplicateCases)
      .where(eq(personDuplicateCases.id, duplicateCaseId))
    assert.equal(closedCase?.status, 'superseded')
    const caseEvents = await admin
      .select({ eventType: personDuplicateCaseEvents.eventType })
      .from(personDuplicateCaseEvents)
      .where(eq(personDuplicateCaseEvents.caseId, duplicateCaseId))
    assert.equal(
      caseEvents.some(({ eventType }) => eventType === 'merge_executed'),
      true
    )
    const committedAudit = await admin
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(eq(auditEvents.targetId, preview.operationId))
    assert.ok(committedAudit.length >= 1)
    const committedOutbox = await admin
      .select({ id: auditOutbox.id })
      .from(auditOutbox)
      .where(eq(auditOutbox.deduplicationKey, `person_merge.execute:${preview.operationId}`))
    assert.equal(committedOutbox.length, 1)

    assert.equal(
      await failureFingerprint(
        executePersonMerge(
          databaseContext('school', 'repeat-denial'),
          schoolContext,
          schoolExecutionDecision,
          {
            operationId: preview.operationId,
            expectedOperationVersion: approval.version,
            expectedPreviewDigest: approval.previewDigest,
            reason: 'A completed merge must not execute twice',
          }
        )
      ),
      'CONFLICT:MERGE_APPROVAL_CHANGED'
    )
    assert.ok(
      (
        await admin
          .select({ id: personMergePreviewItems.id })
          .from(personMergePreviewItems)
          .where(eq(personMergePreviewItems.operationId, preview.operationId))
      ).length >= 3
    )
    const survivingPeople = await admin
      .select({ id: people.id })
      .from(people)
      .where(inArray(people.id, [sourcePersonId, targetPersonId]))
    assert.equal(survivingPeople.length, 2)

    console.info(
      'Person merge proof passed: locked plan, distinct approval, injected-fault rollback, atomic dependency repointing, Account/session invalidation, immutable alias and move evidence, duplicate-case closure, audit outbox, and repeat-execution denial.'
    )
  } finally {
    await closeDatabaseExecutionPoolsForProof()
    try {
      await admin
        .delete(accountSessions)
        .where(
          inArray(accountSessions.providerSessionId, [
            SCHOOL_SESSION_ID,
            ORG_SESSION_ID,
            LINKED_SESSION_ID,
          ])
        )
    } finally {
      await admin.$client.end({ timeout: 5 })
    }
  }
}

await runProof()
