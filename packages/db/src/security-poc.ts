import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getServerEnv } from '@openschool/config/server'
import postgres from 'postgres'

// Intentional raw-PostgreSQL exception: roles, grants, session identity, physical
// connection reuse, RLS errors, and transaction-local settings are the interface under test.
const TENANT_A = '00000000-0000-4000-8000-000000009001'
const TENANT_B = '00000000-0000-4000-8000-000000009002'
const TENANT_A_STUDENT = '00000000-0000-4000-8000-000000009101'
const TENANT_B_STUDENT = '00000000-0000-4000-8000-000000009102'
const RUNTIME_INSERT = '00000000-0000-4000-8000-000000009103'
const WORKER_INSERT = '00000000-0000-4000-8000-000000009104'

type SqlClient = ReturnType<typeof postgres>

interface PostgresErrorLike {
  code?: string
}

interface RoleEvidence {
  currentUser: string
  isTableOwner: boolean
  bypassesRls: boolean
  canSelect: boolean
  canInsert: boolean
  canUpdate: boolean
  canDelete: boolean
  canTruncate: boolean
}

function isPostgresErrorWithCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as PostgresErrorLike).code === code
}

function assertLocalDisposableDatabase(databaseUrl: URL): void {
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]'])

  if (process.env.ALLOW_SECURITY_POC !== 'true') {
    throw new Error('Security proof refused: ALLOW_SECURITY_POC must be exactly "true".')
  }

  if (!loopbackHosts.has(databaseUrl.hostname)) {
    throw new Error(
      `Security proof refused: DATABASE_URL host must be loopback, received ${databaseUrl.hostname}.`
    )
  }
}

function replaceSqlPlaceholders(template: string, replacements: Record<string, string>): string {
  let sql = template
  for (const [placeholder, value] of Object.entries(replacements)) {
    sql = sql.replaceAll(placeholder, value)
  }

  if (/__[A-Z_]+__/.test(sql)) {
    throw new Error('Security proof SQL contains an unreplaced placeholder.')
  }

  return sql
}

async function getRoleEvidence(client: SqlClient): Promise<RoleEvidence> {
  const [evidence] = await client<Array<RoleEvidence>>`
    select
      current_user as "currentUser",
      pg_has_role(current_user, 'openschool_poc_owner', 'member') as "isTableOwner",
      rolbypassrls as "bypassesRls",
      has_table_privilege(current_user, 'security_poc.student_records', 'SELECT') as "canSelect",
      has_table_privilege(current_user, 'security_poc.student_records', 'INSERT') as "canInsert",
      has_table_privilege(current_user, 'security_poc.student_records', 'UPDATE') as "canUpdate",
      has_table_privilege(current_user, 'security_poc.student_records', 'DELETE') as "canDelete",
      has_table_privilege(current_user, 'security_poc.student_records', 'TRUNCATE') as "canTruncate"
    from pg_roles
    where rolname = current_user
  `
  assert.ok(evidence)
  return evidence
}

async function assertContextCleared(client: SqlClient, expectedBackendPid: number): Promise<void> {
  const [evidence] = await client<
    Array<{ backendPid: number; count: number; tenantSetting: string | null }>
  >`
    select
      pg_backend_pid() as "backendPid",
      nullif(current_setting('app.tenant_id', true), '') as "tenantSetting",
      (select count(*)::int from security_poc.student_records) as count
  `
  assert.deepEqual(evidence, {
    backendPid: expectedBackendPid,
    count: 0,
    tenantSetting: null,
  })
}

