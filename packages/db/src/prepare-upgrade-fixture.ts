import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getServerEnv } from '@openschool/config/server'
import postgres from 'postgres'

interface Journal {
  entries: Array<{ tag: string; when: number }>
}

function assertLocalDisposableDatabase(databaseUrl: URL): void {
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]'])
  if (process.env.ALLOW_TENANT_FOUNDATION_POC !== 'true') {
    throw new Error('Upgrade fixture refused: ALLOW_TENANT_FOUNDATION_POC must be exactly "true".')
  }
  if (!loopbackHosts.has(databaseUrl.hostname)) {
    throw new Error('Upgrade fixture refused: database host must be loopback.')
  }
}

async function run(): Promise<void> {
  const databaseUrl = new URL(getServerEnv().DATABASE_URL)
  assertLocalDisposableDatabase(databaseUrl)

  const client = postgres(databaseUrl.toString(), { max: 1, prepare: false })
  const currentDirectory = dirname(fileURLToPath(import.meta.url))
  const migrationsDirectory = resolve(currentDirectory, '../migrations')
  const journal = JSON.parse(
    readFileSync(resolve(migrationsDirectory, 'meta/_journal.json'), 'utf8')
  ) as Journal
  const baselineEntries = journal.entries.slice(0, 3)
  assert.deepEqual(
    baselineEntries.map(({ tag }) => tag),
    ['0000_nosy_zodiak', '0001_vengeful_magneto', '0002_clammy_gravity']
  )

  try {
    const [{ isEmpty }] = await client<Array<{ isEmpty: boolean }>>`
      select to_regclass('public.organizations') is null as "isEmpty"
    `
    assert.equal(isEmpty, true, 'Upgrade fixture requires an empty disposable database')

    await client.begin(async (transaction) => {
      await transaction.unsafe('create schema if not exists drizzle')
      await transaction.unsafe(`
        create table if not exists drizzle.__drizzle_migrations (
          id serial primary key,
          hash text not null,
          created_at bigint
        )
      `)

      for (const entry of baselineEntries) {
        const migrationSql = readFileSync(resolve(migrationsDirectory, `${entry.tag}.sql`), 'utf8')
        for (const statement of migrationSql.split('--> statement-breakpoint')) {
          if (statement.trim()) {
            await transaction.unsafe(statement)
          }
        }
        await transaction`
          insert into drizzle.__drizzle_migrations (hash, created_at)
          values (${createHash('sha256').update(migrationSql).digest('hex')}, ${entry.when})
        `
      }

      await transaction.unsafe(`
        insert into organizations (id, name, slug) values
          ('10000000-0000-4000-8000-000000000001', 'Legacy Board A', 'legacy-board-a'),
          ('20000000-0000-4000-8000-000000000001', 'Legacy Trust B', 'legacy-trust-b');

        insert into schools (id, org_id, name, slug, academic_year, status) values
          ('10000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000001', 'Legacy Primary', 'legacy-primary', '2026-2027', 'active'),
          ('10000000-0000-4000-8000-000000000102', '10000000-0000-4000-8000-000000000001', 'Legacy High', 'legacy-high', '2026-2027', 'active'),
          ('20000000-0000-4000-8000-000000000101', '20000000-0000-4000-8000-000000000001', 'Legacy Community', 'legacy-community', '2026-2027', 'active');

        insert into users (id, email) values
          ('10000000-0000-4000-8000-000000000201', 'legacy.admin@example.test'),
          ('10000000-0000-4000-8000-000000000202', 'legacy.parent@example.test');

        insert into classes (id, school_id, name, academic_year, status) values
          ('10000000-0000-4000-8000-000000000301', '10000000-0000-4000-8000-000000000101', 'Grade 5', '2026-2027', 'active'),
          ('20000000-0000-4000-8000-000000000301', '20000000-0000-4000-8000-000000000101', 'Grade 7', '2026-2027', 'active');

        insert into students (id, school_id, first_name, last_name, student_number, status) values
          ('10000000-0000-4000-8000-000000000401', '10000000-0000-4000-8000-000000000101', 'Legacy', 'Student', 'SHARED-001', 'active'),
          ('20000000-0000-4000-8000-000000000401', '20000000-0000-4000-8000-000000000101', 'Other', 'Student', 'OTHER-001', 'active');

        insert into users_on_org (id, user_id, org_id, role) values
          ('10000000-0000-4000-8000-000000000501', '10000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000001', 'org_admin');
        insert into users_on_school (id, user_id, school_id, role) values
          ('10000000-0000-4000-8000-000000000511', '10000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000101', 'school_admin');
        insert into teachers_on_class (id, user_id, class_id, is_primary) values
          ('10000000-0000-4000-8000-000000000521', '10000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000301', true);
        insert into parent_student (id, parent_id, student_id, relationship) values
          ('10000000-0000-4000-8000-000000000531', '10000000-0000-4000-8000-000000000202', '10000000-0000-4000-8000-000000000401', 'guardian');
        insert into enrollments (id, student_id, class_id, status) values
          ('10000000-0000-4000-8000-000000000601', '10000000-0000-4000-8000-000000000401', '10000000-0000-4000-8000-000000000301', 'active');
        insert into grades (id, enrollment_id, assignment_name, score) values
          ('10000000-0000-4000-8000-000000000701', '10000000-0000-4000-8000-000000000601', 'Legacy assessment', 88);
      `)
    })

    console.log('Prepared representative legacy schema and data through migration 0002.')
  } finally {
    await client.end()
  }
}

await run()
