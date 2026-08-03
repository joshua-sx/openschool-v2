import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PlatformDatabaseError,
  validatePlatformDatabasePolicyContext,
  validatePlatformIdentityDatabaseContext,
} from './platform-transaction'

const REQUEST_ID = '00000000-0000-4000-8000-000000000299'

function isInvalidContext(error: unknown): boolean {
  return (
    error instanceof PlatformDatabaseError && error.reason === 'PLATFORM_DATABASE_CONTEXT_INVALID'
  )
}

describe('platform database context validation', () => {
  it('accepts verified identity and a single platform policy scope', () => {
    assert.doesNotThrow(() =>
      validatePlatformIdentityDatabaseContext({
        identityProvider: 'supabase',
        providerSubject: 'verified-provider-subject',
        providerSessionId: 'verified-provider-session',
        requestId: REQUEST_ID,
        assuranceLevel: 'aal2',
        reauthenticatedAt: '2026-08-02T11:58:00.000Z',
      })
    )
    assert.doesNotThrow(() =>
      validatePlatformDatabasePolicyContext({
        capability: 'platform.tenants.manage',
        policyVersion: '2026-08-03.v2',
        queryConstraints: [{ kind: 'platform' }],
        correlationId: REQUEST_ID,
      })
    )
  })

  it('rejects malformed identity evidence before database access', () => {
    for (const invalid of [
      { providerSubject: '' },
      { providerSessionId: 'unsafe\nsession' },
      { assuranceLevel: 'aal3' },
      { reauthenticatedAt: '2026-08-02T11:58:00Z' },
    ]) {
      assert.throws(
        () =>
          validatePlatformIdentityDatabaseContext({
            identityProvider: 'supabase',
            providerSubject: 'verified-provider-subject',
            providerSessionId: 'verified-provider-session',
            requestId: REQUEST_ID,
            assuranceLevel: 'aal2',
            ...invalid,
          } as never),
        isInvalidContext
      )
    }
  })

  it('rejects forged, empty, or Tenant-scoped policy evidence', () => {
    for (const invalid of [
      { capability: 'Platform Tenants Manage' },
      { queryConstraints: [] },
      { queryConstraints: [{ kind: 'tenant', tenantId: REQUEST_ID }] },
      { correlationId: '' },
    ]) {
      assert.throws(
        () =>
          validatePlatformDatabasePolicyContext({
            capability: 'platform.tenants.manage',
            policyVersion: '2026-08-03.v2',
            queryConstraints: [{ kind: 'platform' }],
            correlationId: REQUEST_ID,
            ...invalid,
          } as never),
        isInvalidContext
      )
    }
  })
})
