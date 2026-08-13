import assert from 'node:assert/strict'
import { getServerEnv } from '@openschool/config/server'
import {
  type TenantDatabaseContext,
  accountSessions,
  auditEvents,
  closeDatabaseExecutionPoolsForProof,
  createMigrationClient,
  people,
  personDuplicateCaseEvents,
  personDuplicateCases,
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
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { toDatabasePolicyContext } from '../services/database-context'
import { getDuplicateReviewQueue, reviewDuplicateCase } from '../services/duplicate-people'
import { createStudent, updateStudent } from '../services/students'

const TENANT_A = '00000000-0000-4000-8000-000000000001'
const SCHOOL_PRIMARY = '00000000-0000-4000-8000-000000000101'
const SCHOOL_SIBLING = '00000000-0000-4000-8000-000000000102'
const CROSS_TENANT_SCHOOL = '00000000-0000-4000-8000-000000000103'
const SCHOOL_ADMIN_ACCOUNT = '00000000-0000-4000-8000-000000000202'
const SCHOOL_ADMIN_PERSON = '00000000-0000-4000-8000-000000000902'
const RUN_ID = crypto.randomUUID()
const SESSION_ID = `duplicate-review-${RUN_ID}`

function assertDisposable(): void {
  if (process.env.ALLOW_DUPLICATE_PEOPLE_POC !== 'true') {
    throw new Error('Duplicate People proof refused: explicit opt-in is required.')
  }
  const host = new URL(getServerEnv().DATABASE_RUNTIME_URL).hostname
  if (!new Set(['127.0.0.1', 'localhost', '[::1]']).has(host)) {
    throw new Error('Duplicate People proof refused: database host must be loopback.')
  }
}

const context: PolicyContext = Object.freeze({
  accountId: SCHOOL_ADMIN_ACCOUNT,
  personId: SCHOOL_ADMIN_PERSON,
  tenantId: TENANT_A,
  roleTemplateKeys: ['school_admin'],
  assuranceLevel: 'aal2',
  activeSchoolId: SCHOOL_PRIMARY,
})

function databaseContext(label: string): TenantDatabaseContext {
  return Object.freeze({
    accountId: SCHOOL_ADMIN_ACCOUNT,
    personId: SCHOOL_ADMIN_PERSON,
    tenantId: TENANT_A,
    sessionId: SESSION_ID,
    requestId: `duplicate-review:${RUN_ID}:${label}`,
    assuranceLevel: 'aal2',
    membershipVersion: 1,
    securityVersion: 1,
    contextPolicyVersion: 1,
    activeSchoolId: SCHOOL_PRIMARY,
  })
}

function allow(
  capability:
    | typeof CAPABILITIES.STUDENTS_CREATE
    | typeof CAPABILITIES.STUDENTS_UPDATE
    | typeof CAPABILITIES.PEOPLE_DUPLICATES_READ
    | typeof CAPABILITIES.PEOPLE_DUPLICATES_REVIEW,
  kind: 'school' | 'student' | 'person_duplicate_review',
  studentId?: string
): AllowedPolicyDecision {
  const decision = evaluatePolicy({
    bundle: CURRENT_POLICY_BUNDLE,
    context,
    capability,
    requestedScope: 'school',
    resource: {
      kind,
      tenantId: TENANT_A,
      schoolId: SCHOOL_PRIMARY,
      ...(studentId ? { studentId } : {}),
    },
  })
  assert.equal(decision.effect, 'allow', `${capability} must be allowed in the proof`)
  if (decision.effect !== 'allow') throw new Error('DUPLICATE_REVIEW_POLICY_DENIED')
  return decision
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

async function failureFingerprint(operation: Promise<unknown>): Promise<string> {
  try {
    await operation
  } catch (error) {
    if (error instanceof TRPCError) return `${error.code}:${error.message}`
    throw error
  }
  assert.fail('Expected operation to fail')
}

async function runProof(): Promise<void> {
  assertDisposable()
  const admin = createMigrationClient()
  const now = new Date()
  const createDecision = allow(CAPABILITIES.STUDENTS_CREATE, 'school')
  const readDecision = allow(CAPABILITIES.PEOPLE_DUPLICATES_READ, 'person_duplicate_review')
  const reviewDecision = allow(CAPABILITIES.PEOPLE_DUPLICATES_REVIEW, 'person_duplicate_review')
  try {
    await admin.insert(accountSessions).values({
      accountId: SCHOOL_ADMIN_ACCOUNT,
      providerSessionId: SESSION_ID,
      status: 'active',
      assuranceLevel: 'aal2',
      securityVersion: 1,
      authenticatedAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60_000),
    })

    const sharedEmail = `duplicate-${RUN_ID}@proof.test`
    const first = await createStudent(databaseContext('create-first'), context, createDecision, {
      schoolId: SCHOOL_PRIMARY,
      firstName: 'Taylor',
      lastName: `Duplicate ${RUN_ID}`,
      dateOfBirth: '2010-06-15',
      studentNumber: `DUP-A-${RUN_ID.slice(0, 8)}`,
      email: sharedEmail,
    })
    assert.equal(first.possibleDuplicateCount, 0)
    const second = await createStudent(databaseContext('create-second'), context, createDecision, {
      schoolId: SCHOOL_PRIMARY,
      firstName: 'Taylor',
      lastName: `Duplicate ${RUN_ID}`,
      dateOfBirth: '2010-06-15',
      studentNumber: `DUP-B-${RUN_ID.slice(0, 8)}`,
      email: sharedEmail,
    })
    assert.equal(second.possibleDuplicateCount, 1)

    let queue = await getDuplicateReviewQueue(
      databaseContext('queue-open'),
      context,
      readDecision,
      SCHOOL_PRIMARY
    )
    assert.equal(queue.length, 1)
    const duplicateCase = queue[0]
    assert.ok(duplicateCase)
    assert.equal(duplicateCase.status, 'open')
    assert.deepEqual([...duplicateCase.signals].sort(), [
      'same_date_of_birth',
      'same_normalized_email',
      'same_normalized_name',
    ])
    assert.equal(duplicateCase.score, 100)
    assert.equal(duplicateCase.events.length, 1)

    const distinct = await reviewDuplicateCase(
      databaseContext('mark-distinct'),
      context,
      reviewDecision,
      {
        caseId: duplicateCase.caseId,
        expectedVersion: duplicateCase.version,
        action: 'mark_distinct',
        reason: 'Verified as two distinct learners',
      }
    )
    assert.equal(distinct.status, 'distinct')
    assert.equal(distinct.version, 2)

    const updateDecision = allow(CAPABILITIES.STUDENTS_UPDATE, 'student', second.personId)
    const unchanged = await updateStudent(
      databaseContext('same-evidence'),
      context,
      updateDecision,
      second.personId,
      { email: sharedEmail }
    )
    assert.equal(unchanged.possibleDuplicateCount, 0)
    queue = await getDuplicateReviewQueue(
      databaseContext('queue-distinct'),
      context,
      readDecision,
      SCHOOL_PRIMARY,
      ['distinct']
    )
    assert.equal(queue[0]?.version, 2)

    const refreshed = await updateStudent(
      databaseContext('changed-evidence'),
      context,
      updateDecision,
      second.personId,
      { email: `changed-${RUN_ID}@proof.test` }
    )
    assert.equal(refreshed.possibleDuplicateCount, 1)
    queue = await getDuplicateReviewQueue(
      databaseContext('queue-reopened'),
      context,
      readDecision,
      SCHOOL_PRIMARY
    )
    assert.equal(queue[0]?.status, 'open')
    assert.equal(queue[0]?.version, 3)
    assert.deepEqual([...((queue[0]?.signals ?? []) as readonly string[])].sort(), [
      'same_date_of_birth',
      'same_normalized_name',
    ])

    const noLongerMatching = await updateStudent(
      databaseContext('evidence-removed'),
      context,
      updateDecision,
      second.personId,
      { firstName: 'Jordan', lastName: `Distinct ${RUN_ID}`, dateOfBirth: null }
    )
    assert.equal(noLongerMatching.possibleDuplicateCount, 0)
    queue = await getDuplicateReviewQueue(
      databaseContext('queue-superseded'),
      context,
      readDecision,
      SCHOOL_PRIMARY,
      ['superseded']
    )
    assert.equal(queue[0]?.version, 4)

    const matchingAgain = await updateStudent(
      databaseContext('evidence-returned'),
      context,
      updateDecision,
      second.personId,
      {
        firstName: 'Taylor',
        lastName: `Duplicate ${RUN_ID}`,
        dateOfBirth: '2010-06-15',
      }
    )
    assert.equal(matchingAgain.possibleDuplicateCount, 1)
    queue = await getDuplicateReviewQueue(
      databaseContext('queue-reopened-again'),
      context,
      readDecision,
      SCHOOL_PRIMARY
    )
    assert.equal(queue[0]?.status, 'open')
    assert.equal(queue[0]?.version, 5)

    const approval = await reviewDuplicateCase(
      databaseContext('request-approval'),
      context,
      reviewDecision,
      {
        caseId: duplicateCase.caseId,
        expectedVersion: 5,
        action: 'request_merge_approval',
        reason: 'Identity evidence warrants a separate approval review',
      }
    )
    assert.equal(approval.status, 'merge_approval_requested')
    assert.equal(approval.version, 6)

    const siblingFailure = await failureFingerprint(
      getDuplicateReviewQueue(
        databaseContext('sibling-denial'),
        context,
        readDecision,
        SCHOOL_SIBLING
      )
    )
    const crossTenantFailure = await failureFingerprint(
      getDuplicateReviewQueue(
        databaseContext('cross-tenant-denial'),
        context,
        readDecision,
        CROSS_TENANT_SCHOOL
      )
    )
    assert.equal(siblingFailure, 'FORBIDDEN:POLICY_SCOPE_MISMATCH')
    assert.equal(crossTenantFailure, siblingFailure)

    await assert.rejects(
      withPolicyTenantTransaction(
        databaseContext('direct-write-denial'),
        toDatabasePolicyContext(reviewDecision),
        (db) =>
          db
            .update(personDuplicateCases)
            .set({ status: 'distinct' })
            .where(eq(personDuplicateCases.id, duplicateCase.caseId))
      ),
      (error: unknown) => sqlState(error) === '42501'
    )
    await assert.rejects(
      withPolicyTenantTransaction(
        databaseContext('event-delete-denial'),
        toDatabasePolicyContext(reviewDecision),
        (db) =>
          db
            .delete(personDuplicateCaseEvents)
            .where(eq(personDuplicateCaseEvents.caseId, duplicateCase.caseId))
      ),
      (error: unknown) => sqlState(error) === '42501'
    )

    const survivingPeople = await admin
      .select({ id: people.id })
      .from(people)
      .where(inArray(people.id, [first.personId, second.personId]))
    assert.equal(survivingPeople.length, 2)
    const caseEvents = await admin
      .select({ eventType: personDuplicateCaseEvents.eventType })
      .from(personDuplicateCaseEvents)
      .where(eq(personDuplicateCaseEvents.caseId, duplicateCase.caseId))
      .orderBy(asc(personDuplicateCaseEvents.version))
    assert.deepEqual(
      caseEvents.map(({ eventType }) => eventType),
      [
        'candidate_detected',
        'marked_distinct',
        'evidence_refreshed',
        'evidence_no_longer_matches',
        'evidence_refreshed',
        'merge_approval_requested',
      ]
    )
    const decisionAudits = await admin
      .select({ id: auditEvents.id, eventType: auditEvents.eventType })
      .from(auditEvents)
      .where(
        and(eq(auditEvents.tenantId, TENANT_A), eq(auditEvents.targetId, duplicateCase.caseId))
      )
    assert.deepEqual(decisionAudits.map(({ eventType }) => eventType).sort(), [
      'person_duplicate.distinct',
      'person_duplicate.merge_approval_request',
    ])
    const [outboxCount] = await admin.execute<{ count: number }>(sql`
      select count(*)::int as count
      from audit_outbox
      where audit_event_id = any(${decisionAudits.map(({ id }) => id)}::uuid[])
    `)
    assert.equal(outboxCount?.count, 2)

    console.info(
      'Duplicate People proof passed: nonblocking admission warning, deterministic evidence, same-evidence suppression, material-evidence reopening, approval-only workflow, bounded history, audited decisions, school/tenant denials, direct-write rejection, immutable events, and no automatic merge.'
    )
  } finally {
    await closeDatabaseExecutionPoolsForProof()
    try {
      await admin.delete(accountSessions).where(eq(accountSessions.providerSessionId, SESSION_ID))
    } finally {
      await admin.$client.end({ timeout: 5 })
    }
  }
}

await runProof()
