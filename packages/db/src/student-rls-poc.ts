import assert from 'node:assert/strict'
import { getServerEnv } from '@openschool/config/server'
import { eq, inArray, sql } from 'drizzle-orm'
import postgres from 'postgres'
import {
  type DatabasePolicyContext,
  type DatabasePolicyQueryConstraint,
  type DatabaseTransaction,
  type TenantDatabaseContext,
  TenantDatabaseError,
  type WorkerDatabaseContext,
  accountLinks,
  accountSessions,
  accounts,
  createDatabaseExecutionProofHarness,
  createMigrationClient,
  students,
} from './index'

const TENANT_A = '00000000-0000-4000-8000-000000000001'
const TENANT_B = '00000000-0000-4000-8000-000000000002'
const SCHOOL_A_PRIMARY = '00000000-0000-4000-8000-000000000101'
const SCHOOL_A_HIGH = '00000000-0000-4000-8000-000000000102'
const SCHOOL_B = '00000000-0000-4000-8000-000000000103'
const CLASS_A_HIGH = '00000000-0000-4000-8000-000000000302'
const STUDENT_A_PRIMARY = '00000000-0000-4000-8000-000000000401'
const STUDENT_A_HIGH = '00000000-0000-4000-8000-000000000402'
const STUDENT_B = '00000000-0000-4000-8000-000000000403'
const PERSON_STUDENT_A_HIGH = '00000000-0000-4000-8000-000000000912'
const REQUEST_ID = '00000000-0000-4000-8000-000000000299'
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000499'
const POLICY_VERSION = 'student-rls-poc.v1'
const PROOF_RUN_ID = crypto.randomUUID()
const PROOF_STUDENT_ACCOUNT = crypto.randomUUID()
const PROOF_STUDENT_ID = crypto.randomUUID()
const PROOF_EMAIL = `student-rls-${PROOF_RUN_ID}@proof.test`
const PROOF_ACCOUNTS = [
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000202',
  '00000000-0000-4000-8000-000000000203',
  '00000000-0000-4000-8000-000000000205',
  '00000000-0000-4000-8000-000000000207',
  PROOF_STUDENT_ACCOUNT,
] as const

function proofSessionId(accountId: string): string {
  return `student-rls-${PROOF_RUN_ID}-${accountId}`
}

function assertLocalDisposableDatabase(): void {
  if (process.env.ALLOW_STUDENT_RLS_POC !== 'true') {
    throw new Error('Student RLS proof refused: ALLOW_STUDENT_RLS_POC must be exactly "true".')
  }
  const databaseUrl = new URL(getServerEnv().DATABASE_RUNTIME_URL)
  if (!new Set(['127.0.0.1', 'localhost', '[::1]']).has(databaseUrl.hostname)) {
    throw new Error('Student RLS proof refused: database host must be loopback.')
  }
}

function tenantContext(
  accountId: string,
  personId: string,
  tenantId: string,
  selectors: Pick<TenantDatabaseContext, 'activeEducationOrganizationId' | 'activeSchoolId'> = {}
): TenantDatabaseContext {
  return {
    accountId,
    personId,
    tenantId,
    sessionId: proofSessionId(accountId),
    requestId: REQUEST_ID,
    assuranceLevel: 'aal1',
    membershipVersion: 1,
    securityVersion: 1,
    contextPolicyVersion: 1,
    ...selectors,
  }
}

function policy(
  capability: DatabasePolicyContext['capability'],
  ...queryConstraints: readonly DatabasePolicyQueryConstraint[]
): DatabasePolicyContext {
  return { capability, policyVersion: POLICY_VERSION, queryConstraints }
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

async function expectSqlState(operation: Promise<unknown>, expected: string): Promise<string> {
  try {
    await operation
  } catch (error) {
    assert.equal(sqlState(error), expected)
    return expected
  }
  assert.fail(`Expected PostgreSQL SQLSTATE ${expected}`)
}

async function visibleStudentIds(transaction: DatabaseTransaction): Promise<string[]> {
  return (await transaction.select({ id: students.id }).from(students).orderBy(students.id)).map(
    ({ id }) => id
  )
}

async function visibleStudentCount(transaction: DatabaseTransaction): Promise<number> {
  const [row] = await transaction.select({ count: sql<number>`count(*)::int` }).from(students)
  return row?.count ?? 0
}

function collectPlanIndexNames(value: unknown, names = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectPlanIndexNames(item, names)
    return names
  }
  if (typeof value !== 'object' || value === null) return names
  for (const [key, child] of Object.entries(value)) {
    if (key === 'Index Name' && typeof child === 'string') names.add(child)
    else collectPlanIndexNames(child, names)
  }
  return names
}

