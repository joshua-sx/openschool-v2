import assert from 'node:assert/strict'
import { getMigrationEnv, getServerEnv, getWorkerEnv } from '@openschool/config/server'
import { sql } from 'drizzle-orm'
import postgres from 'postgres'
import { TenantDatabaseError, createDatabaseExecutionProofHarness } from './tenant-transaction'

const TENANT_A = '00000000-0000-4000-8000-000000000001'
const TENANT_B = '00000000-0000-4000-8000-000000000002'
const UNKNOWN_TENANT = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const ACCOUNT = '00000000-0000-4000-8000-000000000201'
const PERSON = '00000000-0000-4000-8000-000000000901'
const ACCOUNT_B = '00000000-0000-4000-8000-000000000207'
const PERSON_B = '00000000-0000-4000-8000-000000000908'
const SCHOOL = '00000000-0000-4000-8000-000000000101'
const ORGANIZATION = '00000000-0000-4000-8000-000000000013'
const REQUEST = '00000000-0000-4000-8000-000000000299'
const JOB = '00000000-0000-4000-8000-000000000399'
const PROOF_RUN_ID = crypto.randomUUID()
const SESSION_A = `database-execution-${PROOF_RUN_ID}-a`
const SESSION_B = `database-execution-${PROOF_RUN_ID}-b`

interface PostgresErrorLike {
  code?: string
  cause?: unknown
}

function isPostgresError(error: unknown, code: string): boolean {
  let current = error
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== 'object' || current === null) return false
    const postgresError = current as PostgresErrorLike
    if (postgresError.code === code) return true
    current = postgresError.cause
  }
  return false
}

function tenantContext(tenantId = TENANT_A, requestId = REQUEST) {
  const isTenantB = tenantId === TENANT_B
  return {
    accountId: isTenantB ? ACCOUNT_B : ACCOUNT,
    personId: isTenantB ? PERSON_B : PERSON,
    tenantId,
    sessionId: isTenantB ? SESSION_B : SESSION_A,
    requestId,
    assuranceLevel: 'aal2' as const,
    membershipVersion: 1,
    securityVersion: 1,
    contextPolicyVersion: 1,
    ...(!isTenantB && tenantId !== UNKNOWN_TENANT
      ? { activeEducationOrganizationId: ORGANIZATION, activeSchoolId: SCHOOL }
      : {}),
  }
}

function assertContextCleared(
  evidence: Awaited<
    ReturnType<ReturnType<typeof createDatabaseExecutionProofHarness>['readSessionContext']>
  >,
  backendPid: number
): void {
  assert.equal(evidence.backendPid, backendPid)
  assert.deepEqual(
    {
      accountId: evidence.accountId,
      personId: evidence.personId,
      tenantId: evidence.tenantId,
      sessionId: evidence.sessionId,
      requestId: evidence.requestId,
      organizationId: evidence.organizationId,
      schoolId: evidence.schoolId,
      jobId: evidence.jobId,
      jobType: evidence.jobType,
      membershipVersion: evidence.membershipVersion,
      securityVersion: evidence.securityVersion,
      contextPolicyVersion: evidence.contextPolicyVersion,
    },
    {
      accountId: null,
      personId: null,
      tenantId: null,
      sessionId: null,
      requestId: null,
      organizationId: null,
      schoolId: null,
      jobId: null,
      jobType: null,
      membershipVersion: null,
      securityVersion: null,
      contextPolicyVersion: null,
    }
  )
}

