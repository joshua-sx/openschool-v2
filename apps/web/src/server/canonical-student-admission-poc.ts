import assert from 'node:assert/strict'
import { getServerEnv } from '@openschool/config/server'
import {
  type TenantDatabaseContext,
  accountSessions,
  affiliations,
  auditEvents,
  auditOutbox,
  closeDatabaseExecutionPoolsForProof,
  createMigrationClient,
  people,
  schoolEnrollments,
  studentCompatibilityEvidence,
  studentProfiles,
  students,
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
  createStudent,
  getStudentById,
  getStudentsBySchool,
  updateStudent,
} from '../services/students'

const TENANT_A = '00000000-0000-4000-8000-000000000001'
const SCHOOL_A = '00000000-0000-4000-8000-000000000101'
const SCHOOL_A_SIBLING = '00000000-0000-4000-8000-000000000102'
const SCHOOL_B = '00000000-0000-4000-8000-000000000103'
const ACCOUNT_A = '00000000-0000-4000-8000-000000000202'
const PERSON_A = '00000000-0000-4000-8000-000000000902'
const PROOF_RUN_ID = crypto.randomUUID()
const SESSION_ID = `canonical-student-admission-${PROOF_RUN_ID}`
const STUDENT_NUMBER = `POC-${PROOF_RUN_ID.slice(0, 12)}`

function assertLocalDisposableDatabase(): void {
  if (process.env.ALLOW_CANONICAL_STUDENT_ADMISSION_POC !== 'true') {
    throw new Error(
      'Canonical admission proof refused: ALLOW_CANONICAL_STUDENT_ADMISSION_POC must be exactly "true".'
    )
  }
  const url = new URL(getServerEnv().DATABASE_RUNTIME_URL)
  if (!new Set(['127.0.0.1', 'localhost', '[::1]']).has(url.hostname)) {
    throw new Error('Canonical admission proof refused: database host must be loopback.')
  }
}

function policyContext(): PolicyContext {
  return Object.freeze({
    accountId: ACCOUNT_A,
    personId: PERSON_A,
    tenantId: TENANT_A,
    roleTemplateKeys: ['school_admin'],
    assuranceLevel: 'aal1',
    activeSchoolId: SCHOOL_A,
  })
}

function databaseContext(requestId: string): TenantDatabaseContext {
  return Object.freeze({
    accountId: ACCOUNT_A,
    personId: PERSON_A,
    tenantId: TENANT_A,
    sessionId: SESSION_ID,
    requestId,
    assuranceLevel: 'aal1',
    membershipVersion: 1,
    securityVersion: 1,
    contextPolicyVersion: 1,
    activeSchoolId: SCHOOL_A,
  })
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
  if (decision.effect !== 'allow') throw new Error('CANONICAL_ADMISSION_POC_POLICY_DENIED')
  return decision
}

function sqlState(error: unknown): string | undefined {
  let current = error
  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== 'object') return undefined
    if ('code' in current && typeof current.code === 'string' && /^\w{5}$/.test(current.code)) {
      return current.code
    }
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

async function failureFingerprint(operation: Promise<unknown>): Promise<string> {
  try {
    await operation
  } catch (error) {
    assert.ok(error instanceof Error)
    const code = 'code' in error && typeof error.code === 'string' ? error.code : 'ERROR'
    return `${code}:${error.message}`
  }
  assert.fail('Expected operation to fail')
}