function explainDocument(value: unknown): Record<string, unknown> {
  const parsed = typeof value === 'string' ? (JSON.parse(value) as unknown) : value
  assert.ok(Array.isArray(parsed) && parsed.length === 1)
  const document = parsed[0]
  assert.ok(typeof document === 'object' && document !== null)
  return document as Record<string, unknown>
}

async function provePolicyMetadata(admin: ReturnType<typeof createMigrationClient>): Promise<void> {
  const relations = await admin.execute<{
    relforcerowsecurity: boolean
    relname: string
    relrowsecurity: boolean
  }>(sql`
    select relname, relrowsecurity, relforcerowsecurity
    from pg_class
    where relname in ('schools', 'students')
    order by relname
  `)
  assert.deepEqual(
    relations.map((relation) => ({
      name: relation.relname,
      enabled: relation.relrowsecurity,
      forced: relation.relforcerowsecurity,
    })),
    [
      { name: 'schools', enabled: true, forced: true },
      { name: 'students', enabled: true, forced: true },
    ]
  )

  const policies = await admin.execute<{ policyname: string }>(sql`
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename in ('schools', 'students')
    order by policyname
  `)
  assert.deepEqual(
    policies.map(({ policyname }) => policyname),
    [
      'schools_identity_revoker_select',
      'schools_runtime_delete_deny',
      'schools_runtime_insert_deny',
      'schools_runtime_select',
      'schools_runtime_update_deny',
      'schools_support_manager_select',
      'schools_worker_delete_deny',
      'schools_worker_insert_deny',
      'schools_worker_select',
      'schools_worker_update_deny',
      'students_runtime_delete',
      'students_runtime_insert',
      'students_runtime_select',
      'students_runtime_update',
      'students_worker_delete_deny',
      'students_worker_insert_deny',
      'students_worker_select',
      'students_worker_update_deny',
    ]
  )

  const [privileges] = await admin.execute<{
    publicCanExecute: boolean
    runtimeCanExecute: boolean
  }>(sql`
    select
      has_function_privilege(
        'public', 'public.openschool_student_scope_allows(uuid, uuid, uuid)', 'EXECUTE'
      ) as "publicCanExecute",
      has_function_privilege(
        'openschool_runtime',
        'public.openschool_student_scope_allows(uuid, uuid, uuid)',
        'EXECUTE'
      ) as "runtimeCanExecute"
  `)
  assert.equal(privileges?.publicCanExecute, false)
  assert.equal(privileges?.runtimeCanExecute, true)
}

async function seedProofData(admin: ReturnType<typeof createMigrationClient>): Promise<void> {
  const now = new Date()
  await admin.insert(accounts).values({
    id: PROOF_STUDENT_ACCOUNT,
    identityProvider: 'proof',
    providerSubject: `student-rls-${PROOF_RUN_ID}`,
    primaryEmail: PROOF_EMAIL,
  })
  await admin.insert(accountLinks).values({
    tenantId: TENANT_A,
    accountId: PROOF_STUDENT_ACCOUNT,
    personId: PERSON_STUDENT_A_HIGH,
    status: 'active',
    validFrom: now,
    issuanceReason: 'Student forced-RLS proof',
    activatedAt: now,
  })
  await admin.insert(accountSessions).values(
    PROOF_ACCOUNTS.map((accountId) => ({
      accountId,
      providerSessionId: proofSessionId(accountId),
      status: 'active' as const,
      assuranceLevel: 'aal1' as const,
      securityVersion: 1,
      authenticatedAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    }))
  )

  await admin.execute(sql`
    insert into students (id, tenant_id, school_id, first_name, last_name, email)
    select gen_random_uuid(), ${TENANT_A}::uuid, ${SCHOOL_A_PRIMARY}::uuid,
      'RLS performance', 'Primary', ${PROOF_EMAIL}
    from generate_series(1, 100)
  `)
  await admin.execute(sql`
    insert into students (id, tenant_id, school_id, first_name, last_name, email)
    select gen_random_uuid(), ${TENANT_A}::uuid, ${SCHOOL_A_HIGH}::uuid,
      'RLS performance', 'High', ${PROOF_EMAIL}
    from generate_series(1, 1000)
  `)
  await admin.execute(sql`
    insert into students (id, tenant_id, school_id, first_name, last_name, email)
    select gen_random_uuid(), ${TENANT_B}::uuid, ${SCHOOL_B}::uuid,
      'RLS performance', 'Other Tenant', ${PROOF_EMAIL}
    from generate_series(1, 1000)
  `)
  await admin.execute(sql`analyze students`)
}

