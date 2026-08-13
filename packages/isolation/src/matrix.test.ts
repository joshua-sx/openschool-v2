import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ISOLATION_EVIDENCE_IDS, ISOLATION_MATRIX, evaluateIsolationMatrixGate } from './matrix'

const metadata = {
  commit: 'abc123',
  ciRun: 'local',
  migration: '0034_futuristic_rafael_vega',
  postgresVersion: '17.10',
  roleEvidenceDigest: 'a'.repeat(64),
  policyEvidenceDigest: 'b'.repeat(64),
  planEvidence: { indexName: 'school_enrollments_tenant_school_current_idx', executionTimeMs: 1.5 },
} as const

describe('Tenant Isolation Matrix gate', () => {
  it('accepts complete implemented-surface evidence without claiming production approval', () => {
    const report = evaluateIsolationMatrixGate(ISOLATION_EVIDENCE_IDS, metadata)
    assert.equal(report.engineering.decision, 'GO')
    assert.equal(report.production.decision, 'NO_GO')
    assert.deepEqual(report.production.requiredNamedApprovals, [
      'engineering',
      'security_privacy',
      'operations_support',
      'legal_customer_owner',
    ])
    assert.deepEqual([...report.production.disabledPaths].sort(), [
      'analytics',
      'export_report',
      'files_object_store',
      'import',
      'search',
    ])
    assert.deepEqual(report.production.evidenceOnlyPaths, ['backup_restore'])
  })

  it('reports a blocking NO-GO when positive or negative evidence is missing', () => {
    const withoutApi = ISOLATION_EVIDENCE_IDS.filter((evidence) => evidence !== 'api_isolation')
    const report = evaluateIsolationMatrixGate(withoutApi, metadata)
    assert.equal(report.engineering.decision, 'NO_GO')
    const api = report.engineering.rows.find(({ id }) => id === 'api_trpc')
    assert.deepEqual(api?.missingPositiveEvidence, ['api_isolation'])
    assert.deepEqual(api?.missingNegativeEvidence, ['api_isolation'])
  })

  it('requires both positive and negative contracts for every implemented row', () => {
    for (const contract of ISOLATION_MATRIX) {
      if (contract.implementation === 'disabled') {
        assert.ok(contract.disabledReason)
        continue
      }
      assert.ok(contract.positiveEvidence.length > 0, `${contract.id} needs positive evidence`)
      assert.ok(contract.negativeEvidence.length > 0, `${contract.id} needs negative evidence`)
    }
  })
})