async function run(): Promise<void> {
  const adminUrl = new URL(getServerEnv().DATABASE_URL)
  assertLocalDisposableDatabase(adminUrl)

  const runtimePassword = randomBytes(32).toString('base64url')
  const workerPassword = randomBytes(32).toString('base64url')
  const runtimeUrl = new URL(adminUrl)
  runtimeUrl.username = 'openschool_poc_login'
  runtimeUrl.password = runtimePassword
  const workerUrl = new URL(adminUrl)
  workerUrl.username = 'openschool_poc_worker_login'
  workerUrl.password = workerPassword

  const currentDirectory = dirname(fileURLToPath(import.meta.url))
  const setupSql = replaceSqlPlaceholders(
    readFileSync(resolve(currentDirectory, '../security-poc/tenant-rls.sql'), 'utf8'),
    {
      __POC_RUNTIME_PASSWORD__: runtimePassword,
      __POC_WORKER_PASSWORD__: workerPassword,
      __TENANT_A__: TENANT_A,
      __TENANT_B__: TENANT_B,
      __TENANT_A_STUDENT__: TENANT_A_STUDENT,
      __TENANT_B_STUDENT__: TENANT_B_STUDENT,
    }
  )
  const cleanupSql = `
    drop schema if exists security_poc cascade;
    drop role if exists openschool_poc_worker_login;
    drop role if exists openschool_poc_login;
    drop role if exists openschool_poc_worker;
    drop role if exists openschool_poc_app;
    drop role if exists openschool_poc_owner;
  `

  const admin = postgres(adminUrl.toString(), { max: 1, prepare: false })
  let runtime: SqlClient | undefined
  let worker: SqlClient | undefined

  try {
    await admin.unsafe(setupSql)
    runtime = postgres(runtimeUrl.toString(), { max: 1, prepare: false })
    worker = postgres(workerUrl.toString(), { max: 1, prepare: false })

    assert.deepEqual(await getRoleEvidence(runtime), {
      currentUser: 'openschool_poc_login',
      isTableOwner: false,
      bypassesRls: false,
      canSelect: true,
      canInsert: true,
      canUpdate: true,
      canDelete: true,
      canTruncate: false,
    })
    assert.deepEqual(await getRoleEvidence(worker), {
      currentUser: 'openschool_poc_worker_login',
      isTableOwner: false,
      bypassesRls: false,
      canSelect: true,
      canInsert: true,
      canUpdate: false,
      canDelete: false,
      canTruncate: false,
    })

    const [{ backendPid: runtimeBackendPid }] = await runtime<Array<{ backendPid: number }>>`
      select pg_backend_pid() as "backendPid"
    `
    const [{ backendPid: workerBackendPid }] = await worker<Array<{ backendPid: number }>>`
      select pg_backend_pid() as "backendPid"
    `
    await assertContextCleared(runtime, runtimeBackendPid)
    await assertContextCleared(worker, workerBackendPid)

    await runtime.begin(async (transaction) => {
      await transaction`select set_config('app.tenant_id', ${TENANT_A}, true)`
      const visible = await transaction<Array<{ id: string }>>`
        select id from security_poc.student_records order by id
      `
      assert.deepEqual(visible, [{ id: TENANT_A_STUDENT }])

      const sameTenantUpdate = await transaction<Array<{ id: string }>>`
        update security_poc.student_records
        set display_name = 'Tenant A student updated'
        where id = ${TENANT_A_STUDENT}
        returning id
      `
      assert.deepEqual(sameTenantUpdate, [{ id: TENANT_A_STUDENT }])

      const crossTenantUpdate = await transaction<Array<{ id: string }>>`
        update security_poc.student_records
        set display_name = 'must not change'
        where id = ${TENANT_B_STUDENT}
        returning id
      `
      assert.deepEqual(crossTenantUpdate, [])

      const crossTenantDelete = await transaction<Array<{ id: string }>>`
        delete from security_poc.student_records
        where id = ${TENANT_B_STUDENT}
        returning id
      `
      assert.deepEqual(crossTenantDelete, [])

      await transaction`
        insert into security_poc.student_records (id, tenant_id, display_name)
        values (${RUNTIME_INSERT}, ${TENANT_A}, 'Runtime temporary row')
      `
      const sameTenantDelete = await transaction<Array<{ id: string }>>`
        delete from security_poc.student_records
        where id = ${RUNTIME_INSERT}
        returning id
      `
      assert.deepEqual(sameTenantDelete, [{ id: RUNTIME_INSERT }])
    })
    await assertContextCleared(runtime, runtimeBackendPid)

    await assert.rejects(
      runtime.begin(async (transaction) => {
        await transaction`select set_config('app.tenant_id', ${TENANT_A}, true)`
        throw new Error('expected transaction rollback')
      }),
      /expected transaction rollback/
    )
    await assertContextCleared(runtime, runtimeBackendPid)

    await assert.rejects(
      runtime.begin(async (transaction) => {
        await transaction`select set_config('app.tenant_id', ${TENANT_A}, true)`
        await transaction`
          insert into security_poc.student_records (id, tenant_id, display_name)
          values (${RUNTIME_INSERT}, ${TENANT_B}, 'forbidden')
        `
      }),
      (error: unknown) => isPostgresErrorWithCode(error, '42501')
    )
    await assertContextCleared(runtime, runtimeBackendPid)

    await runtime.begin(async (transaction) => {
      await transaction`select set_config('app.tenant_id', ${TENANT_B}, true)`
      const visible = await transaction<Array<{ id: string }>>`
        select id from security_poc.student_records order by id
      `
      assert.deepEqual(visible, [{ id: TENANT_B_STUDENT }])
    })
    await assertContextCleared(runtime, runtimeBackendPid)

    await worker.begin(async (transaction) => {
      await transaction`select set_config('app.tenant_id', ${TENANT_A}, true)`
      const visible = await transaction<Array<{ id: string }>>`
        select id from security_poc.student_records order by id
      `
      assert.deepEqual(visible, [{ id: TENANT_A_STUDENT }])
      await transaction`
        insert into security_poc.student_records (id, tenant_id, display_name)
        values (${WORKER_INSERT}, ${TENANT_A}, 'Worker row')
      `
    })
    await assertContextCleared(worker, workerBackendPid)

    await assert.rejects(
      worker.begin(async (transaction) => {
        await transaction`select set_config('app.tenant_id', ${TENANT_A}, true)`
        await transaction`
          insert into security_poc.student_records (id, tenant_id, display_name)
          values (${RUNTIME_INSERT}, ${TENANT_B}, 'forbidden worker row')
        `
      }),
      (error: unknown) => isPostgresErrorWithCode(error, '42501')
    )
    await assertContextCleared(worker, workerBackendPid)

    await assert.rejects(
      worker.begin(async (transaction) => {
        await transaction`select set_config('app.tenant_id', ${TENANT_A}, true)`
        await transaction`
          update security_poc.student_records
          set display_name = 'worker must not update'
          where id = ${TENANT_A_STUDENT}
        `
      }),
      (error: unknown) => isPostgresErrorWithCode(error, '42501')
    )
    await assertContextCleared(worker, workerBackendPid)

    console.log(
      'Security proof passed: runtime/worker roles, explicit privileges, tenant RLS, write checks, DELETE isolation, and context cleanup.'
    )
  } finally {
    await runtime?.end()
    await worker?.end()
    await admin.unsafe(cleanupSql)
    await admin.end()
  }
}

await run()
