import { spawnSync } from 'node:child_process'
import {
  type IsolationEvidenceId,
  type IsolationReleaseMetadata,
  evaluateIsolationMatrixGate,
} from '@openschool/isolation'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])
const RELEASE_EVIDENCE_PREFIX = 'ISOLATION_RELEASE_EVIDENCE='

interface ReleaseEvidence {
  metadata: IsolationReleaseMetadata
  database: Record<string, unknown>
}

interface ProofGroup {
  evidence: IsolationEvidenceId
  commands: readonly string[]
}

const PROOF_GROUPS: readonly ProofGroup[] = [
  { evidence: 'tenant_boundary_contract', commands: ['isolation:boundary-contract'] },
  { evidence: 'database_execution', commands: ['db:execution-poc', 'db:security-poc'] },
  { evidence: 'tenant_foundation', commands: ['db:tenant-foundation-poc'] },
  { evidence: 'identity_foundation', commands: ['db:identity-foundation-poc'] },
  { evidence: 'tenant_context', commands: ['auth:tenant-context-poc'] },
  { evidence: 'policy_query', commands: ['policy:query-poc'] },
  { evidence: 'api_isolation', commands: ['api:isolation-poc'] },
  { evidence: 'student_rls', commands: ['db:student-rls-poc'] },
  { evidence: 'audit_ledger', commands: ['audit:poc'] },
  { evidence: 'invitation_onboarding', commands: ['invitation:onboarding-poc'] },
  { evidence: 'identity_revocation', commands: ['identity:revocation-poc'] },
  { evidence: 'platform_tenant_lifecycle', commands: ['platform:tenant-lifecycle-poc'] },
  { evidence: 'support_access', commands: ['support:access-poc'] },
  { evidence: 'backup_restore', commands: ['backup:restore-isolation-poc'] },
  { evidence: 'release_metadata', commands: ['isolation:release-evidence-poc'] },
  { evidence: 'audit_partition_lifecycle', commands: ['audit:partition-poc'] },
]

function assertGuardedProof(): void {
  if (process.env.ALLOW_ISOLATION_MATRIX_POC !== 'true') {
    throw new Error(
      'Isolation Matrix proof refused: ALLOW_ISOLATION_MATRIX_POC must be exactly "true".'
    )
  }
  for (const variable of [
    'DATABASE_MIGRATION_URL',
    'DATABASE_RUNTIME_URL',
    'DATABASE_WORKER_URL',
    'DATABASE_CONTROL_PLANE_URL',
  ]) {
    const value = process.env[variable]
    if (!value || !LOOPBACK_HOSTS.has(new URL(value).hostname)) {
      throw new Error(`Isolation Matrix proof refused: ${variable} must use a loopback host.`)
    }
  }
}

function fallbackMetadata(): IsolationReleaseMetadata {
  return {
    commit: process.env.GITHUB_SHA ?? 'local-uncommitted',
    ciRun: process.env.GITHUB_RUN_ID ?? 'local',
    migration: '0027_audit_partition_lifecycle',
    postgresVersion: 'not-recorded',
    roleEvidenceDigest: '0'.repeat(64),
    policyEvidenceDigest: '0'.repeat(64),
    planEvidence: { indexName: 'not-recorded', executionTimeMs: 0 },
  }
}

function execute(command: string): Readonly<{ ok: boolean; output: string }> {
  console.log(`\n=== Isolation evidence: bun run ${command} ===`)
  const result = spawnSync(process.execPath, ['run', command], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    timeout: 180_000,
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) console.error(result.error)
  return Object.freeze({
    ok: result.status === 0 && !result.error,
    output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
  })
}

function releaseEvidenceFrom(output: string): ReleaseEvidence | null {
  const line = output
    .split(/\r?\n/)
    .find((candidate) => candidate.includes(RELEASE_EVIDENCE_PREFIX))
  if (!line) return null
  const serialized = line.slice(
    line.indexOf(RELEASE_EVIDENCE_PREFIX) + RELEASE_EVIDENCE_PREFIX.length
  )
  const parsed = JSON.parse(serialized.slice(0, serialized.lastIndexOf('}') + 1)) as ReleaseEvidence
  return parsed
}

function emitReport(
  successfulEvidence: readonly IsolationEvidenceId[],
  releaseEvidence: ReleaseEvidence | null,
  failedCommand?: string
): void {
  const gate = evaluateIsolationMatrixGate(
    successfulEvidence,
    releaseEvidence?.metadata ?? fallbackMetadata()
  )
  const report = Object.freeze({
    generatedAt: new Date().toISOString(),
    ...(failedCommand ? { failedCommand } : {}),
    gate,
    databaseEvidence: releaseEvidence?.database ?? null,
  })
  console.log(`ISOLATION_MATRIX_REPORT=${JSON.stringify(report)}`)
  console.log('Tenant Isolation Matrix gate:', {
    engineeringDecision: gate.engineering.decision,
    productionDecision: gate.production.decision,
    verifiedRows: gate.engineering.rows.filter(({ status }) => status === 'verified').length,
    missingRows: gate.engineering.rows.filter(({ status }) => status === 'missing_evidence').length,
    disabledProductionPaths: gate.production.disabledPaths,
    evidenceOnlyProductionPaths: gate.production.evidenceOnlyPaths,
  })
}

assertGuardedProof()
const successfulEvidence: IsolationEvidenceId[] = []
let releaseEvidence: ReleaseEvidence | null = null
let failedCommand: string | undefined

for (const group of PROOF_GROUPS) {
  let groupOutput = ''
  for (const command of group.commands) {
    const result = execute(command)
    groupOutput += `\n${result.output}`
    if (!result.ok) {
      failedCommand = command
      break
    }
  }
  if (failedCommand) break
  if (group.evidence === 'release_metadata') {
    releaseEvidence = releaseEvidenceFrom(groupOutput)
    if (!releaseEvidence) {
      failedCommand = 'isolation:release-evidence-poc (missing structured evidence)'
      break
    }
  }
  successfulEvidence.push(group.evidence)
}

emitReport(successfulEvidence, releaseEvidence, failedCommand)
if (failedCommand) process.exit(1)

const finalGate = evaluateIsolationMatrixGate(
  successfulEvidence,
  releaseEvidence?.metadata ?? fallbackMetadata()
)
if (finalGate.engineering.decision !== 'GO') process.exit(1)
