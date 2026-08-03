import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  toPlatformIdentityDatabaseContext,
  toPlatformPolicyContext,
} from './platform-request-context'

describe('platform request context conversion', () => {
  it('keeps provider evidence server-side and never invents a Tenant Person', () => {
    const identity = {
      provider: 'supabase' as const,
      subject: 'provider-subject',
      sessionId: 'provider-session',
      email: 'platform@example.com',
      assuranceLevel: 'aal2' as const,
      reauthenticatedAt: '2026-08-02T11:58:00.000Z',
      issuedAt: '2026-08-02T11:58:00.000Z',
      expiresAt: '2026-08-02T12:58:00.000Z',
    }
    const databaseContext = toPlatformIdentityDatabaseContext(identity, { requestId: 'request-1' })
    assert.deepEqual(databaseContext, {
      identityProvider: 'supabase',
      providerSubject: 'provider-subject',
      providerSessionId: 'provider-session',
      requestId: 'request-1',
      assuranceLevel: 'aal2',
      reauthenticatedAt: '2026-08-02T11:58:00.000Z',
    })

    const policy = toPlatformPolicyContext(
      {
        version: 1,
        accountId: 'account-1',
        accountSessionId: 'account-session-1',
        providerSessionId: 'provider-session',
        platformAccessGrantId: 'platform-grant-1',
        roleTemplateKey: 'super_admin',
        assuranceLevel: 'aal2',
        reauthenticatedAt: '2026-08-02T11:58:00.000Z',
        securityVersion: 1,
        requestId: 'request-1',
        expiresAt: '2026-08-02T12:58:00.000Z',
      },
      identity
    )
    assert.equal(policy.personId, undefined)
    assert.equal(policy.tenantId, undefined)
    assert.equal(policy.platformAccess, true)
    assert.deepEqual(policy.roleTemplateKeys, ['super_admin'])
  })
})
