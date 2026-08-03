import { sql } from 'drizzle-orm'
import { type SystemWorkerDatabaseContext, withSystemWorkerTransaction } from './tenant-transaction'

export const AUDIT_PARTITION_JOB_TYPE = 'audit_partition_maintenance'
export const AUDIT_PARTITION_MIN_HORIZON_DAYS = 45

const PARTITION_NAME = /^audit_events_[0-9]{4}_q[1-4]$/

interface AuditPartitionMaintenanceRow extends Record<string, unknown> {
  status: string
  createdPartitions: unknown
  horizonUntil: Date | string
  defaultRowCount: bigint | number | string
  postgresVersion: string
  managerRole: string
  checkedAt: Date | string
}

export interface AuditPartitionMaintenanceEvidence {
  status: 'ok' | 'default_occupied'
  createdPartitions: readonly string[]
  horizonUntil: string
  defaultRowCount: number
  postgresVersion: string
  managerRole: 'openschool_audit_partition_manager'
  checkedAt: string
}

export type AuditPartitionGateCode =
  | 'AUDIT_DEFAULT_PARTITION_OCCUPIED'
  | 'AUDIT_PARTITION_HORIZON_INSUFFICIENT'
  | 'AUDIT_PARTITION_MAINTENANCE_UNHEALTHY'

export interface AuditPartitionEngineeringGate {
  scope: 'engineering_evidence_only'
  decision: 'GO' | 'NO_GO'
  blockingCodes: readonly AuditPartitionGateCode[]
  requiredHorizonUntil: string
}

export interface AuditPartitionAlert {
  severity: 'critical'
  code: AuditPartitionGateCode
  message: string
  checkedAt: string
  horizonUntil: string
  defaultRowCount: number
}

export interface AuditPartitionAlertAdapter {
  publish(alert: Readonly<AuditPartitionAlert>): Promise<void>
}

export class AuditPartitionGateError extends Error {
  readonly name = 'AuditPartitionGateError'

  constructor(
    readonly gate: AuditPartitionEngineeringGate,
    readonly evidence: AuditPartitionMaintenanceEvidence
  ) {
    super(`Audit partition production gate is NO-GO: ${gate.blockingCodes.join(',')}`)
  }
}

function instant(value: Date | string, field: string): string {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error(`${field} is not a valid instant`)
  return parsed.toISOString()
}

function evidenceFrom(row: AuditPartitionMaintenanceRow | undefined) {
  if (!row) throw new Error('Audit partition maintenance returned no evidence')
  if (row.status !== 'ok' && row.status !== 'default_occupied') {
    throw new Error('Audit partition maintenance returned an unsupported status')
  }
  if (
    !Array.isArray(row.createdPartitions) ||
    !row.createdPartitions.every(
      (partition): partition is string =>
        typeof partition === 'string' && PARTITION_NAME.test(partition)
    )
  ) {
    throw new Error('Audit partition maintenance returned unsafe partition names')
  }
  const defaultRowCount = Number(row.defaultRowCount)
  if (!Number.isSafeInteger(defaultRowCount) || defaultRowCount < 0) {
    throw new Error('Audit partition maintenance returned an invalid default row count')
  }
  if (
    typeof row.postgresVersion !== 'string' ||
    row.postgresVersion.length < 1 ||
    row.managerRole !== 'openschool_audit_partition_manager'
  ) {
    throw new Error('Audit partition maintenance returned invalid role or version evidence')
  }
  return Object.freeze({
    status: row.status,
    createdPartitions: Object.freeze([...row.createdPartitions]),
    horizonUntil: instant(row.horizonUntil, 'horizonUntil'),
    defaultRowCount,
    postgresVersion: row.postgresVersion,
    managerRole: row.managerRole,
    checkedAt: instant(row.checkedAt, 'checkedAt'),
  }) satisfies Readonly<AuditPartitionMaintenanceEvidence>
}

export function evaluateAuditPartitionEngineeringGate(
  evidence: AuditPartitionMaintenanceEvidence,
  minHorizonDays = AUDIT_PARTITION_MIN_HORIZON_DAYS
): Readonly<AuditPartitionEngineeringGate> {
  if (!Number.isInteger(minHorizonDays) || minHorizonDays < 45 || minHorizonDays > 366) {
    throw new Error('Audit partition horizon must be between 45 and 366 days')
  }
  const checkedAt = new Date(evidence.checkedAt)
  const horizonUntil = new Date(evidence.horizonUntil)
  const requiredHorizon = new Date(checkedAt.getTime() + minHorizonDays * 86_400_000)
  const blockingCodes: AuditPartitionGateCode[] = []
  if (evidence.status !== 'ok') blockingCodes.push('AUDIT_PARTITION_MAINTENANCE_UNHEALTHY')
  if (evidence.defaultRowCount > 0) blockingCodes.push('AUDIT_DEFAULT_PARTITION_OCCUPIED')
  if (horizonUntil < requiredHorizon) {
    blockingCodes.push('AUDIT_PARTITION_HORIZON_INSUFFICIENT')
  }
  return Object.freeze({
    scope: 'engineering_evidence_only',
    decision: blockingCodes.length === 0 ? 'GO' : 'NO_GO',
    blockingCodes: Object.freeze(blockingCodes),
    requiredHorizonUntil: requiredHorizon.toISOString(),
  })
}

export async function maintainAuditPartitionHorizon(
  context: SystemWorkerDatabaseContext,
  minHorizonDays = AUDIT_PARTITION_MIN_HORIZON_DAYS
): Promise<Readonly<AuditPartitionMaintenanceEvidence>> {
  if (context.jobType !== AUDIT_PARTITION_JOB_TYPE) {
    throw new Error(`Audit partition maintenance requires job type ${AUDIT_PARTITION_JOB_TYPE}`)
  }
  if (!Number.isInteger(minHorizonDays) || minHorizonDays < 45 || minHorizonDays > 366) {
    throw new Error('Audit partition horizon must be between 45 and 366 days')
  }
  return withSystemWorkerTransaction(context, async (transaction) => {
    const rows = await transaction.execute<AuditPartitionMaintenanceRow>(sql`
      select
        status,
        created_partitions as "createdPartitions",
        horizon_until as "horizonUntil",
        default_row_count as "defaultRowCount",
        postgres_version as "postgresVersion",
        manager_role as "managerRole",
        checked_at as "checkedAt"
      from openschool_private.maintain_audit_partition_horizon(${minHorizonDays})
    `)
    return evidenceFrom(rows[0])
  })
}

export async function processAuditPartitionMaintenance(
  context: SystemWorkerDatabaseContext,
  alertAdapter: AuditPartitionAlertAdapter,
  minHorizonDays = AUDIT_PARTITION_MIN_HORIZON_DAYS
): Promise<Readonly<AuditPartitionMaintenanceEvidence>> {
  const evidence = await maintainAuditPartitionHorizon(context, minHorizonDays)
  const gate = evaluateAuditPartitionEngineeringGate(evidence, minHorizonDays)
  if (gate.decision === 'NO_GO') {
    for (const code of gate.blockingCodes) {
      await alertAdapter.publish(
        Object.freeze({
          severity: 'critical',
          code,
          message: `Audit partition gate blocked by ${code}`,
          checkedAt: evidence.checkedAt,
          horizonUntil: evidence.horizonUntil,
          defaultRowCount: evidence.defaultRowCount,
        })
      )
    }
    throw new AuditPartitionGateError(gate, evidence)
  }
  return evidence
}
