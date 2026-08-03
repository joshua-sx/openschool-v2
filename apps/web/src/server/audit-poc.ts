import assert from 'node:assert/strict'
import {
  appendAuditEventInTransaction,
  claimAuditOutbox,
  completeAuditOutbox,
  readAuditEvents,
  recordAuditAttempt,
  requestAuditExport,
  toAuditDatabasePolicyContext,
} from '@openschool/audit'
import { getMigrationEnv, getServerEnv, getWorkerEnv } from '@openschool/config/server'
import {
  type TenantDatabaseContext,
  accountSessions,
  auditEvents,
  auditOutbox,
  closeDatabaseExecutionPoolsForProof,
  createMigrationClient,
  students,
  withPolicyTenantTransaction,
  withTenantTransaction,
  withWorkerTenantTransaction,
} from '@openschool/db'
import {
  CAPABILITIES,
  CURRENT_POLICY_BUNDLE,
  type PolicyContext,
  type PolicyDecision,
  evaluatePolicy,
} from '@openschool/rbac'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { createStudent, updateStudent } from '../services/students'

const TENANT_A = '00000000-0000-4000-8000-000000000001'
const TENANT_B = '00000000-0000-4000-8000-000000000002'
const SCHOOL_A = '00000000-0000-4000-8000-000000000101'
const SCHOOL_A_SIBLING = '00000000-0000-4000-8000-000000000102'
const SCHOOL_B = '00000000-0000-4000-8000-000000000103'
const ACCOUNT_A = '00000000-0000-4000-8000-000000000202'
const PERSON_A = '00000000-0000-4000-8000-000000000902'
const ACCOUNT_B = '00000000-0000-4000-8000-000000000207'
const PERSON_B = '00000000-0000-4000-8000-000000000908'
const PROOF_RUN_ID = crypto.randomUUID()
const SESSION_A = `audit-poc-${PROOF_RUN_ID}-a`
const SESSION_B = `audit-poc-${PROOF_RUN_ID}-b`
const ROLLED_BACK_STUDENT_ID = crypto.randomUUID()
const UNKNOWN_STUDENT_ID = crypto.randomUUID()
const SUPPORT_GRANT_ID = crypto.randomUUID()
const WORKER_JOB_ID = crypto.randomUUID()

function assertLocalDisposableDatabase(): void {
  if (process.env.ALLOW_AUDIT_POC !== 'true') {
    throw new Error('Audit proof refused: ALLOW_AUDIT_POC must be exactly "true".')
  }
  const serverEnvironment = getServerEnv()
  const migrationEnvironment = getMigrationEnv()
  const workerEnvironment = getWorkerEnv()
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]'])
  for (const [name, connectionString] of [
    ['DATABASE_MIGRATION_URL', migrationEnvironment.DATABASE_MIGRATION_URL],
    ['DATABASE_RUNTIME_URL', serverEnvironment.DATABASE_RUNTIME_URL],
    ['DATABASE_WORKER_URL', workerEnvironment.DATABASE_WORKER_URL],
  ] as const) {
    if (!loopbackHosts.has(new URL(connectionString).hostname)) {
      throw new Error(`Audit proof refused: ${name} host must be loopback.`)
    }
  }
}

function policyContext(tenant: 'a' | 'b'): PolicyContext {
  return tenant === 'a'
    ? {
        accountId: ACCOUNT_A,
        personId: PERSON_A,
        tenantId: TENANT_A,
        roleTemplateKeys: ['school_admin'],
        assuranceLevel: 'aal1',
        activeSchoolId: SCHOOL_A,
      }
    : {
        accountId: ACCOUNT_B,
        personId: PERSON_B,
        tenantId: TENANT_B,
        roleTemplateKeys: ['school_admin'],
        assuranceLevel: 'aal1',
        activeSchoolId: SCHOOL_B,
      }
}

function databaseContext(context: PolicyContext, requestId: string): TenantDatabaseContext {
  assert.ok(context.tenantId)
  return {
    accountId: context.accountId,
    personId: context.personId,
    tenantId: context.tenantId,
    sessionId: context.tenantId === TENANT_A ? SESSION_A : SESSION_B,
    requestId,
    assuranceLevel: context.assuranceLevel,
    membershipVersion: 1,
    securityVersion: 1,
    contextPolicyVersion: 1,
    ...(context.activeSchoolId ? { activeSchoolId: context.activeSchoolId } : {}),
  }
}

