import assert from 'node:assert/strict'
import { getServerEnv } from '@openschool/config/server'
import postgres from 'postgres'

interface PostgresErrorLike {
  code?: string
}

function isPostgresErrorWithCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as PostgresErrorLike).code === code
}

function assertLocalDisposableDatabase(databaseUrl: URL): void {
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]'])
  if (process.env.ALLOW_TENANT_FOUNDATION_POC !== 'true') {
    throw new Error('Upgrade verification refused: explicit proof flag is required.')
  }
  if (!loopbackHosts.has(databaseUrl.hostname)) {
    throw new Error('Upgrade verification refused: database host must be loopback.')
  }
}

async function run(): Promise<void> {
  const databaseUrl = new URL(getServerEnv().DATABASE_URL)
  assertLocalDisposableDatabase(databaseUrl)
  const client = postgres(databaseUrl.toString(), { max: 1, prepare: false })

  try {
    const [counts] = await client<
      Array<{
        tenants: number
        organizations: number
        roots: number
        schools: number
        assignments: number
        missingTenantRows: number
      }>
    >`
      select
        (select count(*)::int from tenants) as tenants,
        (select count(*)::int from organizations) as organizations,
        (
          select count(*)::int
          from education_organizations
          where legacy_organization_id is not null
        ) as roots,
        (select count(*)::int from schools) as schools,
        (select count(*)::int from school_governance_assignments) as assignments,
        (
          select sum(row_count)::int
          from (
            select count(*) filter (where tenant_id is null) as row_count from organizations
            union all select count(*) filter (where tenant_id is null) from schools
            union all select count(*) filter (where tenant_id is null) from classes
            union all select count(*) filter (where tenant_id is null) from students
            union all select count(*) filter (where tenant_id is null) from users_on_org
            union all select count(*) filter (where tenant_id is null) from users_on_school
            union all select count(*) filter (where tenant_id is null) from teachers_on_class
            union all select count(*) filter (where tenant_id is null) from parent_student
            union all select count(*) filter (where tenant_id is null) from enrollments
            union all select count(*) filter (where tenant_id is null) from grades
          ) tenant_nulls
        ) as "missingTenantRows"
    `
    assert.deepEqual(counts, {
      assignments: 3,
      missingTenantRows: 0,
      organizations: 2,
      roots: 2,
      schools: 3,
      tenants: 2,
    })

    await assert.rejects(
      client.begin(async (transaction) => {
        await transaction`
          insert into classes (tenant_id, school_id, name, academic_year)
          values (
            '20000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000101',
            'forbidden',
            '2026-2027'
          )
        `
      }),
      (error: unknown) => isPostgresErrorWithCode(error, '23503')
    )

    console.log(
      'Upgrade verification passed: legacy rows retained, Tenant roots and School governance imported, tenant keys complete, and cross-Tenant references rejected.'
    )
  } finally {
    await client.end()
  }
}

await run()
