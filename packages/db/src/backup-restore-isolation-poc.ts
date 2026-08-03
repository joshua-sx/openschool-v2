import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { getMigrationEnv, getServerEnv } from '@openschool/config/server'
import { ISOLATION_FIXTURES } from '@openschool/isolation'
import { sql } from 'drizzle-orm'
import { createMigrationClient } from './client'
import { accountSessions, schools, students } from './schema'
import {
  closeDatabaseExecutionPoolsForProof,
  createDatabaseExecutionProofHarness,
} from './tenant-transaction'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])
const F = ISOLATION_FIXTURES
const PROOF_RUN_ID = crypto.randomUUID()
const SESSION_ID = `backup-restore-isolation-${PROOF_RUN_ID}`

interface BackupRow extends Record<string, unknown> {
  id: string
  kind: 'school' | 'student'
  parentId: string
  tenantId: string
}

type BackupIsolationReason =
  | 'BACKUP_EMPTY'
  | 'BACKUP_TENANT_MISMATCH'
  | 'RLS_FILTERED_BACKUP'
  | 'RESTORE_RECONCILIATION_FAILED'

class BackupIsolationError extends Error {
  readonly name = 'BackupIsolationError'

  constructor(readonly reason: BackupIsolationReason) {
    super(reason)
  }
}

function assertGuardedProof(): void {
  if (process.env.ALLOW_BACKUP_RESTORE_ISOLATION_POC !== 'true') {
    throw new Error(
      'Backup/restore isolation proof refused: ALLOW_BACKUP_RESTORE_ISOLATION_POC must be exactly "true".'
    )
  }
  for (const value of [
    getMigrationEnv().DATABASE_MIGRATION_URL,
    getServerEnv().DATABASE_RUNTIME_URL,
  ]) {
    if (!LOOPBACK_HOSTS.has(new URL(value).hostname)) {
      throw new Error(
        'Backup/restore isolation proof refused: every database host must be loopback.'
      )
    }
  }
}

function canonicalRows(rows: readonly BackupRow[]): readonly BackupRow[] {
  return Object.freeze(
    rows
      .map((row) => Object.freeze({ ...row }))
      .sort((left, right) =>
        [left.tenantId, left.kind, left.id]
          .join(':')
          .localeCompare([right.tenantId, right.kind, right.id].join(':'))
      )
  )
}

function digest(rows: readonly BackupRow[]): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalRows(rows)))
    .digest('hex')
}

function verifyTenantSnapshot(rows: readonly BackupRow[], expectedTenantId: string): void {
  if (rows.length === 0) throw new BackupIsolationError('BACKUP_EMPTY')
  if (rows.some(({ tenantId }) => tenantId !== expectedTenantId)) {
    throw new BackupIsolationError('BACKUP_TENANT_MISMATCH')
  }
}

function verifyFullSnapshot(
  candidate: readonly BackupRow[],
  canonical: readonly BackupRow[]
): void {
  const candidateTenants = [...new Set(candidate.map(({ tenantId }) => tenantId))].sort()
  const canonicalTenants = [...new Set(canonical.map(({ tenantId }) => tenantId))].sort()
  if (
    candidate.length !== canonical.length ||
    digest(candidate) !== digest(canonical) ||
    candidateTenants.length !== canonicalTenants.length ||
    candidateTenants.some((tenantId, index) => tenantId !== canonicalTenants[index])
  ) {
    throw new BackupIsolationError('RLS_FILTERED_BACKUP')
  }
}

async function adminSnapshot(
  database: ReturnType<typeof createMigrationClient>,
  tenantId?: string
): Promise<readonly BackupRow[]> {
  const rows = await database.execute<BackupRow>(sql`
    select 'school'::text as kind, tenant_id as "tenantId", id, org_id as "parentId"
    from schools
    where (${tenantId ?? null}::uuid is null or tenant_id = ${tenantId ?? null}::uuid)
    union all
    select 'student'::text as kind, tenant_id as "tenantId", id, school_id as "parentId"
    from students
    where (${tenantId ?? null}::uuid is null or tenant_id = ${tenantId ?? null}::uuid)
  `)
  return canonicalRows(rows)
}

