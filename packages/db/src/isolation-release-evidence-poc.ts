import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { getMigrationEnv, getServerEnv } from '@openschool/config/server'
import { ISOLATION_FIXTURES } from '@openschool/isolation'
import { sql } from 'drizzle-orm'
import { createMigrationClient } from './client'
import { accountSessions } from './schema'
import {
  closeDatabaseExecutionPoolsForProof,
  createDatabaseExecutionProofHarness,
} from './tenant-transaction'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])
const F = ISOLATION_FIXTURES
const SESSION_ID = `isolation-release-${crypto.randomUUID()}`

interface RoleDefinition extends Record<string, unknown> {
  bypassRls: boolean
  canCreateDatabase: boolean
  canCreateRole: boolean
  canLogin: boolean
  inherit: boolean
  name: string
  superuser: boolean
}

interface PolicyDefinition extends Record<string, unknown> {
  command: string
  name: string
  permissive: string
  roles: string[]
  schema: string
  table: string
  usingExpression: string | null
  withCheckExpression: string | null
}

function assertGuardedProof(): void {
  if (process.env.ALLOW_ISOLATION_RELEASE_EVIDENCE_POC !== 'true') {
    throw new Error(
      'Isolation release evidence proof refused: ALLOW_ISOLATION_RELEASE_EVIDENCE_POC must be exactly "true".'
    )
  }
  for (const value of [
    getMigrationEnv().DATABASE_MIGRATION_URL,
    getServerEnv().DATABASE_RUNTIME_URL,
  ]) {
    if (!LOOPBACK_HOSTS.has(new URL(value).hostname)) {
      throw new Error(
        'Isolation release evidence proof refused: every database host must be loopback.'
      )
    }
  }
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function planDocument(value: unknown): Record<string, unknown> {
  const parsed = typeof value === 'string' ? (JSON.parse(value) as unknown) : value
  assert.ok(Array.isArray(parsed) && parsed.length === 1)
  const document = parsed[0]
  assert.ok(typeof document === 'object' && document !== null)
  return document as Record<string, unknown>
}

function collectIndexNames(value: unknown, names = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const child of value) collectIndexNames(child, names)
    return names
  }
  if (!value || typeof value !== 'object') return names
  for (const [key, child] of Object.entries(value)) {
    if (key === 'Index Name' && typeof child === 'string') names.add(child)
    else collectIndexNames(child, names)
  }
  return names
}

