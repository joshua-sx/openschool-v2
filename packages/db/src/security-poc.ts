import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getServerEnv } from '@openschool/config/server'
import postgres from 'postgres'

const TENANT_A = '00000000-0000-4000-8000-000000009001'
const TENANT_B = '00000000-0000-4000-8000-000000009002'
const TENANT_A_STUDENT = '00000000-0000-4000-8000-000000009101'
const TENANT_B_STUDENT = '00000000-0000-4000-8000-000000009102'

interface PostgresErrorLike {
  code?: string
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

async function run(): Promise<void> {
  const adminUrl = new URL(getServerEnv().DATABASE_URL)
  assertLocalDisposableDatabase(adminUrl)

  const password = randomBytes(32).toString('base64url')
  const runtimeUrl = new URL(adminUrl)
  runtimeUrl.username = 'openschool_poc_login'
  runtimeUrl.password = password

  const currentDirectory = dirname(fileURLToPath(import.meta.url))
  const setupSql = readFileSync(
    resolve(currentDirectory, '../security-poc/tenant-rls.sql'),
    'utf8'
  ).replace('__POC_PASSWORD__', password)
  const cleanupSql = `
    drop schema if exists security_poc cascade;
    drop role if exists openschool_poc_login;
    drop role if exists openschool_poc_app;
    drop role if exists openschool_poc_owner;
  `

  const admin = postgres(adminUrl.toString(), { max: 1, prepare: false })
  let runtime: ReturnType<typeof postgres> | undefined

  try {
    await admin.unsafe(setupSql)
    runtime = postgres(runtimeUrl.toString(), { max: 1, prepare: false })

    const [role] = await runtime<
      Array<{ currentUser: string; isTableOwner: boolean; bypassesRls: boolean }>
    >`
      select
        current_user as "currentUser",
        pg_has_role(current_user, 'openschool_poc_owner', 'member') as "isTableOwner",
        rolbypassrls as "bypassesRls"
      from pg_roles
      where rolname = current_user
    `
    assert.deepEqual(role, {
      currentUser: 'openschool_poc_login',
      isTableOwner: false,
      bypassesRls: false,
    })

    const [withoutContext] = await runtime<Array<{ count: number }>>`
      select count(*)::int as count from security_poc.student_records
    `
    assert.equal(withoutContext?.count, 0)

    await runtime.begin(async (transaction) => {
      await transaction`select set_config('app.tenant_id', ${TENANT_A}, true)`
      const visible = await transaction<Array<{ id: string }>>`
        select id from security_poc.student_records order by id
      `
      assert.deepEqual(visible, [{ id: TENANT_A_STUDENT }])

      const crossTenantUpdate = await transaction<Array<{ id: string }>>`
        update security_poc.student_records
        set display_name = 'must not change'
        where id = ${TENANT_B_STUDENT}
        returning id
      `
      assert.deepEqual(crossTenantUpdate, [])
    })

    const [afterCommit] = await runtime<Array<{ count: number }>>`
      select count(*)::int as count from security_poc.student_records
    `
    assert.equal(afterCommit?.count, 0)

    await assert.rejects(
      runtime.begin(async (transaction) => {
        await transaction`select set_config('app.tenant_id', ${TENANT_A}, true)`
        await transaction`
          insert into security_poc.student_records (id, tenant_id, display_name)
          values ('00000000-0000-4000-8000-000000009103', ${TENANT_B}, 'forbidden')
        `
      }),
      (error: unknown) => isPostgresErrorWithCode(error, '42501')
    )

    await runtime.begin(async (transaction) => {
      await transaction`select set_config('app.tenant_id', ${TENANT_B}, true)`
      const visible = await transaction<Array<{ id: string }>>`
        select id from security_poc.student_records order by id
      `
      assert.deepEqual(visible, [{ id: TENANT_B_STUDENT }])
    })

    await assert.rejects(
      runtime.begin(async (transaction) => {
        await transaction`select set_config('app.tenant_id', ${TENANT_A}, true)`
        await transaction`delete from security_poc.student_records where id = ${TENANT_A_STUDENT}`
      }),
      (error: unknown) => isPostgresErrorWithCode(error, '42501')
    )

    console.log(
      'Security proof passed: non-owner runtime role, default deny, tenant isolation, WITH CHECK, context reset, and least privilege.'
    )
  } finally {
    await runtime?.end()
    await admin.unsafe(cleanupSql)
    await admin.end()
  }
}

await run()
