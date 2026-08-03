import assert from 'node:assert/strict'
import { getMigrationEnv, getServerEnv, getWorkerEnv } from '@openschool/config/server'
import { sql } from 'drizzle-orm'
import postgres from 'postgres'
import {
  AUDIT_PARTITION_JOB_TYPE,
  AuditPartitionGateError,
  evaluateAuditPartitionEngineeringGate,
  maintainAuditPartitionHorizon,
  processAuditPartitionMaintenance,
} from './audit-partition-lifecycle'
import {
  closeDatabaseExecutionPoolsForProof,
  withSystemWorkerTransaction,
} from './tenant-transaction'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])
const TENANT_A = '00000000-0000-4000-8000-000000000001'
const PROOF_HORIZON_DAYS = 120
const PROOF_TIMEOUT_MS = 90_000

function assertGuardedProof(): void {
  if (process.env.ALLOW_AUDIT_PARTITION_POC !== 'true') {
    throw new Error(
      'Audit partition proof refused: ALLOW_AUDIT_PARTITION_POC must be exactly "true".'
    )
  }
  const urls = [
    getMigrationEnv().DATABASE_MIGRATION_URL,
    getServerEnv().DATABASE_RUNTIME_URL,
    getWorkerEnv().DATABASE_WORKER_URL,
  ].map((value) => new URL(value))
  if (urls.some((url) => !LOOPBACK_HOSTS.has(url.hostname))) {
    throw new Error('Audit partition proof refused: every database host must be loopback.')
  }
  const identities = urls.map((url) => `${url.hostname}:${url.port || '5432'}${url.pathname}`)
  if (new Set(identities).size !== 1) {
    throw new Error('Audit partition proof refused: every role must target one database.')
  }
}

function sqlState(error: unknown): string | undefined {
  let current = error
  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== 'object') return undefined
    const candidate = current as { cause?: unknown; code?: unknown }
    if (typeof candidate.code === 'string') return candidate.code
    current = candidate.cause
  }
  return undefined
}

function jobContext() {
  return {
    jobId: crypto.randomUUID(),
    jobType: AUDIT_PARTITION_JOB_TYPE,
    requestId: crypto.randomUUID(),
  }
}

async function exerciseNonDestructiveRecovery(admin: ReturnType<typeof postgres>): Promise<void> {
  await admin.unsafe(`
    create function pg_temp.reject_audit_recovery_change()
    returns trigger language plpgsql as $$
    begin
      raise exception 'Disposable Audit evidence is append-only' using errcode = '55000';
    end
    $$;
    create temp table recovery_events (
      occurred_at timestamptz not null,
      id uuid not null,
      content_hash text not null,
      primary key (occurred_at, id)
    ) partition by range (occurred_at);
    create temp table recovery_default partition of recovery_events default;
    create trigger recovery_update_rejected before update on recovery_events
      for each row execute function pg_temp.reject_audit_recovery_change();
    create trigger recovery_delete_rejected before delete on recovery_events
      for each row execute function pg_temp.reject_audit_recovery_change();
    insert into recovery_events values (
      '2035-01-15T00:00:00Z',
      '00000000-0000-4000-8000-000000000099',
      repeat('a', 64)
    );
    create trigger recovery_quarantine_update_rejected before update on recovery_default
      for each row execute function pg_temp.reject_audit_recovery_change();
    create trigger recovery_quarantine_delete_rejected before delete on recovery_default
      for each row execute function pg_temp.reject_audit_recovery_change();
    alter table recovery_events detach partition recovery_default;
    alter table recovery_default rename to recovery_quarantine;
    create temp table recovery_default partition of recovery_events default;
    create temp table recovery_2035_q1 partition of recovery_events
      for values from ('2035-01-01T00:00:00Z') to ('2035-04-01T00:00:00Z');
    insert into recovery_events select * from recovery_quarantine;
  `)
  const [counts] = await admin<
    Array<{
      canonical: number | string
      defaultRows: number | string
      destinationHash: string
      quarantineGuards: number | string
      sourceHash: string
      source: number | string
    }>
  >`
    select
      (select count(*) from recovery_events) as canonical,
      (select count(*) from recovery_default) as "defaultRows",
      (select content_hash from recovery_events limit 1) as "destinationHash",
      (
        select count(*)
        from pg_trigger
        where tgrelid = 'recovery_quarantine'::regclass
          and not tgisinternal
          and tgname in (
            'recovery_quarantine_update_rejected',
            'recovery_quarantine_delete_rejected'
          )
      ) as "quarantineGuards",
      (select content_hash from recovery_quarantine limit 1) as "sourceHash",
      (select count(*) from recovery_quarantine) as source
  `
  assert.deepEqual(
    {
      canonical: Number(counts?.canonical),
      defaultRows: Number(counts?.defaultRows),
      destinationHash: counts?.destinationHash,
      quarantineGuards: Number(counts?.quarantineGuards),
      sourceHash: counts?.sourceHash,
      source: Number(counts?.source),
    },
    {
      canonical: 1,
      defaultRows: 0,
      destinationHash: 'a'.repeat(64),
      quarantineGuards: 2,
      sourceHash: 'a'.repeat(64),
      source: 1,
    }
  )
  await assert.rejects(
    admin`update recovery_quarantine set content_hash = repeat('b', 64)`,
    (error: unknown) => sqlState(error) === '55000'
  )
  await assert.rejects(
    admin`delete from recovery_quarantine`,
    (error: unknown) => sqlState(error) === '55000'
  )
}