async function run(): Promise<void> {
  assertGuardedProof()
  const admin = createMigrationClient()
  const runtime = createDatabaseExecutionProofHarness('runtime', 1)
  let failure: unknown
  try {
    const journal = JSON.parse(
      readFileSync(new URL('../migrations/meta/_journal.json', import.meta.url), 'utf8')
    ) as { entries?: Array<{ tag?: string }> }
    const migration = journal.entries?.at(-1)?.tag
    assert.equal(migration, '0033_volatile_wraith')

    const roles = await admin.execute<RoleDefinition>(sql`
      select
        rolname as name,
        rolcanlogin as "canLogin",
        rolsuper as superuser,
        rolcreatedb as "canCreateDatabase",
        rolcreaterole as "canCreateRole",
        rolbypassrls as "bypassRls",
        rolinherit as inherit
      from pg_roles
      where rolname = current_user or rolname like 'openschool_%'
      order by rolname
    `)
    for (const requiredRole of [
      getServerEnv().DATABASE_RUNTIME_ROLE,
      getServerEnv().DATABASE_WORKER_ROLE,
      getServerEnv().DATABASE_CONTROL_PLANE_ROLE,
      'openschool_audit_partition_manager',
      'openschool_student_admitter',
      'openschool_guardian_contact_manager',
    ]) {
      assert.equal(
        roles.some(({ name }) => name === requiredRole),
        true
      )
    }

    const policies = await admin.execute<PolicyDefinition>(sql`
      select
        schemaname as schema,
        tablename as table,
        policyname as name,
        permissive,
        roles,
        cmd as command,
        qual as "usingExpression",
        with_check as "withCheckExpression"
      from pg_policies
      where schemaname in ('public', 'openschool_platform')
      order by schemaname, tablename, policyname
    `)
    assert.ok(policies.length > 20)

    const [migrationEvidence] = await admin.execute<{
      appliedCount: number | string
      latestId: number | string
      postgresVersion: string
    }>(sql`
      select
        (select count(*) from drizzle.__drizzle_migrations) as "appliedCount",
        (select max(id) from drizzle.__drizzle_migrations) as "latestId",
        current_setting('server_version') as "postgresVersion"
    `)
    assert.ok(migrationEvidence)
    assert.equal(Number(migrationEvidence.appliedCount), journal.entries?.length)

    const now = new Date()
    await admin.insert(accountSessions).values({
      accountId: F.organizationAdminAccount,
      providerSessionId: SESSION_ID,
      status: 'active',
      assuranceLevel: 'aal1',
      securityVersion: 1,
      authenticatedAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    })

    const plan = await runtime.withPolicyTenantTransaction(
      {
        accountId: F.organizationAdminAccount,
        personId: F.organizationAdminPerson,
        tenantId: F.tenantA,
        sessionId: SESSION_ID,
        requestId: F.requestId,
        assuranceLevel: 'aal1',
        membershipVersion: 1,
        securityVersion: 1,
        contextPolicyVersion: 1,
        activeEducationOrganizationId: F.organizationA,
      },
      {
        capability: 'tenant.students.read',
        policyVersion: 'isolation-release-evidence.v1',
        queryConstraints: [
          {
            kind: 'organization_subtree',
            tenantId: F.tenantA,
            ancestorOrganizationId: F.organizationA,
          },
        ],
      },
      async (transaction) => {
        await transaction.execute(sql`set local enable_seqscan = off`)
        const result = await transaction.execute<Record<string, unknown>>(sql`
          explain (analyze, buffers, format json)
          select person_id
          from school_enrollments
          where tenant_id = ${F.tenantA}::uuid
            and school_id = ${F.schoolAPrimary}::uuid
            and status = 'enrolled'
          order by valid_from, valid_until, person_id
          limit 50
        `)
        return planDocument(result[0]?.['QUERY PLAN'])
      }
    )
    const indexNames = [...collectIndexNames(plan)].sort()
    const expectedIndexName = 'school_enrollments_tenant_school_current_idx'
    assert.equal(
      indexNames.includes(expectedIndexName),
      true,
      `Expected ${expectedIndexName}; observed indexes: ${indexNames.join(', ') || 'none'}`
    )
    const executionTimeMs = plan['Execution Time']
    assert.equal(typeof executionTimeMs, 'number')
    assert.ok(
      (executionTimeMs as number) < 1000,
      `Canonical enrollment query took ${String(executionTimeMs)}ms`
    )

    const evidence = Object.freeze({
      metadata: Object.freeze({
        commit: process.env.GITHUB_SHA ?? 'local-uncommitted',
        ciRun: process.env.GITHUB_RUN_ID ?? 'local',
        migration,
        postgresVersion: migrationEvidence.postgresVersion,
        roleEvidenceDigest: sha256(roles),
        policyEvidenceDigest: sha256(policies),
        planEvidence: Object.freeze({
          indexName: expectedIndexName,
          executionTimeMs,
        }),
      }),
      database: Object.freeze({
        appliedMigrationCount: Number(migrationEvidence.appliedCount),
        latestMigrationId: Number(migrationEvidence.latestId),
        roles: Object.freeze(roles.map((role) => Object.freeze({ ...role }))),
        policies: Object.freeze(policies.map((policy) => Object.freeze({ ...policy }))),
        plan: Object.freeze(plan),
      }),
    })
    console.log(`ISOLATION_RELEASE_EVIDENCE=${JSON.stringify(evidence)}`)
  } catch (error) {
    failure = error
  } finally {
    const cleanup = await Promise.allSettled([
      admin
        .delete(accountSessions)
        .where(sql`${accountSessions.providerSessionId} = ${SESSION_ID}`),
      runtime.close(),
      closeDatabaseExecutionPoolsForProof(),
    ])
    await admin.$client.end({ timeout: 5 })
    const cleanupFailure = cleanup.find((result) => result.status === 'rejected')
    if (!failure && cleanupFailure?.status === 'rejected') failure = cleanupFailure.reason
  }
  if (failure) throw failure
}

await run()
