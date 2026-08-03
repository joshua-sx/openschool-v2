import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { TenantDatabaseContext } from '@openschool/db'
import type { AllowedPolicyDecision, PolicyContext } from '@openschool/rbac'
import { TRPCError } from '@trpc/server'
import {
  assertDatabasePolicyContext,
  assertStudentSliceEnabled,
  toDatabasePolicyContext,
} from './database-context'

const databaseContext: TenantDatabaseContext = {
  accountId: '00000000-0000-4000-8000-000000000201',
  personId: '00000000-0000-4000-8000-000000000901',
  tenantId: '00000000-0000-4000-8000-000000000001',
  sessionId: 'verified-session',
  requestId: 'verified-request',
  assuranceLevel: 'aal1',
  membershipVersion: 1,
  securityVersion: 1,
  contextPolicyVersion: 1,
  activeSchoolId: '00000000-0000-4000-8000-000000000101',
}

const policyContext: PolicyContext = {
  accountId: databaseContext.accountId,
  personId: databaseContext.personId,
  tenantId: databaseContext.tenantId,
  assuranceLevel: databaseContext.assuranceLevel,
  roleTemplateKeys: ['school_admin'],
  activeSchoolId: databaseContext.activeSchoolId,
}

function allowedDecision(
  queryConstraints: AllowedPolicyDecision['queryConstraints']
): AllowedPolicyDecision {
  return {
    effect: 'allow',
    reason: 'GRANT_MATCHED',
    policyVersion: '2026-08-02.v1',
    capability: 'tenant.students.read',
    matchedGrant: {
      assignedRoleTemplateKey: 'school_admin',
      grantId: 'school-admin-students-read',
      capability: 'tenant.students.read',
      scope: 'school',
    },
    matchedGrants: [],
    queryConstraints,
    obligations: [],
  }
}

describe('database and policy context binding', () => {
  it('accepts the Policy Context derived from the same canonical request', () => {
    assert.doesNotThrow(() => assertDatabasePolicyContext(databaseContext, policyContext))
  })

  it('rejects replay when any bound database field differs', () => {
    const mismatches: readonly Partial<TenantDatabaseContext>[] = [
      { accountId: '00000000-0000-4000-8000-000000000202' },
      { personId: '00000000-0000-4000-8000-000000000902' },
      { tenantId: '00000000-0000-4000-8000-000000000002' },
      { assuranceLevel: 'aal2' },
      { activeEducationOrganizationId: '00000000-0000-4000-8000-000000000013' },
      { activeSchoolId: '00000000-0000-4000-8000-000000000102' },
    ]
    for (const mismatch of mismatches) {
      assert.throws(
        () => assertDatabasePolicyContext({ ...databaseContext, ...mismatch }, policyContext),
        (error: unknown) =>
          error instanceof TRPCError && error.message === 'DATABASE_POLICY_CONTEXT_MISMATCH'
      )
    }
  })

  it('preserves every approved Tenant query constraint for database enforcement', () => {
    const decision = allowedDecision([
      {
        kind: 'school',
        tenantId: databaseContext.tenantId,
        schoolId: databaseContext.activeSchoolId as string,
      },
      { kind: 'self', tenantId: databaseContext.tenantId, personId: databaseContext.personId },
    ])
    const result = toDatabasePolicyContext(decision)

    assert.equal(result.capability, decision.capability)
    assert.equal(result.policyVersion, decision.policyVersion)
    assert.deepEqual(result.queryConstraints, decision.queryConstraints)
    assert.equal(Object.isFrozen(result), true)
    assert.equal(Object.isFrozen(result.queryConstraints), true)
  })

  it('never translates platform access into Tenant database scope', () => {
    assert.throws(
      () => toDatabasePolicyContext(allowedDecision([{ kind: 'platform' }])),
      (error: unknown) =>
        error instanceof TRPCError && error.message === 'DATABASE_POLICY_SCOPE_UNSUPPORTED'
    )
  })

  it('fails closed unless the forced-RLS student slice is explicitly enabled', () => {
    const original = process.env.OPENSCHOOL_STUDENT_SLICE_MODE
    try {
      process.env.OPENSCHOOL_STUDENT_SLICE_MODE = 'disabled'
      assert.throws(
        () => assertStudentSliceEnabled(),
        (error: unknown) => error instanceof TRPCError && error.message === 'STUDENT_SLICE_DISABLED'
      )
      process.env.OPENSCHOOL_STUDENT_SLICE_MODE = 'forced_rls'
      assert.doesNotThrow(() => assertStudentSliceEnabled())
    } finally {
      if (original === undefined) process.env.OPENSCHOOL_STUDENT_SLICE_MODE = undefined
      else process.env.OPENSCHOOL_STUDENT_SLICE_MODE = original
    }
  })
})
