import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  type AuditPartitionMaintenanceEvidence,
  evaluateAuditPartitionEngineeringGate,
} from './audit-partition-lifecycle'

function evidence(
  overrides: Partial<AuditPartitionMaintenanceEvidence> = {}
): AuditPartitionMaintenanceEvidence {
  return {
    status: 'ok',
    createdPartitions: [],
    checkedAt: '2026-08-03T12:00:00.000Z',
    horizonUntil: '2026-10-01T00:00:00.000Z',
    defaultRowCount: 0,
    postgresVersion: '17.5',
    managerRole: 'openschool_audit_partition_manager',
    ...overrides,
  }
}

describe('Audit partition engineering gate', () => {
  it('accepts a clean default partition and at least 45 days of future coverage', () => {
    assert.deepEqual(evaluateAuditPartitionEngineeringGate(evidence()), {
      scope: 'engineering_evidence_only',
      decision: 'GO',
      blockingCodes: [],
      requiredHorizonUntil: '2026-09-17T12:00:00.000Z',
    })
  })

  it('reports default occupancy as a blocking engineering condition', () => {
    assert.deepEqual(
      evaluateAuditPartitionEngineeringGate(
        evidence({ status: 'default_occupied', defaultRowCount: 2 })
      ).blockingCodes,
      ['AUDIT_PARTITION_MAINTENANCE_UNHEALTHY', 'AUDIT_DEFAULT_PARTITION_OCCUPIED']
    )
  })

  it('fails closed when the verified future horizon is below the required threshold', () => {
    assert.deepEqual(
      evaluateAuditPartitionEngineeringGate(evidence({ horizonUntil: '2026-09-01T00:00:00.000Z' }))
        .blockingCodes,
      ['AUDIT_PARTITION_HORIZON_INSUFFICIENT']
    )
    assert.throws(() => evaluateAuditPartitionEngineeringGate(evidence(), 44), /45 and 366/)
  })
})