async function runProof(admin: ReturnType<typeof createMigrationClient>): Promise<void> {
  const runtime = createDatabaseExecutionProofHarness('runtime', 2)
  const worker = createDatabaseExecutionProofHarness('worker', 1)
  const serverEnvironment = getServerEnv()
  const rawRuntime = postgres(serverEnvironment.DATABASE_RUNTIME_URL, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
  })

  const organizationAdmin = tenantContext(
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000901',
    TENANT_A,
    { activeEducationOrganizationId: TENANT_A }
  )
  const schoolAdmin = tenantContext(
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000902',
    TENANT_A,
    { activeSchoolId: SCHOOL_A_PRIMARY }
  )
  const teacher = tenantContext(
    '00000000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000903',
    TENANT_A,
    { activeSchoolId: SCHOOL_A_HIGH }
  )
  const guardian = tenantContext(
    '00000000-0000-4000-8000-000000000205',
    '00000000-0000-4000-8000-000000000906',
    TENANT_A,
    { activeSchoolId: SCHOOL_A_HIGH }
  )
  const student = tenantContext(PROOF_STUDENT_ACCOUNT, PERSON_STUDENT_A_HIGH, TENANT_A, {
    activeSchoolId: SCHOOL_A_HIGH,
  })
  const tenantBAdmin = tenantContext(
    '00000000-0000-4000-8000-000000000207',
    '00000000-0000-4000-8000-000000000908',
    TENANT_B,
    { activeSchoolId: SCHOOL_B }
  )

  try {
    await provePolicyMetadata(admin)

    assert.equal((await rawRuntime`select id from students limit 1`).length, 0)
    assert.equal((await rawRuntime`select id from schools limit 1`).length, 0)
    await rawRuntime`set row_security = off`
    await expectSqlState(rawRuntime`select id from students limit 1`, '42501')
    await rawRuntime`set row_security = on`

    assert.deepEqual(
      await runtime.withTenantTransaction(schoolAdmin, visibleStudentIds),
      [],
      'A canonical Tenant context without an allowed Policy Decision must see no Students.'
    )

    const organizationIds = await runtime.withPolicyTenantTransaction(
      organizationAdmin,
      policy('tenant.students.read', {
        kind: 'organization_subtree',
        tenantId: TENANT_A,
        ancestorOrganizationId: TENANT_A,
      }),
      visibleStudentIds
    )
    assert.equal(organizationIds.includes(STUDENT_A_PRIMARY), true)
    assert.equal(organizationIds.includes(STUDENT_A_HIGH), true)
    assert.equal(organizationIds.includes(STUDENT_B), false)
    assert.equal(organizationIds.length, 1102)

    const schoolPolicy = policy('tenant.students.read', {
      kind: 'school',
      tenantId: TENANT_A,
      schoolId: SCHOOL_A_PRIMARY,
    })
    const schoolIds = await runtime.withPolicyTenantTransaction(
      schoolAdmin,
      schoolPolicy,
      visibleStudentIds
    )
    assert.equal(schoolIds.includes(STUDENT_A_PRIMARY), true)
    assert.equal(schoolIds.includes(STUDENT_A_HIGH), false)
    assert.equal(schoolIds.includes(STUDENT_B), false)
    assert.equal(schoolIds.length, 101)

    const teacherIds = await runtime.withPolicyTenantTransaction(
      teacher,
      policy('tenant.students.read', {
        kind: 'class',
        tenantId: TENANT_A,
        actorPersonId: teacher.personId,
        classId: CLASS_A_HIGH,
        schoolId: SCHOOL_A_HIGH,
      }),
      visibleStudentIds
    )
    assert.deepEqual(teacherIds, [STUDENT_A_HIGH])

    const guardianIds = await runtime.withPolicyTenantTransaction(
      guardian,
      policy('tenant.students.read', {
        kind: 'linked_student',
        tenantId: TENANT_A,
        guardianPersonId: guardian.personId,
      }),
      visibleStudentIds
    )
    assert.deepEqual(guardianIds, [STUDENT_A_HIGH])

    const selfIds = await runtime.withPolicyTenantTransaction(
      student,
      policy('tenant.students.read', {
        kind: 'self',
        tenantId: TENANT_A,
        personId: student.personId,
      }),
      visibleStudentIds
    )
    assert.deepEqual(selfIds, [STUDENT_A_HIGH])

    const tenantBCount = await runtime.withPolicyTenantTransaction(
      tenantBAdmin,
      policy('tenant.students.read', { kind: 'tenant', tenantId: TENANT_B }),
      visibleStudentCount
    )
    assert.equal(tenantBCount, 1001)

    const wrongTenantContext = { ...organizationAdmin, tenantId: TENANT_B }
    await assert.rejects(
      runtime.withPolicyTenantTransaction(
        wrongTenantContext,
        policy('tenant.students.read', { kind: 'tenant', tenantId: TENANT_B }),
        visibleStudentIds
      ),
      (error: unknown) =>
        error instanceof TenantDatabaseError && error.reason === 'DATABASE_CONTEXT_STALE'
    )

    await runtime.withPolicyTenantTransaction(schoolAdmin, schoolPolicy, async (transaction) => {
      const knownSibling = await transaction
        .select({ id: students.id })
        .from(students)
        .where(eq(students.id, STUDENT_A_HIGH))
        .limit(1)
      const unknown = await transaction
        .select({ id: students.id })
        .from(students)
        .where(eq(students.id, UNKNOWN_ID))
        .limit(1)
      assert.deepEqual(knownSibling, unknown)
      assert.equal(await visibleStudentCount(transaction), 101)
      const page = await transaction
        .select({ schoolId: students.schoolId, tenantId: students.tenantId })
        .from(students)
        .orderBy(students.id)
        .limit(25)
        .offset(25)
      assert.equal(page.length, 25)
      assert.equal(
        page.every(({ tenantId }) => tenantId === TENANT_A),
        true
      )
      assert.equal(
        page.every(({ schoolId }) => schoolId === SCHOOL_A_PRIMARY),
        true
      )
    })

    const createPolicy = policy('tenant.students.create', {
      kind: 'school',
      tenantId: TENANT_A,
      schoolId: SCHOOL_A_PRIMARY,
    })
    const [created] = await runtime.withPolicyTenantTransaction(
      schoolAdmin,
      createPolicy,
      (transaction) =>
        transaction
          .insert(students)
          .values({
            id: PROOF_STUDENT_ID,
            tenantId: TENANT_A,
            schoolId: SCHOOL_A_PRIMARY,
            firstName: 'Forced',
            lastName: 'RLS Proof',
            email: PROOF_EMAIL,
          })
          .returning({ id: students.id })
    )
    assert.equal(created?.id, PROOF_STUDENT_ID)

    for (const target of [
      { tenantId: TENANT_A, schoolId: SCHOOL_A_HIGH },
      { tenantId: TENANT_A, schoolId: UNKNOWN_ID },
      { tenantId: TENANT_B, schoolId: SCHOOL_B },
    ]) {
      await expectSqlState(
        runtime.withPolicyTenantTransaction(schoolAdmin, createPolicy, (transaction) =>
          transaction.insert(students).values({
            tenantId: target.tenantId,
            schoolId: target.schoolId,
            firstName: 'Rejected',
            lastName: 'RLS Proof',
          })
        ),
        '42501'
      )
    }

    const updatePolicy = policy('tenant.students.update', {
      kind: 'school',
      tenantId: TENANT_A,
      schoolId: SCHOOL_A_PRIMARY,
    })
    const [updated] = await runtime.withPolicyTenantTransaction(
      schoolAdmin,
      updatePolicy,
      (transaction) =>
        transaction
          .update(students)
          .set({ firstName: 'Updated' })
          .where(eq(students.id, PROOF_STUDENT_ID))
          .returning({ firstName: students.firstName })
    )
    assert.equal(updated?.firstName, 'Updated')

    const invisibleUpdates = await runtime.withPolicyTenantTransaction(
      schoolAdmin,
      updatePolicy,
      (transaction) =>
        transaction
          .update(students)
          .set({ firstName: 'Must not change' })
          .where(inArray(students.id, [STUDENT_A_HIGH, STUDENT_B]))
          .returning({ id: students.id })
    )
    assert.deepEqual(invisibleUpdates, [])

    await expectSqlState(
      runtime.withPolicyTenantTransaction(schoolAdmin, updatePolicy, (transaction) =>
        transaction
          .update(students)
          .set({ schoolId: SCHOOL_A_HIGH })
          .where(eq(students.id, PROOF_STUDENT_ID))
      ),
      '42501'
    )

    const explain = await runtime.withPolicyTenantTransaction(
      schoolAdmin,
      schoolPolicy,
      async (transaction) => {
        const result = await transaction.execute<Record<string, unknown>>(sql`
          explain (analyze, buffers, format json)
          select id
          from students
          where school_id = ${SCHOOL_A_PRIMARY}::uuid and status = 'active'
          limit 50
        `)
        return explainDocument(result[0]?.['QUERY PLAN'])
      }
    )
    assert.equal(collectPlanIndexNames(explain).has('students_tenant_school_idx'), true)
    const executionTime = explain['Execution Time']
    assert.equal(typeof executionTime, 'number')
    assert.ok((executionTime as number) < 1000, `Student RLS query took ${executionTime}ms`)

    const deletePolicy = policy('tenant.students.delete', {
      kind: 'school',
      tenantId: TENANT_A,
      schoolId: SCHOOL_A_PRIMARY,
    })
    const invisibleDeletes = await runtime.withPolicyTenantTransaction(
      schoolAdmin,
      deletePolicy,
      (transaction) =>
        transaction
          .delete(students)
          .where(inArray(students.id, [STUDENT_A_HIGH, STUDENT_B]))
          .returning({ id: students.id })
    )
    assert.deepEqual(invisibleDeletes, [])
    const [deleted] = await runtime.withPolicyTenantTransaction(
      schoolAdmin,
      deletePolicy,
      (transaction) =>
        transaction
          .delete(students)
          .where(eq(students.id, PROOF_STUDENT_ID))
          .returning({ id: students.id })
    )
    assert.equal(deleted?.id, PROOF_STUDENT_ID)

    const workerContext: WorkerDatabaseContext = {
      tenantId: TENANT_B,
      jobId: crypto.randomUUID(),
      jobType: 'student_rls_proof',
      requestId: REQUEST_ID,
    }
    assert.equal(await worker.withWorkerTenantTransaction(workerContext, visibleStudentCount), 1001)
    await expectSqlState(
      worker.withWorkerTenantTransaction(workerContext, (transaction) =>
        transaction.insert(students).values({
          tenantId: TENANT_B,
          schoolId: SCHOOL_B,
          firstName: 'Worker',
          lastName: 'Rejected',
        })
      ),
      '42501'
    )

    console.log(
      `Student forced-RLS proof passed: named policies, no-context denial, omitted-predicate isolation, Organization/School/class/guardian/self scopes, probing/count/pagination resistance, positive and negative writes, worker limits, and ${String(executionTime)}ms indexed plan.`
    )
  } finally {
    await Promise.allSettled([runtime.close(), worker.close(), rawRuntime.end({ timeout: 5 })])
  }
}

assertLocalDisposableDatabase()
const admin = createMigrationClient()

try {
  await seedProofData(admin)
  await runProof(admin)
} finally {
  await admin.delete(students).where(eq(students.email, PROOF_EMAIL))
  await admin
    .delete(accountSessions)
    .where(inArray(accountSessions.providerSessionId, PROOF_ACCOUNTS.map(proofSessionId)))
  await admin.delete(accountLinks).where(eq(accountLinks.accountId, PROOF_STUDENT_ACCOUNT))
  await admin.delete(accounts).where(eq(accounts.id, PROOF_STUDENT_ACCOUNT))
  await admin.$client.end({ timeout: 5 })
}