async function run(): Promise<void> {
  const environment = getServerEnv()
  const admin = postgres(getMigrationEnv().DATABASE_MIGRATION_URL, { max: 1, prepare: false })
  const runtime = createDatabaseExecutionProofHarness('runtime', 1)
  const worker = createDatabaseExecutionProofHarness('worker', 1)

  try {
    const authenticatedAt = new Date()
    const expiresAt = new Date(authenticatedAt.getTime() + 60 * 60 * 1000)
    await admin`
      insert into account_sessions (
        account_id, provider_session_id, status, assurance_level,
        security_version, authenticated_at, expires_at
      ) values
        (${ACCOUNT}, ${SESSION_A}, 'active', 'aal2', 1, ${authenticatedAt}, ${expiresAt}),
        (${ACCOUNT_B}, ${SESSION_B}, 'active', 'aal2', 1, ${authenticatedAt}, ${expiresAt})
    `
    const [ownership] = await admin<
      Array<{ migrationUser: string; studentsOwner: string; runtimeIsMember: boolean }>
    >`
      select
        current_user as "migrationUser",
        pg_get_userbyid(relation.relowner) as "studentsOwner",
        pg_has_role(${new URL(environment.DATABASE_RUNTIME_URL).username}, current_user, 'member')
          as "runtimeIsMember"
      from pg_class relation
      inner join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relname = 'students'
    `
    assert.ok(ownership)
    assert.equal(ownership.studentsOwner, ownership.migrationUser)
    assert.equal(ownership.runtimeIsMember, false)

    const initial = await runtime.readSessionContext()
    assertContextCleared(initial, initial.backendPid)

    const committedBackendPid = await runtime.withTenantTransaction(
      tenantContext(),
      async (transaction) => {
        const result = await transaction.execute<
          Record<string, unknown> & {
            backendPid: number
            currentUser: string
            tenantId: string
            accountId: string
            schoolId: string
            organizationId: string
            canUpdateStudents: boolean
            canDeleteStudents: boolean
          }
        >(sql`
          select
            pg_backend_pid() as "backendPid",
            current_user as "currentUser",
            current_setting('app.tenant_id') as "tenantId",
            current_setting('app.account_id') as "accountId",
            current_setting('app.school_id') as "schoolId",
            current_setting('app.education_organization_id') as "organizationId",
            has_table_privilege(current_user, 'public.students', 'UPDATE') as "canUpdateStudents",
            has_table_privilege(current_user, 'public.students', 'DELETE') as "canDeleteStudents"
        `)
        const evidence = result[0]
        assert.ok(evidence)
        assert.equal(evidence.currentUser, new URL(environment.DATABASE_RUNTIME_URL).username)
        assert.equal(evidence.tenantId, TENANT_A)
        assert.equal(evidence.accountId, ACCOUNT)
        assert.equal(evidence.schoolId, SCHOOL)
        assert.equal(evidence.organizationId, ORGANIZATION)
        assert.equal(evidence.canUpdateStudents, true)
        assert.equal(evidence.canDeleteStudents, false)
        return evidence.backendPid
      }
    )
    assertContextCleared(await runtime.readSessionContext(), committedBackendPid)

    await assert.rejects(
      runtime.withTenantTransaction(tenantContext(), async () => {
        throw new Error('expected rollback')
      }),
      /expected rollback/
    )
    assertContextCleared(await runtime.readSessionContext(), committedBackendPid)

    await assert.rejects(
      runtime.withTenantTransaction(tenantContext(), async (transaction) => {
        await transaction.execute(sql`select 1 / 0`)
      }),
      (error: unknown) => isPostgresError(error, '22012')
    )
    assertContextCleared(await runtime.readSessionContext(), committedBackendPid)

    let unknownPlacementOperationCalled = false
    await assert.rejects(
      runtime.withTenantTransaction(tenantContext(UNKNOWN_TENANT), async () => {
        unknownPlacementOperationCalled = true
      }),
      (error: unknown) =>
        error instanceof TenantDatabaseError && error.reason === 'TENANT_PLACEMENT_UNKNOWN'
    )
    assert.equal(unknownPlacementOperationCalled, false)
    assertContextCleared(await runtime.readSessionContext(), committedBackendPid)

    await runtime.withIdentityTransaction(
      {
        identityProvider: 'supabase',
        providerSubject: ACCOUNT,
        providerSessionId: 'identity-proof-session',
        requestId: REQUEST,
        assuranceLevel: 'aal1',
      },
      async (transaction) => {
        const result = await transaction.execute<
          Record<string, unknown> & { providerSubject: string; tenantId: string | null }
        >(sql`
          select
            current_setting('app.provider_subject') as "providerSubject",
            nullif(current_setting('app.tenant_id', true), '') as "tenantId"
        `)
        assert.equal(result[0]?.providerSubject, ACCOUNT)
        assert.equal(result[0]?.tenantId, null)
      }
    )
    assertContextCleared(await runtime.readSessionContext(), committedBackendPid)

    const queuedTenants = Array.from({ length: 16 }, (_, index) =>
      index % 2 === 0 ? TENANT_A : TENANT_B
    )
    const observedTenants = await Promise.all(
      queuedTenants.map((tenantId, index) =>
        runtime.withTenantTransaction(
          tenantContext(
            tenantId,
            `00000000-0000-4000-8000-${String(300 + index).padStart(12, '0')}`
          ),
          async (transaction) => {
            await transaction.execute(sql`select pg_sleep(0.005)`)
            const result = await transaction.execute<
              Record<string, unknown> & { tenantId: string }
            >(sql`select current_setting('app.tenant_id') as "tenantId"`)
            return result[0]?.tenantId
          }
        )
      )
    )
    assert.deepEqual(observedTenants, queuedTenants)
    assertContextCleared(await runtime.readSessionContext(), committedBackendPid)

    const workerBackendPid = await worker.withWorkerTenantTransaction(
      { tenantId: TENANT_A, jobId: JOB, jobType: 'proof_job', requestId: REQUEST },
      async (transaction) => {
        const result = await transaction.execute<
          Record<string, unknown> & {
            backendPid: number
            currentUser: string
            tenantId: string
            jobId: string
            canUpdateStudents: boolean
          }
        >(sql`
          select
            pg_backend_pid() as "backendPid",
            current_user as "currentUser",
            current_setting('app.tenant_id') as "tenantId",
            current_setting('app.job_id') as "jobId",
            has_table_privilege(current_user, 'public.students', 'UPDATE') as "canUpdateStudents"
        `)
        const evidence = result[0]
        assert.ok(evidence)
        assert.equal(evidence.currentUser, new URL(getWorkerEnv().DATABASE_WORKER_URL).username)
        assert.equal(evidence.tenantId, TENANT_A)
        assert.equal(evidence.jobId, JOB)
        assert.equal(evidence.canUpdateStudents, false)
        return evidence.backendPid
      }
    )
    assertContextCleared(await worker.readSessionContext(), workerBackendPid)

    console.log(
      'Database execution proof passed: separate least-privilege roles, placement denial, local identity/Tenant/worker context, commit/rollback/SQL-error cleanup, same-connection reuse, and pool contention.'
    )
  } finally {
    await runtime.close()
    await worker.close()
    await admin`
      delete from account_sessions
      where provider_session_id in (${SESSION_A}, ${SESSION_B})
    `
    await admin.end()
  }
}

await run()