async function run(): Promise<void> {
  assertGuardedProof()
  let stage = 'initialize proof dependencies'
  const watchdog = setTimeout(() => {
    console.error('Audit partition proof timed out.', { stage })
    process.exit(1)
  }, PROOF_TIMEOUT_MS)
  const admin = postgres(getMigrationEnv().DATABASE_MIGRATION_URL, { max: 1, prepare: false })
  let failure: unknown

  try {
    stage = 'exercise the non-destructive default-partition recovery procedure'
    await exerciseNonDestructiveRecovery(admin)

    stage = 'remove one empty future partition so the worker must recreate it'
    const [futureRows] = await admin<Array<{ count: number | string }>>`
      select count(*) as count
      from audit_events
      where occurred_at >= '2026-10-01T00:00:00Z'
        and occurred_at < '2027-01-01T00:00:00Z'
    `
    assert.equal(Number(futureRows?.count), 0)
    await admin.unsafe(`
      alter table audit_events detach partition audit_events_2026_q4;
      drop table audit_events_2026_q4;
    `)

    stage = 'prove an overlapping quarterly range is refused'
    await admin.unsafe(`
      create table audit_events_overlap_probe partition of audit_events
        for values from ('2026-10-01T00:00:00Z') to ('2027-01-01T00:00:00Z');
    `)
    await assert.rejects(
      maintainAuditPartitionHorizon(jobContext(), PROOF_HORIZON_DAYS),
      (error: unknown) => sqlState(error) === '42P17'
    )
    await admin.unsafe(`
      alter table audit_events detach partition audit_events_overlap_probe;
      drop table audit_events_overlap_probe;
    `)

    stage = 'create and verify the missing partition through the real worker role'
    const created = await maintainAuditPartitionHorizon(jobContext(), PROOF_HORIZON_DAYS)
    assert.deepEqual(created.createdPartitions, ['audit_events_2026_q4'])
    assert.equal(created.status, 'ok')
    assert.equal(evaluateAuditPartitionEngineeringGate(created, PROOF_HORIZON_DAYS).decision, 'GO')

    stage = 'prove the lifecycle operation is idempotent'
    const repeated = await maintainAuditPartitionHorizon(jobContext(), PROOF_HORIZON_DAYS)
    assert.deepEqual(repeated.createdPartitions, [])
    assert.equal(repeated.horizonUntil, created.horizonUntil)

    stage = 'prove the worker cannot perform DDL directly'
    await assert.rejects(
      withSystemWorkerTransaction(jobContext(), (transaction) =>
        transaction.execute(sql`create table public.audit_worker_escape_probe (id integer)`)
      ),
      (error: unknown) => sqlState(error) === '42501'
    )

    stage = 'place disposable future evidence in the default safety partition'
    const defaultEventId = crypto.randomUUID()
    await admin`
      insert into audit_events (
        id, occurred_at, event_version, event_type, outcome, tenant_id,
        actor_type, request_id, correlation_id, target_type, target_id,
        data_classes, change_summary, source, retention_class, content_hash
      ) values (
        ${defaultEventId}, '2035-01-15T00:00:00Z', 1, 'audit.partition.proof',
        'succeeded', ${TENANT_A}, 'system', ${crypto.randomUUID()}, ${crypto.randomUUID()},
        'audit.partition', ${defaultEventId}, '["internal"]'::jsonb,
        '{"changedFields":["partition"]}'::jsonb, 'migration', 'security', 'pending'
      )
    `

    stage = 'prove default occupancy emits critical blocking alerts'
    const alerts: Array<{ code: string; severity: string }> = []
    await assert.rejects(
      processAuditPartitionMaintenance(
        jobContext(),
        {
          async publish(alert) {
            alerts.push({ code: alert.code, severity: alert.severity })
          },
        },
        PROOF_HORIZON_DAYS
      ),
      (error: unknown) =>
        error instanceof AuditPartitionGateError && error.gate.decision === 'NO_GO'
    )
    assert.equal(
      alerts.some(
        (alert) =>
          alert.code === 'AUDIT_DEFAULT_PARTITION_OCCUPIED' && alert.severity === 'critical'
      ),
      true
    )

    stage = 'record release evidence'
    const [policy] = await admin<
      Array<{ policyName: string; roles: string[]; usingExpression: string }>
    >`
      select
        policyname as "policyName",
        roles,
        qual as "usingExpression"
      from pg_policies
      where schemaname = 'public'
        and tablename = 'audit_events'
        and policyname = 'audit_events_partition_manager_select'
    `
    assert.equal(policy?.roles.includes('openschool_audit_partition_manager'), true)
    assert.match(policy?.usingExpression ?? '', /audit_partition_maintenance/)

    console.log('Audit partition lifecycle proof passed.', {
      migration: '0027_audit_partition_lifecycle',
      commit: process.env.GITHUB_SHA ?? 'local',
      ciRun: process.env.GITHUB_RUN_ID ?? 'local',
      postgresVersion: created.postgresVersion,
      managerRole: created.managerRole,
      policy: policy?.policyName,
      createdPartitions: created.createdPartitions,
      horizonUntil: created.horizonUntil,
      defaultOccupancyAlert: 'critical',
      overlappingRangeRefused: true,
      recoverySourcePreserved: true,
      recoveryHashReconciled: true,
    })
  } catch (error) {
    failure = error
  } finally {
    clearTimeout(watchdog)
    const cleanup = await Promise.allSettled([
      admin.end({ timeout: 5 }),
      closeDatabaseExecutionPoolsForProof(),
    ])
    const cleanupFailure = cleanup.find((result) => result.status === 'rejected')
    if (!failure && cleanupFailure?.status === 'rejected') failure = cleanupFailure.reason
  }

  if (failure) throw failure
}

await run()
