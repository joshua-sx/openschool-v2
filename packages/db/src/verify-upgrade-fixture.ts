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
        accounts: number
        userPeople: number
        studentPeople: number
        accountLinks: number
        migrationEvents: number
        affiliations: number
        roleAssignments: number
        relationships: number
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
        ) as "missingTenantRows",
        (select count(*)::int from accounts) as accounts,
        (select count(*)::int from people where legacy_user_id is not null) as "userPeople",
        (select count(*)::int from people where legacy_student_id is not null) as "studentPeople",
        (select count(*)::int from account_links) as "accountLinks",
        (select count(*)::int from identity_migration_events) as "migrationEvents",
        (select count(*)::int from affiliations) as affiliations,
        (select count(*)::int from role_template_assignments) as "roleAssignments",
        (select count(*)::int from person_relationships) as relationships
    `
    assert.deepEqual(counts, {
      assignments: 3,
      accountLinks: 2,
      accounts: 2,
      affiliations: 6,
      missingTenantRows: 0,
      migrationEvents: 2,
      organizations: 2,
      relationships: 1,
      roleAssignments: 6,
      roots: 2,
      schools: 3,
      studentPeople: 2,
      tenants: 2,
      userPeople: 2,
    })

    const [parity] = await client<
      Array<{
        crossTenantLinks: number
        legacyStudents: number
        linkedStudents: number
        legacyUsers: number
        linkedUsers: number
        studentsWithAccounts: number
      }>
    >`
      select
        (select count(*)::int from users) as "legacyUsers",
        (select count(distinct legacy_user_id)::int from people where legacy_user_id is not null) as "linkedUsers",
        (select count(*)::int from students) as "legacyStudents",
        (select count(*)::int from student_profiles) as "linkedStudents",
        (
          select count(*)::int
          from student_profiles profile
          join account_links link
            on link.tenant_id = profile.tenant_id
           and link.person_id = profile.person_id
        ) as "studentsWithAccounts",
        (
          select count(*)::int
          from account_links link
          join people person on person.id = link.person_id
          where link.tenant_id <> person.tenant_id
        ) as "crossTenantLinks"
    `
    assert.deepEqual(parity, {
      crossTenantLinks: 0,
      legacyStudents: 2,
      legacyUsers: 2,
      linkedStudents: 2,
      linkedUsers: 2,
      studentsWithAccounts: 0,
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
      'Upgrade verification passed: legacy reads retained, Account and Tenant-scoped Person parity proven, non-login students preserved, and cross-Tenant identity links rejected.'
    )
  } finally {
    await client.end()
  }
}

await run()
