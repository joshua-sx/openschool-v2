import assert from 'node:assert/strict'
import { appendAuditEventInTransaction } from '@openschool/audit'
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
  schoolEnrollmentTransitionEvents,
  schoolEnrollments,
  studentProfiles,
  withPolicyTenantTransaction,
} from '@openschool/db'
import {
  CAPABILITIES,
  CURRENT_POLICY_BUNDLE,
  type PolicyContext,
  type PolicyDecision,
  evaluatePolicy,
} from '@openschool/rbac'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { toDatabasePolicyContext } from '../services/database-context'
import {
  applyEnrollmentTransition,
  cancelEnrollmentTransition,
  getEnrollmentHistory,
  scheduleEnrollmentTransition,
} from '../services/student-enrollments'
import { createStudent, getStudentById } from '../services/students'

const TENANT_A = '00000000-0000-4000-8000-000000000001'
const SCHOOL_PRIMARY = '00000000-0000-4000-8000-000000000101'
const SCHOOL_HIGH = '00000000-0000-4000-8000-000000000102'
const SCHOOL_CROSS_TENANT = '00000000-0000-4000-8000-000000000103'
const ORGANIZATION_ROOT = '00000000-0000-4000-8000-000000000001'
const ORG_ADMIN_ACCOUNT = '00000000-0000-4000-8000-000000000201'
const ORG_ADMIN_PERSON = '00000000-0000-4000-8000-000000000901'
const SCHOOL_ADMIN_ACCOUNT = '00000000-0000-4000-8000-000000000202'
const SCHOOL_ADMIN_PERSON = '00000000-0000-4000-8000-000000000902'
const PROOF_RUN_ID = crypto.randomUUID()
const ORG_SESSION_ID = `enrollment-lifecycle-org-${PROOF_RUN_ID}`
const SCHOOL_SESSION_ID = `enrollment-lifecycle-school-${PROOF_RUN_ID}`
const LINKED_ACCOUNT_ID = crypto.randomUUID()
const LINKED_ACCOUNT_EMAIL = `enrollment-lifecycle-${PROOF_RUN_ID}@proof.test`

