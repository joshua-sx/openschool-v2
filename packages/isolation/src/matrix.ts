export const ISOLATION_EVIDENCE_IDS = [
  'tenant_boundary_contract',
  'database_execution',
  'tenant_foundation',
  'identity_foundation',
  'tenant_context',
  'policy_query',
  'api_isolation',
  'canonical_student_admission',
  'academic_structure',
  'student_enrollment_lifecycle',
  'guardian_contacts',
  'household_residences',
  'sections',
  'student_rls',
  'audit_ledger',
  'invitation_onboarding',
  'identity_revocation',
  'platform_tenant_lifecycle',
  'support_access',
  'backup_restore',
  'release_metadata',
  'audit_partition_lifecycle',
] as const

export type IsolationEvidenceId = (typeof ISOLATION_EVIDENCE_IDS)[number]

export type IsolationMatrixRowId =
  | 'identity_session'
  | 'context_selection'
  | 'api_trpc'
  | 'policy_module'
  | 'query_module'
  | 'postgres_rls'
  | 'organization_tree'
  | 'school_class'
  | 'guardian_student'
  | 'platform_control_plane'
  | 'support_break_glass'
  | 'files_object_store'
  | 'cache'
  | 'search'
  | 'jobs_queues'
  | 'notifications'
  | 'import'
  | 'export_report'
  | 'analytics'
  | 'audit'
  | 'backup_restore'
  | 'placement_routing'

export interface IsolationMatrixRowContract {
  id: IsolationMatrixRowId
  implementation: 'implemented' | 'evidence_only' | 'disabled'
  engineeringBlocking: boolean
  positiveEvidence: readonly IsolationEvidenceId[]
  negativeEvidence: readonly IsolationEvidenceId[]
  disabledReason?: string
}

const row = (contract: IsolationMatrixRowContract): Readonly<IsolationMatrixRowContract> =>
  Object.freeze({
    ...contract,
    positiveEvidence: Object.freeze([...contract.positiveEvidence]),
    negativeEvidence: Object.freeze([...contract.negativeEvidence]),
  })

