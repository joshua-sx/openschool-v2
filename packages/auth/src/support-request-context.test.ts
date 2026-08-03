import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  toSupportIdentityDatabaseContext,
  toSupportPolicyContext,
  toSupportRequestContext,
} from './support-request-context'

const identity = {
  provider: 'supabase' as const,
  subject: 'provider-subject',
  sessionId: 'provider-session',
  email: 'support@example.com',
  assuranceLevel: 'aal2' as const,
  reauthenticatedAt: '2026-08-02T11:58:00.000Z',
  issuedAt: '2026-08-02T11:58:00.000Z',
  expiresAt: '2026-08-02T12:58:00.000Z',
}

describe('support request context conversion', () => {
  it('keeps the actor Person-free and binds policy to the exact approved grant', () => {
    assert.deepEqual(toSupportIdentityDatabaseContext(identity, 'request-1'), {
      identityProvider: 'supabase',
      providerSubject: 'provider-subject',
      providerSessionId: 'provider-session',
      requestId: 'request-1',
      assuranceLevel: 'aal2',
      reauthenticatedAt: '2026-08-02T11:58:00.000Z',
    })

    const requestContext = toSupportRequestContext({
      accountId: '00000000-0000-4000-8000-000000000201',
      accountSessionId: '00000000-0000-4000-8000-000000000211',
      providerSessionId: 'provider-session',
      tenantId: '00000000-0000-4000-8000-000000000001',
      platformAccessGrantId: '00000000-0000-4000-8000-000000000221',
      roleTemplateKey: 'support_agent',
      supportGrantId: '00000000-0000-4000-8000-000000000231',
      supportKind: 'support',
      purpose: 'customer_support',
      allowedCapabilities: ['support.students.read'],
      queryConstraints: [
        {
          kind: 'school',
          tenantId: '00000000-0000-4000-8000-000000000001',
          schoolId: '00000000-0000-4000-8000-000000000101',
        },
      ],
      assuranceLevel: 'aal2',
      reauthenticatedAt: '2026-08-02T11:58:00.000Z',
      securityVersion: 2,
      requestId: 'request-1',
      expiresAt: '2026-08-02T12:28:00.000Z',
      operationId: '00000000-0000-4000-8000-000000000241',
    })
    const policy = toSupportPolicyContext(requestContext, identity)

    assert.equal(policy.personId, undefined)
    assert.equal(policy.tenantId, requestContext.tenantId)
    assert.deepEqual(policy.roleTemplateKeys, ['support_agent'])
    assert.deepEqual(policy.supportAccess, {
      grantId: requestContext.supportGrantId,
      kind: 'support',
      purpose: 'customer_support',
      allowedCapabilities: ['support.students.read'],
      queryConstraint: requestContext.queryConstraints[0],
      expiresAt: requestContext.expiresAt,
    })
  })

  it('requires verified interactive reauthentication evidence', () => {
    const { reauthenticatedAt: _, ...withoutReauthentication } = identity
    assert.throws(
      () => toSupportIdentityDatabaseContext(withoutReauthentication, 'request-1'),
      /REAUTHENTICATION_REQUIRED/
    )
  })
})