async function runProof(): Promise<void> {
  assertLocalDisposableDatabase()
  const admin = createMigrationClient()
  const context = policyContext()
  const now = new Date()

  try {
    await admin.insert(accountSessions).values({
      accountId: ACCOUNT_A,
      providerSessionId: SESSION_ID,
      status: 'active',
      assuranceLevel: 'aal1',
      securityVersion: 1,
      authenticatedAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    })

    const createDecision = allow(context, CAPABILITIES.STUDENTS_CREATE, {
      kind: 'school',
      tenantId: TENANT_A,
      schoolId: SCHOOL_A,
    })
    const createRequestId = `canonical-admission-${PROOF_RUN_ID}-create`
    const created = await createStudent(databaseContext(createRequestId), context, createDecision, {
      schoolId: SCHOOL_A,
      firstName: '  Ada  ',
      lastName: '  Canonical   Proof  ',
      dateOfBirth: '1984-04-12',
      studentNumber: ` ${STUDENT_NUMBER} `,
      email: ' Ada.Canonical@Example.Test ',
    })
    assert.equal(created.id, created.personId)
    assert.notEqual(created.id, created.legacyStudentId)
    assert.equal(created.firstName, 'Ada')
    assert.equal(created.lastName, 'Canonical Proof')
    assert.equal(created.studentNumber, STUDENT_NUMBER)
    assert.equal(created.email, 'Ada.Canonical@Example.Test')
    assert.equal(created.schoolId, SCHOOL_A)
    assert.equal(created.source, 'canonical')
    assert.equal(created.parityStatus, 'matched')

    const readDecision = allow(context, CAPABILITIES.STUDENTS_READ, {
      kind: 'student',
      tenantId: TENANT_A,
      schoolId: SCHOOL_A,
      studentId: created.personId,
    })
    const readContext = databaseContext(`canonical-admission-${PROOF_RUN_ID}-read`)
    const byPerson = await getStudentById(readContext, context, readDecision, created.personId)
    const byLegacy = await getStudentById(
      readContext,
      context,
      readDecision,
      created.legacyStudentId
    )
    assert.equal(byPerson?.personId, created.personId)
    assert.equal(byLegacy?.personId, created.personId)
    assert.equal(byLegacy?.legacyStudentId, created.legacyStudentId)
    assert.equal(
      (await getStudentsBySchool(readContext, context, readDecision, SCHOOL_A)).some(
        ({ personId }) => personId === created.personId
      ),
      true
    )

    const [person] = await admin
      .select()
      .from(people)
      .where(and(eq(people.tenantId, TENANT_A), eq(people.id, created.personId)))
    const [profile] = await admin
      .select()
      .from(studentProfiles)
      .where(
        and(eq(studentProfiles.tenantId, TENANT_A), eq(studentProfiles.personId, created.personId))
      )
    const [affiliation] = await admin
      .select()
      .from(affiliations)
      .where(
        and(eq(affiliations.tenantId, TENANT_A), eq(affiliations.id, created.studentAffiliationId))
      )
    const [enrollment] = await admin
      .select()
      .from(schoolEnrollments)
      .where(
        and(
          eq(schoolEnrollments.tenantId, TENANT_A),
          eq(schoolEnrollments.id, created.schoolEnrollmentId)
        )
      )
    const [legacy] = await admin
      .select()
      .from(students)
      .where(and(eq(students.tenantId, TENANT_A), eq(students.id, created.legacyStudentId)))
    assert.equal(person?.legacyStudentId, created.legacyStudentId)
    assert.equal(profile?.legacyStudentId, created.legacyStudentId)
    assert.equal(affiliation?.personId, created.personId)
    assert.equal(affiliation?.schoolId, SCHOOL_A)
    assert.equal(enrollment?.personId, created.personId)
    assert.equal(enrollment?.status, 'enrolled')
    assert.equal(enrollment?.source, 'native')
    assert.equal(legacy?.firstName, created.firstName)
    assert.equal(legacy?.studentNumber, STUDENT_NUMBER)

    const updateDecision = allow(context, CAPABILITIES.STUDENTS_UPDATE, {
      kind: 'student',
      tenantId: TENANT_A,
      schoolId: SCHOOL_A,
      studentId: created.personId,
    })
    const updated = await updateStudent(
      databaseContext(`canonical-admission-${PROOF_RUN_ID}-update`),
      context,
      updateDecision,
      created.personId,
      { email: 'updated.canonical@example.test' }
    )
    assert.equal(updated.email, 'updated.canonical@example.test')
    assert.equal(updated.parityStatus, 'matched')
    assert.equal('displayName' in updated, false)
    assert.equal('normalizedDisplayName' in updated, false)
    assert.equal('normalizedEmail' in updated, false)

    const evidence = await admin
      .select({ operation: studentCompatibilityEvidence.operation })
      .from(studentCompatibilityEvidence)
      .where(
        and(
          eq(studentCompatibilityEvidence.tenantId, TENANT_A),
          eq(studentCompatibilityEvidence.personId, created.personId)
        )
      )
    assert.deepEqual(evidence.map(({ operation }) => operation).sort(), ['create', 'update'])
    const mutationEvents = await admin
      .select({ eventType: auditEvents.eventType, id: auditEvents.id })
      .from(auditEvents)
      .where(and(eq(auditEvents.tenantId, TENANT_A), eq(auditEvents.targetId, created.personId)))
    assert.equal(
      mutationEvents.some(({ eventType }) => eventType === 'student.create'),
      true
    )
    assert.equal(
      mutationEvents.some(({ eventType }) => eventType === 'student.update'),
      true
    )
    const mutationEventIds = mutationEvents.map(({ id }) => id)
    const outboxRows = await admin
      .select({ eventId: auditOutbox.auditEventId })
      .from(auditOutbox)
      .where(inArray(auditOutbox.auditEventId, mutationEventIds))
    assert.equal(outboxRows.length, 2)

    const siblingFailure = await failureFingerprint(
      createStudent(
        databaseContext(`canonical-admission-${PROOF_RUN_ID}-sibling`),
        context,
        createDecision,
        { schoolId: SCHOOL_A_SIBLING, firstName: 'Denied', lastName: 'Sibling' }
      )
    )
    const crossTenantFailure = await failureFingerprint(
      createStudent(
        databaseContext(`canonical-admission-${PROOF_RUN_ID}-cross-tenant`),
        context,
        createDecision,
        { schoolId: SCHOOL_B, firstName: 'Denied', lastName: 'Cross Tenant' }
      )
    )
    assert.equal(siblingFailure, crossTenantFailure)
    assert.equal(siblingFailure, 'FORBIDDEN:POLICY_SCOPE_MISMATCH')

    const duplicateName = `atomic duplicate ${PROOF_RUN_ID}`
    const [beforeDuplicate] = await admin.execute<{ count: number }>(sql`
      select count(*)::int as count
      from people
      where tenant_id = ${TENANT_A}::uuid
        and normalized_display_name = ${duplicateName}
    `)
    await assert.rejects(
      createStudent(
        databaseContext(`canonical-admission-${PROOF_RUN_ID}-duplicate`),
        context,
        createDecision,
        {
          schoolId: SCHOOL_A,
          firstName: 'Atomic',
          lastName: `Duplicate ${PROOF_RUN_ID}`,
          studentNumber: STUDENT_NUMBER,
        }
      ),
      (error: unknown) => error instanceof Error && 'code' in error && error.code === 'CONFLICT'
    )
    const [afterDuplicate] = await admin.execute<{ count: number }>(sql`
      select count(*)::int as count
      from people
      where tenant_id = ${TENANT_A}::uuid
        and normalized_display_name = ${duplicateName}
    `)
    assert.equal(beforeDuplicate?.count, 0)
    assert.equal(afterDuplicate?.count, 0)

    await expectSqlState(
      withPolicyTenantTransaction(
        databaseContext(`canonical-admission-${PROOF_RUN_ID}-raw-legacy`),
        toDatabasePolicyContext(createDecision),
        (transaction) =>
          transaction.insert(students).values({
            tenantId: TENANT_A,
            schoolId: SCHOOL_A,
            firstName: 'Raw',
            lastName: 'Rejected',
          })
      ),
      '42501'
    )
    await expectSqlState(
      withPolicyTenantTransaction(
        databaseContext(`canonical-admission-${PROOF_RUN_ID}-raw-enrollment`),
        toDatabasePolicyContext(updateDecision),
        (transaction) =>
          transaction
            .update(schoolEnrollments)
            .set({ admissionReason: 'Raw write rejected' })
            .where(eq(schoolEnrollments.id, created.schoolEnrollmentId))
      ),
      '42501'
    )

    console.log(
      'Canonical admission proof passed: atomic Person/Profile/School Enrollment/Affiliation creation, legacy parity, canonical and compatibility reads, audited update/outbox, indistinguishable scope denial, duplicate rollback, and direct-write rejection.'
    )
  } finally {
    await closeDatabaseExecutionPoolsForProof()
    await admin.delete(accountSessions).where(eq(accountSessions.providerSessionId, SESSION_ID))
    await admin.$client.end({ timeout: 5 })
  }
}

await runProof()