function allow(
  context: PolicyContext,
  capability: (typeof CAPABILITIES)[keyof typeof CAPABILITIES],
  resource: Parameters<typeof evaluatePolicy>[0]['resource']
): Extract<PolicyDecision, { effect: 'allow' }> {
  const decision = evaluatePolicy({
    bundle: CURRENT_POLICY_BUNDLE,
    context,
    capability,
    resource,
  })
  assert.equal(decision.effect, 'allow', `${capability} must be allowed in the proof`)
  if (decision.effect !== 'allow') throw new Error('AUDIT_POC_POLICY_DENIED')
  return decision
}

function sqlState(error: unknown): string | undefined {
  let current = error
  for (let depth = 0; depth < 6; depth += 1) {
    if (typeof current !== 'object' || current === null) return undefined
    if ('code' in current && typeof current.code === 'string') return current.code
    current = 'cause' in current ? current.cause : undefined
  }
  return undefined
}

async function expectSqlState(operation: Promise<unknown>, expected: string): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.equal(sqlState(error), expected)
    return true
  })
}

async function runProof(): Promise<void> {
  assertLocalDisposableDatabase()
  const admin = createMigrationClient()
  const contextA = policyContext('a')
  const contextB = policyContext('b')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000)
  const proofStudentIds: string[] = []

  try {
    await admin.insert(accountSessions).values([
      {
        accountId: ACCOUNT_A,
        providerSessionId: SESSION_A,
        status: 'active',
        assuranceLevel: 'aal1',
        securityVersion: 1,
        authenticatedAt: now,
        expiresAt,
      },
      {
        accountId: ACCOUNT_B,
        providerSessionId: SESSION_B,
        status: 'active',
        assuranceLevel: 'aal1',
        securityVersion: 1,
        authenticatedAt: now,
        expiresAt,
      },
    ])

    const createDecision = allow(contextA, CAPABILITIES.STUDENTS_CREATE, {
      kind: 'school',
      tenantId: TENANT_A,
      schoolId: SCHOOL_A,
    })
    const created = await createStudent(
      databaseContext(contextA, `audit-poc-${PROOF_RUN_ID}-create`),
      contextA,
      createDecision,
      {
        schoolId: SCHOOL_A,
        firstName: 'Atomic',
        lastName: 'Audit Proof',
        status: 'active',
      }
    )
    proofStudentIds.push(created.id)

    const updateDecision = allow(contextA, CAPABILITIES.STUDENTS_UPDATE, {
      kind: 'student',
      tenantId: TENANT_A,
      schoolId: SCHOOL_A,
      studentId: created.id,
    })
    const updated = await updateStudent(
      databaseContext(contextA, `audit-poc-${PROOF_RUN_ID}-update`),
      contextA,
      updateDecision,
      created.id,
      { status: 'read_only', email: 'must-not-appear@example.test' }
    )
    assert.equal(updated.status, 'read_only')

    const faultContext = databaseContext(contextA, `audit-poc-${PROOF_RUN_ID}-fault`)
    await assert.rejects(
      withPolicyTenantTransaction(
        faultContext,
        toAuditDatabasePolicyContext(createDecision),
        async (transaction) => {
          await transaction.insert(students).values({
            id: ROLLED_BACK_STUDENT_ID,
            tenantId: TENANT_A,
            schoolId: SCHOOL_A,
            firstName: 'Must',
            lastName: 'Roll Back',
          })
          await appendAuditEventInTransaction(transaction, faultContext, contextA, createDecision, {
            eventType: 'student.create',
            outcome: 'succeeded',
            targetType: 'student',
            targetId: ROLLED_BACK_STUDENT_ID,
            dataClasses: ['student_personal'],
            change: { after: { email: 'forbidden@example.test' } },
          })
        }
      ),
      /AUDIT_REDACTION_BLOCKED_FIELD:email/
    )
    assert.equal(
      (
        await admin
          .select({ id: students.id })
          .from(students)
          .where(eq(students.id, ROLLED_BACK_STUDENT_ID))
      ).length,
      0
    )

    await assert.rejects(
      updateStudent(
        databaseContext(contextA, `audit-poc-${PROOF_RUN_ID}-failed`),
        contextA,
        updateDecision,
        UNKNOWN_STUDENT_ID,
        { status: 'archived' }
      )
    )

    const deniedDecision = evaluatePolicy({
      bundle: CURRENT_POLICY_BUNDLE,
      context: contextA,
      capability: CAPABILITIES.STUDENTS_UPDATE,
      resource: {
        kind: 'student',
        tenantId: TENANT_A,
        schoolId: SCHOOL_A_SIBLING,
        studentId: UNKNOWN_STUDENT_ID,
      },
    })
    assert.equal(deniedDecision.effect, 'deny')
    await recordAuditAttempt(
      databaseContext(contextA, `audit-poc-${PROOF_RUN_ID}-denied`),
      contextA,
      deniedDecision,
      {
        eventType: 'student.update',
        outcome: 'denied',
        targetType: 'student',
        targetId: UNKNOWN_STUDENT_ID,
        dataClasses: ['student_personal'],
        change: { changedFields: ['policyDecision'] },
      }
    )

    await recordAuditAttempt(
      databaseContext(contextA, `audit-poc-${PROOF_RUN_ID}-support`),
      contextA,
      deniedDecision,
      {
        eventType: 'support.session.use',
        outcome: 'denied',
        targetType: 'support_session',
        targetId: SUPPORT_GRANT_ID,
        supportGrantId: SUPPORT_GRANT_ID,
        source: 'support',
        purpose: 'support.investigation',
        dataClasses: ['credential'],
        change: { changedFields: ['policyDecision'] },
      }
    )

    const auditReadDecisionA = allow(contextA, CAPABILITIES.AUDIT_READ, {
      kind: 'audit_log',
      tenantId: TENANT_A,
      schoolId: SCHOOL_A,
    })
    const auditRead = await readAuditEvents(
      databaseContext(contextA, `audit-poc-${PROOF_RUN_ID}-read`),
      contextA,
      auditReadDecisionA,
      { limit: 100, purpose: 'security.review' }
    )
    assert.equal(
      auditRead.events.some(
        (event) => event.eventType === 'student.create' && event.targetId === created.id
      ),
      true
    )
    assert.equal(
      auditRead.events.some((event) =>
        JSON.stringify(event.changeSummary).includes('must-not-appear@example.test')
      ),
      false
    )

    const exportRequestId = `audit-poc-${PROOF_RUN_ID}-export`
    const exportDeduplicationKey = `audit.export:${PROOF_RUN_ID}`
    const exportResult = await requestAuditExport(
      databaseContext(contextA, exportRequestId),
      contextA,
      auditReadDecisionA,
      {
        format: 'jsonl',
        deduplicationKey: exportDeduplicationKey,
        purpose: 'security.review',
      }
    )
    assert.equal(exportResult.outboxCreated, true)
    const duplicateExport = await requestAuditExport(
      databaseContext(contextA, `audit-poc-${PROOF_RUN_ID}-export-retry`),
      contextA,
      auditReadDecisionA,
      {
        format: 'jsonl',
        deduplicationKey: exportDeduplicationKey,
        purpose: 'security.review',
      }
    )
    assert.equal(duplicateExport.outboxCreated, false)
    assert.equal(duplicateExport.eventId, exportResult.eventId)
    assert.equal(duplicateExport.outboxId, exportResult.outboxId)

    const auditReadDecisionB = allow(contextB, CAPABILITIES.AUDIT_READ, {
      kind: 'audit_log',
      tenantId: TENANT_B,
      schoolId: SCHOOL_B,
    })
    const tenantBRead = await readAuditEvents(
      databaseContext(contextB, `audit-poc-${PROOF_RUN_ID}-tenant-b-read`),
      contextB,
      auditReadDecisionB,
      { limit: 100, purpose: 'security.review' }
    )
    assert.equal(
      tenantBRead.events.some((event) => event.targetId === created.id),
      false
    )

    const claimed = await withWorkerTenantTransaction(
      {
        tenantId: TENANT_A,
        jobId: WORKER_JOB_ID,
        jobType: 'audit_outbox_delivery',
        requestId: `audit-poc-${PROOF_RUN_ID}-worker-claim`,
      },
      (transaction) => claimAuditOutbox(transaction, TENANT_A, { limit: 100 })
    )
    const exportOutbox = claimed.find(
      (record) => record.deduplicationKey === exportDeduplicationKey
    )
    assert.ok(exportOutbox)
    assert.equal(exportOutbox.correlationId, exportRequestId)
    assert.equal(exportOutbox.context.tenantId, TENANT_A)
    assert.equal(exportOutbox.context.requestId, exportRequestId)
    assert.equal(exportOutbox.context.actorAccountId, ACCOUNT_A)
    assert.equal(exportOutbox.context.actorPersonId, PERSON_A)

    const retryAt = new Date(Date.now() + 1_000)
    await withWorkerTenantTransaction(
      {
        tenantId: TENANT_A,
        jobId: WORKER_JOB_ID,
        jobType: 'audit_outbox_delivery',
        requestId: `audit-poc-${PROOF_RUN_ID}-worker-fail`,
      },
      (transaction) =>
        completeAuditOutbox(transaction, {
          tenantId: TENANT_A,
          id: exportOutbox.id,
          outcome: 'failed',
          expectedAttemptCount: exportOutbox.attemptCount,
          errorCode: 'PROOF_RETRY',
          retryAt,
        })
    )
    const retried = await withWorkerTenantTransaction(
      {
        tenantId: TENANT_A,
        jobId: WORKER_JOB_ID,
        jobType: 'audit_outbox_delivery',
        requestId: `audit-poc-${PROOF_RUN_ID}-worker-retry`,
      },
      (transaction) =>
        claimAuditOutbox(transaction, TENANT_A, {
          limit: 100,
          at: new Date(retryAt.getTime() + 1),
        })
    )
    const retriedExport = retried.find(({ id }) => id === exportOutbox.id)
    assert.ok(retriedExport)
    assert.equal(retriedExport.attemptCount, exportOutbox.attemptCount + 1)
    const publishedAt = new Date(retryAt.getTime() + 2)
    const published = await withWorkerTenantTransaction(
      {
        tenantId: TENANT_A,
        jobId: WORKER_JOB_ID,
        jobType: 'audit_outbox_delivery',
        requestId: `audit-poc-${PROOF_RUN_ID}-worker-publish`,
      },
      (transaction) =>
        completeAuditOutbox(transaction, {
          tenantId: TENANT_A,
          id: exportOutbox.id,
          outcome: 'published',
          expectedAttemptCount: retriedExport.attemptCount,
          at: publishedAt,
        })
    )
    const publishedAgain = await withWorkerTenantTransaction(
      {
        tenantId: TENANT_A,
        jobId: WORKER_JOB_ID,
        jobType: 'audit_outbox_delivery',
        requestId: `audit-poc-${PROOF_RUN_ID}-worker-idempotent`,
      },
      (transaction) =>
        completeAuditOutbox(transaction, {
          tenantId: TENANT_A,
          id: exportOutbox.id,
          outcome: 'published',
          expectedAttemptCount: retriedExport.attemptCount,
        })
    )
    assert.equal(publishedAgain.id, published.id)
    assert.equal(publishedAgain.payloadHash, published.payloadHash)

    const reclaimAt = new Date(publishedAt.getTime() + 2_000)
    const reclaimed = await withWorkerTenantTransaction(
      {
        tenantId: TENANT_A,
        jobId: WORKER_JOB_ID,
        jobType: 'audit_outbox_delivery',
        requestId: `audit-poc-${PROOF_RUN_ID}-worker-reclaim`,
      },
      (transaction) =>
        claimAuditOutbox(transaction, TENANT_A, {
          limit: 100,
          at: reclaimAt,
          leaseDurationMs: 1_000,
        })
    )
    const staleClaim = claimed.find(({ id }) => id !== exportOutbox.id)
    assert.ok(staleClaim)
    const reclaimedStaleClaim = reclaimed.find(({ id }) => id === staleClaim.id)
    assert.ok(reclaimedStaleClaim)
    assert.equal(reclaimedStaleClaim.attemptCount, staleClaim.attemptCount + 1)
    await assert.rejects(
      withWorkerTenantTransaction(
        {
          tenantId: TENANT_A,
          jobId: WORKER_JOB_ID,
          jobType: 'audit_outbox_delivery',
          requestId: `audit-poc-${PROOF_RUN_ID}-worker-stale`,
        },
        (transaction) =>
          completeAuditOutbox(transaction, {
            tenantId: TENANT_A,
            id: staleClaim.id,
            outcome: 'published',
            expectedAttemptCount: staleClaim.attemptCount,
          })
      ),
      /AUDIT_OUTBOX_NOT_PROCESSING/
    )
    for (const pending of reclaimed) {
      await withWorkerTenantTransaction(
        {
          tenantId: TENANT_A,
          jobId: WORKER_JOB_ID,
          jobType: 'audit_outbox_delivery',
          requestId: `audit-poc-${PROOF_RUN_ID}-worker-drain`,
        },
        (transaction) =>
          completeAuditOutbox(transaction, {
            tenantId: TENANT_A,
            id: pending.id,
            outcome: 'published',
            expectedAttemptCount: pending.attemptCount,
            at: new Date(reclaimAt.getTime() + 1),
          })
      )
    }

    const [createEvent] = await admin
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.tenantId, TENANT_A),
          eq(auditEvents.eventType, 'student.create'),
          eq(auditEvents.targetId, created.id)
        )
      )
      .limit(1)
    assert.ok(createEvent)

    const [hashEvidence] = await admin.execute<{ matches: boolean }>(sql`
      select public.openschool_audit_event_hash_matches(event) as "matches"
      from audit_events as event
      where event.occurred_at = ${createEvent.occurredAt.toISOString()}::timestamptz
        and event.id = ${createEvent.id}
    `)
    assert.equal(hashEvidence?.matches, true)

    const runtimeContext = databaseContext(contextA, `audit-poc-${PROOF_RUN_ID}-tamper`)
    const redactionContext = databaseContext(
      contextA,
      `audit-poc-${PROOF_RUN_ID}-database-redaction`
    )
    await expectSqlState(
      withTenantTransaction(redactionContext, (transaction) =>
        transaction.insert(auditEvents).values({
          occurredAt: new Date(),
          eventVersion: 1,
          eventType: 'student.update',
          outcome: 'failed',
          tenantId: TENANT_A,
          schoolId: SCHOOL_A,
          actorType: 'account',
          actorAccountId: ACCOUNT_A,
          actorPersonId: PERSON_A,
          requestId: redactionContext.requestId,
          correlationId: redactionContext.requestId,
          targetType: 'student',
          targetId: UNKNOWN_STUDENT_ID,
          dataClasses: ['health'],
          changeSummary: { before: { status: 'active' } },
          source: 'web',
          retentionClass: 'safeguarding',
        })
      ),
      '22023'
    )
    await expectSqlState(
      withTenantTransaction(runtimeContext, (transaction) =>
        transaction
          .update(auditEvents)
          .set({ purpose: 'tamper.attempt' })
          .where(
            and(
              eq(auditEvents.occurredAt, createEvent.occurredAt),
              eq(auditEvents.id, createEvent.id)
            )
          )
      ),
      '42501'
    )
    await expectSqlState(
      withTenantTransaction(runtimeContext, (transaction) =>
        transaction
          .delete(auditEvents)
          .where(
            and(
              eq(auditEvents.occurredAt, createEvent.occurredAt),
              eq(auditEvents.id, createEvent.id)
            )
          )
      ),
      '42501'
    )
    await expectSqlState(
      admin
        .update(auditEvents)
        .set({ purpose: 'owner.tamper' })
        .where(
          and(
            eq(auditEvents.occurredAt, createEvent.occurredAt),
            eq(auditEvents.id, createEvent.id)
          )
        ),
      '55000'
    )
    await expectSqlState(
      admin.delete(auditOutbox).where(eq(auditOutbox.id, exportOutbox.id)),
      '55000'
    )

    console.log(
      'Audit proof passed: atomic rollback, redaction, denied/failed/support evidence, forced RLS, immutable hashes, Tenant-scoped audited reads/exports, and idempotent outbox retry.'
    )
  } finally {
    await closeDatabaseExecutionPoolsForProof()
    if (proofStudentIds.length > 0) {
      await admin.delete(students).where(inArray(students.id, proofStudentIds))
    }
    await admin
      .delete(accountSessions)
      .where(inArray(accountSessions.providerSessionId, [SESSION_A, SESSION_B]))
    await admin.$client.end({ timeout: 5 })
  }
}

await runProof()