function assertLocalDisposableDatabase(): void {
  if (process.env.ALLOW_STUDENT_ENROLLMENT_LIFECYCLE_POC !== 'true') {
    throw new Error(
      'Enrollment lifecycle proof refused: ALLOW_STUDENT_ENROLLMENT_LIFECYCLE_POC must be exactly "true".'
    )
  }
  const url = new URL(getServerEnv().DATABASE_RUNTIME_URL)
  if (!new Set(['127.0.0.1', 'localhost', '[::1]']).has(url.hostname)) {
    throw new Error('Enrollment lifecycle proof refused: database host must be loopback.')
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

function databaseContext(
  requestId: string,
  actor: 'org' | 'school' = 'org'
): TenantDatabaseContext {
  const organizationActor = actor === 'org'
  return Object.freeze({
    accountId: organizationActor ? ORG_ADMIN_ACCOUNT : SCHOOL_ADMIN_ACCOUNT,
    personId: organizationActor ? ORG_ADMIN_PERSON : SCHOOL_ADMIN_PERSON,
    tenantId: TENANT_A,
    sessionId: organizationActor ? ORG_SESSION_ID : SCHOOL_SESSION_ID,
    requestId,
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
  capability: (typeof CAPABILITIES)[keyof typeof CAPABILITIES],
  kind: 'school' | 'student' | 'student_enrollment'
): Extract<PolicyDecision, { effect: 'allow' }> {
  const decision = evaluatePolicy({
    bundle: CURRENT_POLICY_BUNDLE,
    context,
    capability,
    resource: { kind, tenantId: TENANT_A },
  })
  assert.equal(decision.effect, 'allow', `${capability} must be allowed in the proof`)
  if (decision.effect !== 'allow') throw new Error('ENROLLMENT_LIFECYCLE_POC_POLICY_DENIED')
  return decision
}

function immediateAfter(date: Date): string {
  return new Date(Math.max(Date.now() - 1, date.getTime() + 1)).toISOString()
}

async function failureMessage(operation: Promise<unknown>): Promise<string> {
  try {
    await operation
  } catch (error) {
    assert.ok(error instanceof Error)
    return error.message
  }
  assert.fail('Expected operation to fail')
}

async function runProof(): Promise<void> {
  assertLocalDisposableDatabase()
  const admin = createMigrationClient()
  const orgContext = orgPolicyContext()
  const schoolContext = schoolPolicyContext()
  const createDecision = allow(orgContext, CAPABILITIES.STUDENTS_CREATE, 'school')
  const studentRead = allow(orgContext, CAPABILITIES.STUDENTS_READ, 'student')
  const enrollmentRead = allow(
    orgContext,
    CAPABILITIES.STUDENT_ENROLLMENTS_READ,
    'student_enrollment'
  )
  const enrollmentManage = allow(
    orgContext,
    CAPABILITIES.STUDENT_ENROLLMENTS_MANAGE,
    'student_enrollment'
  )
  const schoolEnrollmentRead = allow(
    schoolContext,
    CAPABILITIES.STUDENT_ENROLLMENTS_READ,
    'student_enrollment'
  )
  const schoolEnrollmentManage = allow(
    schoolContext,
    CAPABILITIES.STUDENT_ENROLLMENTS_MANAGE,
    'student_enrollment'
  )
  const now = new Date()
  let failure: unknown

  try {
    await admin.insert(accountSessions).values([
      {
        accountId: ORG_ADMIN_ACCOUNT,
        providerSessionId: ORG_SESSION_ID,
        status: 'active',
        assuranceLevel: 'aal2',
        securityVersion: 1,
        authenticatedAt: now,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      },
      {
        accountId: SCHOOL_ADMIN_ACCOUNT,
        providerSessionId: SCHOOL_SESSION_ID,
        status: 'active',
        assuranceLevel: 'aal2',
        securityVersion: 1,
        authenticatedAt: now,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      },
    ])

    const created = await createStudent(
      databaseContext(`enrollment-${PROOF_RUN_ID}-create`),
      orgContext,
      createDecision,
      {
        schoolId: SCHOOL_PRIMARY,
        firstName: 'Enrollment',
        lastName: 'Lifecycle Proof',
        studentNumber: `EL-${PROOF_RUN_ID.slice(0, 8)}`,
        email: `learner-${PROOF_RUN_ID}@proof.test`,
      }
    )

    await admin.insert(accounts).values({
      id: LINKED_ACCOUNT_ID,
      identityProvider: 'proof',
      providerSubject: `enrollment-lifecycle-${PROOF_RUN_ID}`,
      primaryEmail: LINKED_ACCOUNT_EMAIL,
    })
    await admin.insert(accountLinks).values({
      tenantId: TENANT_A,
      accountId: LINKED_ACCOUNT_ID,
      personId: created.personId,
      status: 'active',
      validFrom: now,
      issuanceReason: 'Enrollment authorization-version proof',
      activatedAt: now,
    })

    let history = await scheduleEnrollmentTransition(
      databaseContext(`enrollment-${PROOF_RUN_ID}-transfer`),
      orgContext,
      enrollmentManage,
      {
        personId: created.personId,
        fromEnrollmentId: created.schoolEnrollmentId,
        destinationSchoolId: SCHOOL_HIGH,
        transitionType: 'transfer',
        effectiveAt: immediateAfter(created.enrolledAt),
        reason: 'Atomic within-Tenant transfer proof',
        evidenceReference: 'proof:approved-transfer',
        expectedEnrollmentVersion: 1,
        applyImmediately: true,
      }
    )
    assert.equal(history.periods.length, 2)
    assert.equal(history.periods.find(({ isCurrent }) => isCurrent)?.schoolId, SCHOOL_HIGH)
    assert.equal(history.transitions.at(-1)?.status, 'applied')

    const [linkedAfterTransfer] = await admin
      .select({ membershipVersion: accounts.membershipVersion })
      .from(accounts)
      .where(eq(accounts.id, LINKED_ACCOUNT_ID))
    assert.equal(linkedAfterTransfer?.membershipVersion, 2)

    const currentHigh = history.periods.find(({ isCurrent }) => isCurrent)
    assert.ok(currentHigh)
    const futureAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    history = await scheduleEnrollmentTransition(
      databaseContext(`enrollment-${PROOF_RUN_ID}-future-withdraw`),
      orgContext,
      enrollmentManage,
      {
        personId: created.personId,
        fromEnrollmentId: currentHigh.id,
        transitionType: 'withdraw',
        effectiveAt: futureAt,
        reason: 'Future withdrawal schedule proof',
        expectedEnrollmentVersion: currentHigh.version,
      }
    )
    const futureTransition = history.transitions.find(
      ({ reason }) => reason === 'Future withdrawal schedule proof'
    )
    assert.equal(futureTransition?.status, 'scheduled')

    const pendingFailure = await failureMessage(
      scheduleEnrollmentTransition(
        databaseContext(`enrollment-${PROOF_RUN_ID}-concurrent`),
        orgContext,
        enrollmentManage,
        {
          personId: created.personId,
          fromEnrollmentId: currentHigh.id,
          transitionType: 'withdraw',
          effectiveAt: futureAt,
          reason: 'Conflicting concurrent schedule proof',
          expectedEnrollmentVersion: currentHigh.version,
        }
      )
    )
    assert.equal(pendingFailure, 'ENROLLMENT_TRANSITION_CONFLICT')
    assert.ok(futureTransition)
    history = await cancelEnrollmentTransition(
      databaseContext(`enrollment-${PROOF_RUN_ID}-cancel`),
      orgContext,
      enrollmentManage,
      futureTransition.transitionId,
      'Administrative cancellation proof'
    )
    assert.equal(
      history.transitions.find(({ transitionId }) => transitionId === futureTransition.transitionId)
        ?.status,
      'cancelled'
    )

    const staleFailure = await failureMessage(
      scheduleEnrollmentTransition(
        databaseContext(`enrollment-${PROOF_RUN_ID}-stale`),
        orgContext,
        enrollmentManage,
        {
          personId: created.personId,
          fromEnrollmentId: currentHigh.id,
          transitionType: 'withdraw',
          effectiveAt: new Date().toISOString(),
          reason: 'Stale enrollment version proof',
          expectedEnrollmentVersion: currentHigh.version + 1,
          applyImmediately: true,
        }
      )
    )
    assert.equal(staleFailure, 'ENROLLMENT_CONTEXT_STALE')

    const siblingFailure = await failureMessage(
      scheduleEnrollmentTransition(
        databaseContext(`enrollment-${PROOF_RUN_ID}-sibling`, 'school'),
        schoolContext,
        schoolEnrollmentManage,
        {
          personId: created.personId,
          fromEnrollmentId: currentHigh.id,
          transitionType: 'withdraw',
          effectiveAt: new Date().toISOString(),
          reason: 'Sibling School denial proof',
          expectedEnrollmentVersion: currentHigh.version,
          applyImmediately: true,
        }
      )
    )
    const crossTenantFailure = await failureMessage(
      scheduleEnrollmentTransition(
        databaseContext(`enrollment-${PROOF_RUN_ID}-cross-tenant`),
        orgContext,
        enrollmentManage,
        {
          personId: created.personId,
          fromEnrollmentId: currentHigh.id,
          destinationSchoolId: SCHOOL_CROSS_TENANT,
          transitionType: 'transfer',
          effectiveAt: new Date().toISOString(),
          reason: 'Cross-Tenant transfer denial proof',
          expectedEnrollmentVersion: currentHigh.version,
          applyImmediately: true,
        }
      )
    )
    assert.equal(siblingFailure, 'ENROLLMENT_TRANSITION_UNAVAILABLE')
    assert.equal(crossTenantFailure, 'ENROLLMENT_TRANSITION_UNAVAILABLE')

    const rollbackTransitionId = crypto.randomUUID()
    const unauditableDecision = Object.freeze({
      ...enrollmentManage,
      obligations: Object.freeze(
        enrollmentManage.obligations.filter((obligation) => obligation.kind !== 'audit')
      ),
    })
    const rollbackDatabaseContext = databaseContext(`enrollment-${PROOF_RUN_ID}-rollback`)
    await assert.rejects(
      withPolicyTenantTransaction(
        rollbackDatabaseContext,
        toDatabasePolicyContext(unauditableDecision),
        async (transaction) => {
          await transaction.execute(sql`
            select * from openschool_private.schedule_school_enrollment_transition(
              ${crypto.randomUUID()}::uuid,
              ${rollbackTransitionId}::uuid,
              ${created.personId}::uuid,
              ${currentHigh.id}::uuid,
              null::uuid,
              'withdraw'::text,
              ${new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()}::timestamptz,
              'Audit rollback proof'::text,
              null::text,
              ${currentHigh.version}::bigint
            )
          `)
          await appendAuditEventInTransaction(
            transaction,
            rollbackDatabaseContext,
            orgContext,
            unauditableDecision,
            {
              eventType: 'student.enrollment.schedule',
              outcome: 'succeeded',
              targetType: 'school_enrollment_transition',
              targetId: rollbackTransitionId,
              dataClasses: ['student_personal'],
              change: { changedFields: ['scheduledTransition'] },
            }
          )
        }
      )
    )
    const [rolledBack] = await admin
      .select({ count: sql<number>`count(*)::int` })
      .from(schoolEnrollmentTransitionEvents)
      .where(eq(schoolEnrollmentTransitionEvents.transitionId, rollbackTransitionId))
    assert.equal(rolledBack?.count, 0)

    history = await scheduleEnrollmentTransition(
      databaseContext(`enrollment-${PROOF_RUN_ID}-withdraw`),
      orgContext,
      enrollmentManage,
      {
        personId: created.personId,
        fromEnrollmentId: currentHigh.id,
        transitionType: 'withdraw',
        effectiveAt: new Date().toISOString(),
        reason: 'Immediate withdrawal proof',
        expectedEnrollmentVersion: currentHigh.version,
        applyImmediately: true,
      }
    )
    assert.equal(
      history.periods.some(({ isCurrent }) => isCurrent),
      false
    )
    const historicalLearner = await getStudentById(
      databaseContext(`enrollment-${PROOF_RUN_ID}-historical-student`),
      orgContext,
      studentRead,
      created.personId
    )
    assert.equal(historicalLearner?.status, 'withdrawn')
    assert.equal(historicalLearner?.isCurrentEnrollment, false)

    history = await scheduleEnrollmentTransition(
      databaseContext(`enrollment-${PROOF_RUN_ID}-reenroll`),
      orgContext,
      enrollmentManage,
      {
        personId: created.personId,
        destinationSchoolId: SCHOOL_PRIMARY,
        transitionType: 'reenroll',
        effectiveAt: new Date().toISOString(),
        reason: 'Re-enrollment history proof',
        evidenceReference: 'proof:reenrollment-approved',
        applyImmediately: true,
      }
    )
    const reenrolledPrimary = history.periods.find(({ isCurrent }) => isCurrent)
    assert.equal(reenrolledPrimary?.schoolId, SCHOOL_PRIMARY)
    assert.equal(history.periods.length, 3)

    history = await scheduleEnrollmentTransition(
      databaseContext(`enrollment-${PROOF_RUN_ID}-secondary`),
      orgContext,
      enrollmentManage,
      {
        personId: created.personId,
        destinationSchoolId: SCHOOL_HIGH,
        transitionType: 'add_secondary',
        effectiveAt: new Date().toISOString(),
        reason: 'Concurrent secondary enrollment proof',
        applyImmediately: true,
      }
    )
    const secondary = history.periods.find(
      (period) => period.isCurrent && period.enrollmentType === 'secondary'
    )
    assert.ok(secondary)
    assert.equal(
      history.periods.filter((period) => period.isCurrent && period.enrollmentType === 'primary')
        .length,
      1
    )
    const invalidSecondaryWithdrawal = await failureMessage(
      scheduleEnrollmentTransition(
        databaseContext(`enrollment-${PROOF_RUN_ID}-secondary-withdrawal`),
        orgContext,
        enrollmentManage,
        {
          personId: created.personId,
          fromEnrollmentId: secondary.id,
          transitionType: 'withdraw',
          effectiveAt: new Date().toISOString(),
          reason: 'Invalid secondary withdrawal proof',
          expectedEnrollmentVersion: secondary.version,
          applyImmediately: true,
        }
      )
    )
    assert.equal(invalidSecondaryWithdrawal, 'ENROLLMENT_TRANSITION_INVALID')
    history = await scheduleEnrollmentTransition(
      databaseContext(`enrollment-${PROOF_RUN_ID}-end-secondary`),
      orgContext,
      enrollmentManage,
      {
        personId: created.personId,
        fromEnrollmentId: secondary.id,
        transitionType: 'end_secondary',
        effectiveAt: new Date().toISOString(),
        reason: 'End concurrent secondary enrollment proof',
        expectedEnrollmentVersion: secondary.version,
        applyImmediately: true,
      }
    )
    assert.equal(
      history.periods.filter((period) => period.isCurrent && period.enrollmentType === 'secondary')
        .length,
      0
    )

    const primaryAfterSecondary = history.periods.find(
      (period) => period.isCurrent && period.enrollmentType === 'primary'
    )
    assert.ok(primaryAfterSecondary)
    history = await scheduleEnrollmentTransition(
      databaseContext(`enrollment-${PROOF_RUN_ID}-graduate`),
      orgContext,
      enrollmentManage,
      {
        personId: created.personId,
        fromEnrollmentId: primaryAfterSecondary.id,
        transitionType: 'graduate',
        effectiveAt: new Date().toISOString(),
        reason: 'Graduation lifecycle proof',
        evidenceReference: 'proof:graduation-approved',
        expectedEnrollmentVersion: primaryAfterSecondary.version,
        applyImmediately: true,
      }
    )
    assert.equal(
      history.periods.some(({ isCurrent }) => isCurrent),
      false
    )
    const [profile] = await admin
      .select({ status: studentProfiles.status })
      .from(studentProfiles)
      .where(
        and(eq(studentProfiles.tenantId, TENANT_A), eq(studentProfiles.personId, created.personId))
      )
    assert.equal(profile?.status, 'graduated')

    const orgHistory = await getEnrollmentHistory(
      databaseContext(`enrollment-${PROOF_RUN_ID}-org-history`),
      orgContext,
      enrollmentRead,
      created.personId
    )
    const schoolHistory = await getEnrollmentHistory(
      databaseContext(`enrollment-${PROOF_RUN_ID}-school-history`, 'school'),
      schoolContext,
      schoolEnrollmentRead,
      created.personId
    )
    assert.ok(orgHistory.periods.length > schoolHistory.periods.length)
    assert.equal(
      schoolHistory.periods.every(({ schoolId }) => schoolId === SCHOOL_PRIMARY),
      true
    )

    const transitionIds = orgHistory.transitions.map(({ transitionId }) => transitionId)
    const committedAudits = await admin
      .select({ id: auditEvents.id, eventType: auditEvents.eventType })
      .from(auditEvents)
      .where(inArray(auditEvents.targetId, transitionIds))
    assert.ok(committedAudits.some(({ eventType }) => eventType === 'student.enrollment.schedule'))
    assert.ok(committedAudits.some(({ eventType }) => eventType === 'student.enrollment.apply'))
    assert.ok(committedAudits.some(({ eventType }) => eventType === 'student.enrollment.cancel'))
    const outboxRows = await admin
      .select({ id: auditOutbox.id })
      .from(auditOutbox)
      .where(
        inArray(
          auditOutbox.auditEventId,
          committedAudits.map(({ id }) => id)
        )
      )
    assert.ok(outboxRows.length > 0)

    await assert.rejects(
      admin
        .delete(schoolEnrollments)
        .where(
          and(
            eq(schoolEnrollments.tenantId, TENANT_A),
            eq(schoolEnrollments.personId, created.personId)
          )
        )
    )

    await assert.rejects(
      applyEnrollmentTransition(
        databaseContext(`enrollment-${PROOF_RUN_ID}-applied-again`),
        orgContext,
        enrollmentManage,
        orgHistory.transitions.find(({ status }) => status === 'applied')?.transitionId ?? ''
      )
    )

    console.log(
      'Enrollment lifecycle proof passed: immutable half-open history, primary/secondary concurrency, scheduled/apply/cancel events, transfer/withdrawal/re-enrollment/graduation, stale and cross-scope denial, authorization-version updates, audit rollback, outbox evidence, and direct-delete rejection.'
    )
  } catch (error) {
    failure = error
  } finally {
    const cleanup = await Promise.allSettled([
      admin
        .delete(accountSessions)
        .where(inArray(accountSessions.providerSessionId, [ORG_SESSION_ID, SCHOOL_SESSION_ID])),
      admin.delete(accountLinks).where(eq(accountLinks.accountId, LINKED_ACCOUNT_ID)),
    ])
    await admin.delete(accounts).where(eq(accounts.id, LINKED_ACCOUNT_ID))
    await Promise.allSettled([closeDatabaseExecutionPoolsForProof()])
    await admin.$client.end({ timeout: 5 })
    const cleanupFailure = cleanup.find((result) => result.status === 'rejected')
    if (!failure && cleanupFailure?.status === 'rejected') failure = cleanupFailure.reason
  }
  if (failure) throw failure
}

await runProof()
