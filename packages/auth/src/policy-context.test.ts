import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { toPolicyContext } from './policy-context'
import type { TenantRequestContext } from './tenant-request-context'
import type { VerifiedAccountIdentity } from './verified-identity'

const requestContext: TenantRequestContext = {
  version: 1,
  contextPolicyVersion: 1,
  accountId: 'account-1',
  personId: 'person-1',
  tenantId: 'tenant-1',
  tenantName: 'Tenant One',
  sessionId: 'session-1',
  membershipVersion: 1,
  securityVersion: 1,
  assuranceLevel: 'aal2',
  activeEducationOrganizationId: 'organization-1',
  activeSchoolId: 'school-1',
  roleTemplateKeys: ['custom_registrar', 'school_admin'],
  requestId: 'request-1',
  resolvedAt: '2026-08-02T12:00:00.000Z',
  expiresAt: '2026-08-02T13:00:00.000Z',
  legacyComparison: 'not_applicable',
}

const identity: VerifiedAccountIdentity = {
  provider: 'supabase',
  subject: 'subject-1',
  sessionId: 'session-1',
  email: 'person@example.test',
  assuranceLevel: 'aal2',
  issuedAt: '2026-08-02T11:50:00.000Z',
  expiresAt: '2026-08-02T13:00:00.000Z',
}

describe('Policy Context adapter', () => {
  it('preserves every database Role Template key and verified assurance input', () => {
    const policyContext = toPolicyContext(requestContext, identity)

    assert.deepEqual(policyContext, {
      accountId: 'account-1',
      personId: 'person-1',
      tenantId: 'tenant-1',
      userEmail: 'person@example.test',
      roleTemplateKeys: ['custom_registrar', 'school_admin'],
      assuranceLevel: 'aal2',
      activeEducationOrganizationId: 'organization-1',
      activeSchoolId: 'school-1',
    })
    assert.equal(Object.isFrozen(policyContext), true)
    assert.equal(Object.isFrozen(policyContext.roleTemplateKeys), true)
  })

  it('does not treat token issuance as interactive reauthentication evidence', () => {
    const policyContext = toPolicyContext(requestContext, identity)
    assert.equal(policyContext.authenticatedAt, undefined)
  })

  it('preserves verified interactive reauthentication evidence', () => {
    const policyContext = toPolicyContext(requestContext, {
      ...identity,
      reauthenticatedAt: '2026-08-02T11:58:00.000Z',
    })

    assert.equal(policyContext.authenticatedAt, '2026-08-02T11:58:00.000Z')
  })
})
