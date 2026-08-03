import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  type TenantDatabaseContext,
  TenantDatabaseError,
  validateDatabasePolicyContext,
  validateIdentityDatabaseContext,
  validateSystemWorkerDatabaseContext,
  validateTenantDatabaseContext,
  validateWorkerDatabaseContext,
} from './tenant-transaction'

const IDS = {
  account: '00000000-0000-4000-8000-000000000201',
  person: '00000000-0000-4000-8000-000000000901',
  tenant: '00000000-0000-4000-8000-000000000001',
  request: '00000000-0000-4000-8000-000000000299',
  school: '00000000-0000-4000-8000-000000000101',
  otherTenant: '00000000-0000-4000-8000-000000000002',
} as const

const tenantContext: TenantDatabaseContext = {
  accountId: IDS.account,
  personId: IDS.person,
  tenantId: IDS.tenant,
  sessionId: 'verified-session',
  requestId: IDS.request,
  assuranceLevel: 'aal1',
  membershipVersion: 1,
  securityVersion: 1,
  contextPolicyVersion: 1,
  activeSchoolId: IDS.school,
}

function isInvalidContext(error: unknown): boolean {
  return error instanceof TenantDatabaseError && error.reason === 'DATABASE_CONTEXT_INVALID'
}

describe('database execution context validation', () => {
  it('accepts complete verified identity, Tenant, and worker contexts', () => {
    assert.doesNotThrow(() =>
      validateIdentityDatabaseContext({
        identityProvider: 'supabase',
        providerSubject: IDS.account,
        providerSessionId: 'verified-session',
        requestId: IDS.request,
        assuranceLevel: 'aal2',
      })
    )
    assert.doesNotThrow(() =>
      validateTenantDatabaseContext({
        accountId: IDS.account,
        personId: IDS.person,
        tenantId: IDS.tenant,
        sessionId: 'verified-session',
        requestId: IDS.request,
        assuranceLevel: 'aal1',
        reauthenticatedAt: '2026-08-02T11:58:00.000Z',
        membershipVersion: 1,
        securityVersion: 1,
        contextPolicyVersion: 1,
        activeSchoolId: IDS.school,
      })
    )
    assert.doesNotThrow(() =>
      validateWorkerDatabaseContext({
        tenantId: IDS.tenant,
        jobId: IDS.account,
        jobType: 'daily_attendance_rollup',
        requestId: IDS.request,
      })
    )
    assert.doesNotThrow(() =>
      validateSystemWorkerDatabaseContext({
        jobId: IDS.account,
        jobType: 'audit_partition_maintenance',
        requestId: IDS.request,
      })
    )
  })

  it('fails before database access for missing, malformed, or unsafe context', () => {
    assert.throws(
      () =>
        validateTenantDatabaseContext({
          accountId: 'not-an-account',
          personId: IDS.person,
          tenantId: IDS.tenant,
          sessionId: 'verified-session',
          requestId: IDS.request,
          assuranceLevel: 'aal1',
          membershipVersion: 1,
          securityVersion: 1,
          contextPolicyVersion: 1,
        }),
      isInvalidContext
    )
    assert.throws(
      () =>
        validateSystemWorkerDatabaseContext({
          jobId: 'not-a-job-id',
          jobType: 'audit_partition_maintenance',
          requestId: IDS.request,
        }),
      isInvalidContext
    )
    assert.throws(
      () =>
        validateIdentityDatabaseContext({
          identityProvider: 'supabase',
          providerSubject: IDS.account,
          providerSessionId: 'unsafe\nsession',
          requestId: IDS.request,
          assuranceLevel: 'aal1',
        }),
      isInvalidContext
    )
    assert.throws(
      () =>
        validateTenantDatabaseContext({
          accountId: IDS.account,
          personId: IDS.person,
          tenantId: IDS.tenant,
          sessionId: 'verified-session',
          requestId: IDS.request,
          assuranceLevel: 'aal1',
          membershipVersion: 0,
          securityVersion: 1,
          contextPolicyVersion: 1,
        }),
      isInvalidContext
    )
    assert.throws(
      () =>
        validateWorkerDatabaseContext({
          tenantId: IDS.tenant,
          jobId: IDS.account,
          jobType: '',
          requestId: IDS.request,
        }),
      isInvalidContext
    )
    for (const invalid of [
      { assuranceLevel: 'aal3' as never },
      { activeEducationOrganizationId: 'not-an-organization' },
      { activeSchoolId: 'not-a-school' },
      { membershipVersion: 1.5 },
      { reauthenticatedAt: 'not-an-instant' },
      { reauthenticatedAt: '2026-08-02T11:58:00Z' },
    ]) {
      assert.throws(
        () =>
          validateTenantDatabaseContext({
            accountId: IDS.account,
            personId: IDS.person,
            tenantId: IDS.tenant,
            sessionId: 'verified-session',
            requestId: IDS.request,
            assuranceLevel: 'aal1',
            membershipVersion: 1,
            securityVersion: 1,
            contextPolicyVersion: 1,
            ...invalid,
          }),
        isInvalidContext
      )
    }
  })

  it('accepts only bounded policy constraints for the canonical Tenant', () => {
    assert.doesNotThrow(() =>
      validateDatabasePolicyContext(
        {
          capability: 'tenant.students.read',
          policyVersion: '2026-08-02.v1',
          queryConstraints: [
            { kind: 'tenant', tenantId: IDS.tenant },
            { kind: 'school', tenantId: IDS.tenant, schoolId: IDS.school },
          ],
        },
        tenantContext
      )
    )
  })

  it('rejects unsafe, empty, oversized, cross-Tenant, and unsupported policy scope', () => {
    const invalidPolicies = [
      {
        capability: 'Tenant Students Read',
        policyVersion: '2026-08-02.v1',
        queryConstraints: [{ kind: 'tenant', tenantId: IDS.tenant }],
      },
      {
        capability: 'tenant.students.read',
        policyVersion: '2026-08-02.v1',
        queryConstraints: [],
      },
      {
        capability: 'tenant.students.read',
        policyVersion: '2026-08-02.v1',
        queryConstraints: Array.from({ length: 17 }, () => ({
          kind: 'tenant' as const,
          tenantId: IDS.tenant,
        })),
      },
      {
        capability: 'tenant.students.read',
        policyVersion: '2026-08-02.v1',
        queryConstraints: [{ kind: 'tenant', tenantId: IDS.otherTenant }],
      },
      {
        capability: 'tenant.students.read',
        policyVersion: '2026-08-02.v1',
        queryConstraints: [{ kind: 'school', tenantId: IDS.tenant, schoolId: 'not-a-school' }],
      },
      {
        capability: 'tenant.students.read',
        policyVersion: '2026-08-02.v1',
        queryConstraints: [{ kind: 'unsupported', tenantId: IDS.tenant }],
      },
    ]
    for (const [index, policy] of invalidPolicies.entries()) {
      assert.throws(
        () => validateDatabasePolicyContext(policy as never, tenantContext),
        isInvalidContext,
        `invalid policy fixture ${index} must fail closed`
      )
    }
  })
})
