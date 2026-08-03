import {
  AUDIT_PARTITION_JOB_TYPE,
  AUDIT_PARTITION_MIN_HORIZON_DAYS,
  processAuditPartitionMaintenance,
} from './audit-partition-lifecycle'

const configuredHorizon = process.env.AUDIT_PARTITION_MIN_HORIZON_DAYS?.trim()
const minHorizonDays = configuredHorizon
  ? Number(configuredHorizon)
  : AUDIT_PARTITION_MIN_HORIZON_DAYS

const evidence = await processAuditPartitionMaintenance(
  {
    jobId: crypto.randomUUID(),
    jobType: AUDIT_PARTITION_JOB_TYPE,
    requestId: crypto.randomUUID(),
  },
  {
    async publish(alert) {
      // Scheduler stderr is the production paging seam. Deployment must route
      // non-zero job exits and this structured critical event to Security Operations.
      console.error(JSON.stringify({ event: 'audit.partition.alert', ...alert }))
    },
  },
  minHorizonDays
)

console.log(
  JSON.stringify({
    event: 'audit.partition.maintenance.complete',
    status: evidence.status,
    createdPartitions: evidence.createdPartitions,
    horizonUntil: evidence.horizonUntil,
    defaultRowCount: evidence.defaultRowCount,
    checkedAt: evidence.checkedAt,
    postgresVersion: evidence.postgresVersion,
  })
)