export const ISOLATION_MATRIX = Object.freeze([
  row({
    id: 'identity_session',
    implementation: 'implemented',
    engineeringBlocking: true,
    positiveEvidence: ['identity_foundation', 'identity_revocation'],
    negativeEvidence: ['identity_foundation', 'identity_revocation'],
  }),
  row({
    id: 'context_selection',
    implementation: 'implemented',
    engineeringBlocking: true,
    positiveEvidence: ['tenant_context'],
    negativeEvidence: ['tenant_context'],
  }),
  row({
    id: 'api_trpc',
    implementation: 'implemented',
    engineeringBlocking: true,
    positiveEvidence: ['api_isolation'],
    negativeEvidence: ['api_isolation'],
  }),
  row({
    id: 'policy_module',
    implementation: 'implemented',
    engineeringBlocking: true,
    positiveEvidence: ['policy_query'],
    negativeEvidence: ['policy_query'],
  }),
  row({
    id: 'query_module',
    implementation: 'implemented',
    engineeringBlocking: true,
    positiveEvidence: [
      'policy_query',
      'api_isolation',
      'canonical_student_admission',
      'academic_structure',
      'student_enrollment_lifecycle',
      'guardian_contacts',
      'household_residences',
      'sections',
    ],
    negativeEvidence: [
      'policy_query',
      'api_isolation',
      'canonical_student_admission',
      'academic_structure',
      'student_enrollment_lifecycle',
      'guardian_contacts',
      'household_residences',
      'sections',
    ],
  }),
  row({
    id: 'postgres_rls',
    implementation: 'implemented',
    engineeringBlocking: true,
    positiveEvidence: [
      'student_rls',
      'canonical_student_admission',
      'academic_structure',
      'student_enrollment_lifecycle',
      'guardian_contacts',
      'household_residences',
      'sections',
      'release_metadata',
    ],
    negativeEvidence: [
      'student_rls',
      'canonical_student_admission',
      'academic_structure',
      'student_enrollment_lifecycle',
      'guardian_contacts',
      'household_residences',
      'sections',
      'database_execution',
    ],
  }),
  row({
    id: 'organization_tree',
    implementation: 'implemented',
    engineeringBlocking: true,
    positiveEvidence: ['tenant_foundation'],
    negativeEvidence: ['tenant_foundation'],
  }),
  row({
    id: 'school_class',
    implementation: 'implemented',
    engineeringBlocking: true,
    positiveEvidence: [
      'policy_query',
      'api_isolation',
      'canonical_student_admission',
      'academic_structure',
      'student_enrollment_lifecycle',
      'guardian_contacts',
      'household_residences',
      'sections',
    ],
    negativeEvidence: [
      'policy_query',
      'api_isolation',
      'canonical_student_admission',
      'academic_structure',
      'student_enrollment_lifecycle',
      'guardian_contacts',
      'household_residences',
      'sections',
    ],
  }),
  row({
    id: 'guardian_student',
    implementation: 'implemented',
    engineeringBlocking: true,
    positiveEvidence: ['policy_query', 'guardian_contacts'],
    negativeEvidence: ['policy_query', 'guardian_contacts'],
  }),
  row({
    id: 'platform_control_plane',
    implementation: 'implemented',
    engineeringBlocking: true,
    positiveEvidence: ['platform_tenant_lifecycle'],
    negativeEvidence: ['platform_tenant_lifecycle'],
  }),
  row({
    id: 'support_break_glass',
    implementation: 'implemented',
    engineeringBlocking: true,
    positiveEvidence: ['support_access'],
    negativeEvidence: ['support_access'],
  }),
  row({
    id: 'files_object_store',
    implementation: 'disabled',
    engineeringBlocking: false,
    positiveEvidence: [],
    negativeEvidence: ['tenant_boundary_contract'],
    disabledReason: 'No file/object-storage product path is enabled.',
  }),
  row({
    id: 'cache',
    implementation: 'implemented',
    engineeringBlocking: true,
    positiveEvidence: ['tenant_boundary_contract', 'tenant_context'],
    negativeEvidence: ['tenant_boundary_contract', 'identity_revocation'],
  }),
  row({
    id: 'search',
    implementation: 'disabled',
    engineeringBlocking: false,
    positiveEvidence: [],
    negativeEvidence: [],
    disabledReason: 'No search index or query adapter is enabled.',
  }),
  row({
    id: 'jobs_queues',
    implementation: 'implemented',
    engineeringBlocking: true,
    positiveEvidence: ['invitation_onboarding', 'identity_revocation', 'support_access'],
    negativeEvidence: [
      'tenant_boundary_contract',
      'invitation_onboarding',
      'identity_revocation',
      'support_access',
    ],
  }),
  row({
    id: 'notifications',
    implementation: 'implemented',
    engineeringBlocking: true,
    positiveEvidence: ['support_access'],
    negativeEvidence: ['support_access'],
  }),
  row({
    id: 'import',
    implementation: 'disabled',
    engineeringBlocking: false,
    positiveEvidence: [],
    negativeEvidence: [],
    disabledReason: 'No bulk import product path is enabled.',
  }),
  row({
    id: 'export_report',
    implementation: 'disabled',
    engineeringBlocking: false,
    positiveEvidence: ['audit_ledger'],
    negativeEvidence: ['audit_ledger'],
    disabledReason:
      'Only the audited export-request seam exists; no report file delivery path is enabled.',
  }),
  row({
    id: 'analytics',
    implementation: 'disabled',
    engineeringBlocking: false,
    positiveEvidence: [],
    negativeEvidence: [],
    disabledReason: 'No operational or cross-Tenant analytics data product is enabled.',
  }),
  row({
    id: 'audit',
    implementation: 'implemented',
    engineeringBlocking: true,
    positiveEvidence: [
      'audit_ledger',
      'canonical_student_admission',
      'academic_structure',
      'student_enrollment_lifecycle',
      'guardian_contacts',
      'household_residences',
      'sections',
      'audit_partition_lifecycle',
    ],
    negativeEvidence: [
      'audit_ledger',
      'canonical_student_admission',
      'academic_structure',
      'student_enrollment_lifecycle',
      'guardian_contacts',
      'household_residences',
      'sections',
      'audit_partition_lifecycle',
    ],
  }),
  row({
    id: 'backup_restore',
    implementation: 'evidence_only',
    engineeringBlocking: true,
    positiveEvidence: ['backup_restore'],
    negativeEvidence: ['backup_restore'],
  }),
  row({
    id: 'placement_routing',
    implementation: 'implemented',
    engineeringBlocking: true,
    positiveEvidence: ['database_execution'],
    negativeEvidence: ['database_execution'],
  }),
] as const)

export interface IsolationReleaseMetadata {
  commit: string
  ciRun: string
  migration: string
  postgresVersion: string
  roleEvidenceDigest: string
  policyEvidenceDigest: string
  planEvidence: Readonly<{ indexName: string; executionTimeMs: number }>
}

export interface IsolationGateRow {
  id: IsolationMatrixRowId
  status: 'verified' | 'missing_evidence' | 'disabled'
  missingPositiveEvidence: readonly IsolationEvidenceId[]
  missingNegativeEvidence: readonly IsolationEvidenceId[]
  disabledReason?: string
}

