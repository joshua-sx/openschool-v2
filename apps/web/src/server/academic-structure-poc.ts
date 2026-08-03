import assert from 'node:assert/strict'
import { getServerEnv } from '@openschool/config/server'
import {
  type TenantDatabaseContext,
  academicYears,
  accountSessions,
  auditEvents,
  auditOutbox,
  closeDatabaseExecutionPoolsForProof,
  createMigrationClient,
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
import {
  closeAcademicYear,
  createAcademicYear,
  getAcademicYears,
  publishAcademicYear,
} from '../services/academic-structure'
import { toDatabasePolicyContext } from '../services/database-context'

const TENANT_A = '00000000-0000-4000-8000-000000000001'
const TENANT_B = '00000000-0000-4000-8000-000000000002'
const SCHOOL_PRIMARY = '00000000-0000-4000-8000-000000000101'
const SCHOOL_HIGH = '00000000-0000-4000-8000-000000000102'
const SCHOOL_CROSS_TENANT = '00000000-0000-4000-8000-000000000103'
const ORG_ROOT = '00000000-0000-4000-8000-000000000001'
const SCHOOL_ADMIN_ACCOUNT = '00000000-0000-4000-8000-000000000202'
const SCHOOL_ADMIN_PERSON = '00000000-0000-4000-8000-000000000902'
const ORG_ADMIN_ACCOUNT = '00000000-0000-4000-8000-000000000201'
const ORG_ADMIN_PERSON = '00000000-0000-4000-8000-000000000901'
const PROOF_RUN_ID = crypto.randomUUID()
const SCHOOL_SESSION_ID = `academic-structure-school-${PROOF_RUN_ID}`
const ORG_SESSION_ID = `academic-structure-org-${PROOF_RUN_ID}`

function assertLocalDisposableDatabase(): void {
  if (process.env.ALLOW_ACADEMIC_STRUCTURE_POC !== 'true') {
    throw new Error(
      'Academic structure proof refused: ALLOW_ACADEMIC_STRUCTURE_POC must be exactly "true".'
    )
  }
  const url = new URL(getServerEnv().DATABASE_RUNTIME_URL)
  if (!new Set(['127.0.0.1', 'localhost', '[::1]']).has(url.hostname)) {
    throw new Error('Academic structure proof refused: database host must be loopback.')
  }
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

function orgPolicyContext(): PolicyContext {
  return Object.freeze({
    accountId: ORG_ADMIN_ACCOUNT,
    personId: ORG_ADMIN_PERSON,
    tenantId: TENANT_A,
    roleTemplateKeys: ['org_admin'],
    assuranceLevel: 'aal2',
    activeEducationOrganizationId: ORG_ROOT,
  })
}

function databaseContext(
  requestId: string,
  actor: 'school' | 'organization' = 'school'
): TenantDatabaseContext {
  const school = actor === 'school'
  return Object.freeze({
    accountId: school ? SCHOOL_ADMIN_ACCOUNT : ORG_ADMIN_ACCOUNT,
    personId: school ? SCHOOL_ADMIN_PERSON : ORG_ADMIN_PERSON,
    tenantId: TENANT_A,
    sessionId: school ? SCHOOL_SESSION_ID : ORG_SESSION_ID,
    requestId,
    assuranceLevel: 'aal2',
    membershipVersion: 1,
    securityVersion: 1,
    contextPolicyVersion: 1,
    ...(school ? { activeSchoolId: SCHOOL_PRIMARY } : { activeEducationOrganizationId: ORG_ROOT }),
  })
}

function allow(
  context: PolicyContext,
  capability: (typeof CAPABILITIES)[keyof typeof CAPABILITIES]
): Extract<PolicyDecision, { effect: 'allow' }> {
  const decision = evaluatePolicy({
    bundle: CURRENT_POLICY_BUNDLE,
    context,
    capability,
    requestedScope: 'school',
    resource: { kind: 'academic_structure', tenantId: TENANT_A },
  })
  assert.equal(decision.effect, 'allow', `${capability} must be allowed in the proof`)
  if (decision.effect !== 'allow') throw new Error('ACADEMIC_STRUCTURE_POC_POLICY_DENIED')
  return decision
}

function academicDraft(
  suffix: string,
  startDate: string,
  endDate: string,
  options: { schoolId?: string; termName?: string; levelName?: string } = {}
) {
  return {
    schoolId: options.schoolId ?? SCHOOL_PRIMARY,
    code: `POC-${suffix}-${PROOF_RUN_ID.slice(0, 8)}`,
    name: `Proof Academic Year ${suffix}`,
    timeZone: 'America/Lower_Princes',
    startDate,
    endDate,
    terms: [
      {
        code: 'T1',
        name: options.termName ?? 'Term 1',
        startDate,
        endDate,
      },
    ],
    levels: [
      {
        code: 'L1',
        name: options.levelName ?? 'Grade 5',
        educationStage: 'Proof stage',
      },
    ],
  }
}

function localDateInTimeZone(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const byType = new Map(parts.map((part) => [part.type, part.value]))
  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function sqlState(error: unknown): string | undefined {
  let current = error
  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== 'object') return undefined
    if (
      'code' in current &&
      typeof current.code === 'string' &&
      /^[0-9A-Z]{5}$/.test(current.code)
    ) {
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
  const schoolContext = schoolPolicyContext()
  const orgContext = orgPolicyContext()
  const schoolRead = allow(schoolContext, CAPABILITIES.ACADEMIC_STRUCTURE_READ)
  const schoolManage = allow(schoolContext, CAPABILITIES.ACADEMIC_STRUCTURE_MANAGE)
  const orgRead = allow(orgContext, CAPABILITIES.ACADEMIC_STRUCTURE_READ)
  const now = new Date()

  try {
    await admin.insert(accountSessions).values([
      {
        accountId: SCHOOL_ADMIN_ACCOUNT,
        providerSessionId: SCHOOL_SESSION_ID,
        status: 'active',
        assuranceLevel: 'aal2',
        securityVersion: 1,
        authenticatedAt: now,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      },
      {
        accountId: ORG_ADMIN_ACCOUNT,
        providerSessionId: ORG_SESSION_ID,
        status: 'active',
        assuranceLevel: 'aal2',
        securityVersion: 1,
        authenticatedAt: now,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      },
    ])

    const primaryYears = await getAcademicYears(
      databaseContext(`academic-${PROOF_RUN_ID}-primary-read`),
      schoolContext,
      schoolRead,
      SCHOOL_PRIMARY
    )
    assert.equal(
      primaryYears.some(({ levels }) => levels.some(({ name }) => name === 'Grade 5')),
      true
    )

    const highYears = await getAcademicYears(
      databaseContext(`academic-${PROOF_RUN_ID}-high-read`, 'organization'),
      orgContext,
      orgRead,
      SCHOOL_HIGH
    )
    assert.equal(
      highYears.some(({ terms }) => terms.some(({ name }) => name === 'Semester 1')),
      true
    )
    assert.equal(
      highYears.some(({ levels }) => levels.some(({ name }) => name === 'Form 5')),
      true
    )

    const siblingReadFailure = await failureFingerprint(
      getAcademicYears(
        databaseContext(`academic-${PROOF_RUN_ID}-sibling-read`),
        schoolContext,
        schoolRead,
        SCHOOL_HIGH
      )
    )
    const crossTenantReadFailure = await failureFingerprint(
      getAcademicYears(
        databaseContext(`academic-${PROOF_RUN_ID}-cross-read`),
        schoolContext,
        schoolRead,
        SCHOOL_CROSS_TENANT
      )
    )
    assert.equal(siblingReadFailure, 'FORBIDDEN:POLICY_SCOPE_MISMATCH')
    assert.equal(crossTenantReadFailure, siblingReadFailure)

    const currentAtStart = primaryYears.filter(({ isCurrent }) => isCurrent)
    assert.ok(currentAtStart.length <= 1)
    if (currentAtStart.length === 0) {
      const today = localDateInTimeZone(now, 'America/Lower_Princes')
      const currentProof = await createAcademicYear(
        databaseContext(`academic-${PROOF_RUN_ID}-current-create`),
        schoolContext,
        schoolManage,
        academicDraft('CURRENT', today, today)
      )
      await publishAcademicYear(
        databaseContext(`academic-${PROOF_RUN_ID}-current-publish`),
        schoolContext,
        schoolManage,
        currentProof.id
      )
    }
    const afterCurrentPublish = await getAcademicYears(
      databaseContext(`academic-${PROOF_RUN_ID}-current-read`),
      schoolContext,
      schoolRead,
      SCHOOL_PRIMARY
    )
    assert.equal(afterCurrentPublish.filter(({ isCurrent }) => isCurrent).length, 1)

    const latestKnownEnd = afterCurrentPublish.reduce(
      (latest, { endDate }) => (endDate > latest ? endDate : latest),
      '1970-01-01'
    )
    const lifecycleStart = addDays(latestKnownEnd, 30)
    const lifecycleEnd = addDays(lifecycleStart, 30)
    const lifecycle = await createAcademicYear(
      databaseContext(`academic-${PROOF_RUN_ID}-lifecycle-create`),
      schoolContext,
      schoolManage,
      academicDraft('LIFECYCLE', lifecycleStart, lifecycleEnd)
    )
    const publishedLifecycle = await publishAcademicYear(
      databaseContext(`academic-${PROOF_RUN_ID}-lifecycle-publish`),
      schoolContext,
      schoolManage,
      lifecycle.id
    )
    assert.equal(publishedLifecycle.status, 'published')

    const overlap = await createAcademicYear(
      databaseContext(`academic-${PROOF_RUN_ID}-overlap-create`),
      schoolContext,
      schoolManage,
      academicDraft('OVERLAP', addDays(lifecycleStart, 1), addDays(lifecycleEnd, -1))
    )
    const overlapFailure = await failureFingerprint(
      publishAcademicYear(
        databaseContext(`academic-${PROOF_RUN_ID}-overlap-publish`),
        schoolContext,
        schoolManage,
        overlap.id
      )
    )
    assert.match(overlapFailure, /^CONFLICT:These dates overlap/)

    const concurrentStart = addDays(lifecycleEnd, 30)
    const concurrentEnd = addDays(concurrentStart, 30)
    const [concurrentA, concurrentB] = await Promise.all([
      createAcademicYear(
        databaseContext(`academic-${PROOF_RUN_ID}-concurrent-a-create`),
        schoolContext,
        schoolManage,
        academicDraft('CONCURRENT-A', concurrentStart, concurrentEnd)
      ),
      createAcademicYear(
        databaseContext(`academic-${PROOF_RUN_ID}-concurrent-b-create`),
        schoolContext,
        schoolManage,
        academicDraft('CONCURRENT-B', concurrentStart, concurrentEnd)
      ),
    ])
    const concurrentResults = await Promise.allSettled([
      publishAcademicYear(
        databaseContext(`academic-${PROOF_RUN_ID}-concurrent-a-publish`),
        schoolContext,
        schoolManage,
        concurrentA.id
      ),
      publishAcademicYear(
        databaseContext(`academic-${PROOF_RUN_ID}-concurrent-b-publish`),
        schoolContext,
        schoolManage,
        concurrentB.id
      ),
    ])
    assert.equal(concurrentResults.filter(({ status }) => status === 'fulfilled').length, 1)
    assert.equal(concurrentResults.filter(({ status }) => status === 'rejected').length, 1)

    const closed = await closeAcademicYear(
      databaseContext(`academic-${PROOF_RUN_ID}-lifecycle-close`),
      schoolContext,
      schoolManage,
      lifecycle.id,
      'Proof cycle completed'
    )
    assert.equal(closed.status, 'closed')
    assert.equal(closed.terms.length, 1)
    assert.equal(closed.levels.length, 1)
    assert.match(
      await failureFingerprint(
        publishAcademicYear(
          databaseContext(`academic-${PROOF_RUN_ID}-history-republish`),
          schoolContext,
          schoolManage,
          lifecycle.id
        )
      ),
      /^CONFLICT:/
    )

    await expectSqlState(
      withPolicyTenantTransaction(
        databaseContext(`academic-${PROOF_RUN_ID}-raw-insert`),
        toDatabasePolicyContext(schoolManage),
        (transaction) =>
          transaction.insert(academicYears).values({
            tenantId: TENANT_A,
            schoolId: SCHOOL_PRIMARY,
            code: `RAW-${PROOF_RUN_ID.slice(0, 8)}`,
            name: 'Raw rejected year',
            timeZone: 'UTC',
            startDate: '2031-01-01',
            endDate: '2031-12-31',
            createdByAccountId: SCHOOL_ADMIN_ACCOUNT,
          })
      ),
      '42501'
    )
    await expectSqlState(
      withPolicyTenantTransaction(
        databaseContext(`academic-${PROOF_RUN_ID}-raw-history-update`),
        toDatabasePolicyContext(schoolManage),
        (transaction) =>
          transaction
            .update(academicYears)
            .set({ name: 'Rewritten history' })
            .where(eq(academicYears.id, lifecycle.id))
      ),
      '42501'
    )

    const plan = await admin.transaction(async (transaction) => {
      await transaction.execute(sql`set local enable_seqscan = off`)
      return transaction.execute<Record<string, unknown>>(sql`
        explain (analyze, buffers, format json)
        select id, status, start_date, end_date
        from academic_years
        where tenant_id = ${TENANT_A}::uuid
          and school_id = ${SCHOOL_PRIMARY}::uuid
        order by status, start_date, end_date, id
        limit 50
      `)
    })
    assert.match(JSON.stringify(plan), /academic_years_tenant_school_status_dates_idx/)

    const targetIds = [lifecycle.id, overlap.id, concurrentA.id, concurrentB.id]
    const events = await admin
      .select({ id: auditEvents.id, eventType: auditEvents.eventType })
      .from(auditEvents)
      .where(and(eq(auditEvents.tenantId, TENANT_A), inArray(auditEvents.targetId, targetIds)))
    assert.equal(
      events.some(({ eventType }) => eventType === 'academic_year.create'),
      true
    )
    assert.equal(
      events.some(({ eventType }) => eventType === 'academic_year.publish'),
      true
    )
    assert.equal(
      events.some(({ eventType }) => eventType === 'academic_year.close'),
      true
    )
    const outbox = await admin
      .select({ id: auditOutbox.id })
      .from(auditOutbox)
      .where(
        inArray(
          auditOutbox.auditEventId,
          events.map(({ id }) => id)
        )
      )
    assert.ok(outbox.length >= 7)

    console.log(
      `Academic structure proof passed: shared primary/high primitives, local-current derivation, sibling and cross-Tenant denial, invalid overlap rejection, concurrent publication serialization, immutable history, direct-write denial, atomic audit/outbox, and indexed plan evidence. tenantB=${TENANT_B}`
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
