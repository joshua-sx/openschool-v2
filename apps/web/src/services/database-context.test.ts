import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { TenantDatabaseContext } from '@openschool/db'
import type { PolicyContext } from '@openschool/rbac'
import { TRPCError } from '@trpc/server'
import { assertDatabasePolicyContext } from './database-context'

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

describe('database and policy context binding', () => {
  it('accepts the Policy Context derived from the same canonical request', () => {
    assert.doesNotThrow(() => assertDatabasePolicyContext(databaseContext, policyContext))
  })

  it('rejects replay of a valid decision under another Tenant context', () => {
    assert.throws(
      () =>
        assertDatabasePolicyContext(
          { ...databaseContext, tenantId: '00000000-0000-4000-8000-000000000002' },
          policyContext
        ),
      (error: unknown) =>
        error instanceof TRPCError && error.message === 'DATABASE_POLICY_CONTEXT_MISMATCH'
    )
  })
})