export interface IsolationEngineeringGate {
  scope: 'implemented_surface_only'
  decision: 'GO' | 'NO_GO'
  rows: readonly Readonly<IsolationGateRow>[]
  successfulEvidence: readonly IsolationEvidenceId[]
  metadata: Readonly<IsolationReleaseMetadata>
}

export interface IsolationProductionGate {
  scope: 'production_launch'
  decision: 'NO_GO'
  disabledPaths: readonly IsolationMatrixRowId[]
  evidenceOnlyPaths: readonly IsolationMatrixRowId[]
  requiredNamedApprovals: readonly [
    'engineering',
    'security_privacy',
    'operations_support',
    'legal_customer_owner',
  ]
  statement: string
}

export interface IsolationGateReport {
  engineering: Readonly<IsolationEngineeringGate>
  production: Readonly<IsolationProductionGate>
}

function assertMetadata(metadata: IsolationReleaseMetadata): void {
  if (
    !metadata.commit ||
    !metadata.ciRun ||
    !/^00[0-9]{2}_[a-z0-9_]+$/.test(metadata.migration) ||
    !metadata.postgresVersion ||
    !/^[a-f0-9]{64}$/.test(metadata.roleEvidenceDigest) ||
    !/^[a-f0-9]{64}$/.test(metadata.policyEvidenceDigest) ||
    !metadata.planEvidence.indexName ||
    !Number.isFinite(metadata.planEvidence.executionTimeMs) ||
    metadata.planEvidence.executionTimeMs < 0
  ) {
    throw new Error('Isolation release metadata is incomplete or invalid')
  }
}

export function evaluateIsolationMatrixGate(
  successfulEvidence: readonly IsolationEvidenceId[],
  metadata: IsolationReleaseMetadata
): Readonly<IsolationGateReport> {
  assertMetadata(metadata)
  const known = new Set<string>(ISOLATION_EVIDENCE_IDS)
  if (successfulEvidence.some((evidence) => !known.has(evidence))) {
    throw new Error('Isolation gate received unknown evidence')
  }
  const successful = new Set<IsolationEvidenceId>(successfulEvidence)
  const rows = ISOLATION_MATRIX.map((contract): Readonly<IsolationGateRow> => {
    if (contract.implementation === 'disabled') {
      return Object.freeze({
        id: contract.id,
        status: 'disabled',
        missingPositiveEvidence: Object.freeze([]),
        missingNegativeEvidence: Object.freeze([]),
        disabledReason: contract.disabledReason,
      })
    }
    const missingPositiveEvidence = contract.positiveEvidence.filter(
      (evidence) => !successful.has(evidence)
    )
    const missingNegativeEvidence = contract.negativeEvidence.filter(
      (evidence) => !successful.has(evidence)
    )
    return Object.freeze({
      id: contract.id,
      status:
        missingPositiveEvidence.length === 0 && missingNegativeEvidence.length === 0
          ? 'verified'
          : 'missing_evidence',
      missingPositiveEvidence: Object.freeze(missingPositiveEvidence),
      missingNegativeEvidence: Object.freeze(missingNegativeEvidence),
    })
  })
  const blockingRows = rows.filter((result) => {
    const contract = ISOLATION_MATRIX.find(({ id }) => id === result.id)
    return contract?.engineeringBlocking && result.status !== 'verified'
  })
  const disabledPaths = rows.filter(({ status }) => status === 'disabled').map(({ id }) => id)
  const evidenceOnlyPaths = ISOLATION_MATRIX.filter(
    ({ implementation }) => implementation === 'evidence_only'
  ).map(({ id }) => id)
  return Object.freeze({
    engineering: Object.freeze({
      scope: 'implemented_surface_only',
      decision: blockingRows.length === 0 ? 'GO' : 'NO_GO',
      rows: Object.freeze(rows),
      successfulEvidence: Object.freeze([...successful]),
      metadata: Object.freeze({
        ...metadata,
        planEvidence: Object.freeze({ ...metadata.planEvidence }),
      }),
    }),
    production: Object.freeze({
      scope: 'production_launch',
      decision: 'NO_GO',
      disabledPaths: Object.freeze(disabledPaths),
      evidenceOnlyPaths: Object.freeze(evidenceOnlyPaths),
      requiredNamedApprovals: Object.freeze([
        'engineering',
        'security_privacy',
        'operations_support',
        'legal_customer_owner',
      ]) as IsolationProductionGate['requiredNamedApprovals'],
      statement:
        'Engineering evidence cannot grant legal, privacy, security, operations, or customer launch approval.',
    }),
  })
}