async function runtimeTenantSnapshot(): Promise<readonly BackupRow[]> {
  const runtime = createDatabaseExecutionProofHarness('runtime', 1)
  try {
    return await runtime.withPolicyTenantTransaction(
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
        policyVersion: 'backup-restore-isolation.v1',
        queryConstraints: [
          {
            kind: 'organization_subtree',
            tenantId: F.tenantA,
            ancestorOrganizationId: F.organizationA,
          },
        ],
      },
      async (transaction) => {
        const schoolRows = await transaction
          .select({ id: schools.id, parentId: schools.orgId, tenantId: schools.tenantId })
          .from(schools)
        const studentRows = await transaction
          .select({ id: students.id, parentId: students.schoolId, tenantId: students.tenantId })
          .from(students)
        return canonicalRows([
          ...schoolRows.map((row) => ({ ...row, kind: 'school' as const })),
          ...studentRows.map((row) => ({ ...row, kind: 'student' as const })),
        ])
      }
    )
  } finally {
    await runtime.close()
  }
}

async function rehearseRestore(
  database: ReturnType<typeof createMigrationClient>,
  source: readonly BackupRow[]
): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction.execute(sql`
      create temp table isolation_restore_rows (
        kind text not null,
        tenant_id uuid not null,
        id uuid not null,
        parent_id uuid not null,
        primary key (kind, tenant_id, id)
      ) on commit drop
    `)
    for (const row of source) {
      await transaction.execute(sql`
        insert into isolation_restore_rows (kind, tenant_id, id, parent_id)
        values (${row.kind}, ${row.tenantId}::uuid, ${row.id}::uuid, ${row.parentId}::uuid)
      `)
    }
    const restored = await transaction.execute<BackupRow>(sql`
      select kind, tenant_id as "tenantId", id, parent_id as "parentId"
      from isolation_restore_rows
    `)
    if (restored.length !== source.length || digest(restored) !== digest(source)) {
      throw new BackupIsolationError('RESTORE_RECONCILIATION_FAILED')
    }
  })
}

async function run(): Promise<void> {
  assertGuardedProof()
  const admin = createMigrationClient()
  let failure: unknown
  try {
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

    const full = await adminSnapshot(admin)
    assert.deepEqual([...new Set(full.map(({ tenantId }) => tenantId))].sort(), [
      F.tenantA,
      F.tenantB,
    ])
    const tenantA = await adminSnapshot(admin, F.tenantA)
    verifyTenantSnapshot(tenantA, F.tenantA)
    await rehearseRestore(admin, tenantA)

    assert.throws(
      () => verifyTenantSnapshot(tenantA, F.tenantB),
      (error: unknown) =>
        error instanceof BackupIsolationError && error.reason === 'BACKUP_TENANT_MISMATCH'
    )
    const rlsFiltered = await runtimeTenantSnapshot()
    verifyTenantSnapshot(rlsFiltered, F.tenantA)
    assert.throws(
      () => verifyFullSnapshot(rlsFiltered, full),
      (error: unknown) =>
        error instanceof BackupIsolationError && error.reason === 'RLS_FILTERED_BACKUP'
    )
    verifyFullSnapshot(full, full)

    console.log('Backup/restore isolation proof passed.', {
      fullTenantCount: new Set(full.map(({ tenantId }) => tenantId)).size,
      fullRowCount: full.length,
      tenantRowCount: tenantA.length,
      tenantDigest: digest(tenantA),
      wrongTenantDetected: true,
      rlsFilteredBackupDetected: true,
      restoreReconciled: true,
    })
  } catch (error) {
    failure = error
  } finally {
    const cleanup = await Promise.allSettled([
      admin
        .delete(accountSessions)
        .where(sql`${accountSessions.providerSessionId} = ${SESSION_ID}`),
      closeDatabaseExecutionPoolsForProof(),
    ])
    await admin.$client.end({ timeout: 5 })
    const cleanupFailure = cleanup.find((result) => result.status === 'rejected')
    if (!failure && cleanupFailure?.status === 'rejected') failure = cleanupFailure.reason
  }
  if (failure) throw failure
}

await run()
