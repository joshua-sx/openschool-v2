import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TenantRequestContextCache, buildTenantContextCacheKey } from './context-cache'

describe('Tenant Request Context cache contract', () => {
  it('keys every security and selector input', () => {
    const key = buildTenantContextCacheKey({
      accountId: 'account',
      tenantId: 'tenant',
      sessionId: 'session',
      membershipVersion: 3,
      securityVersion: 4,
      assuranceLevel: 'aal2',
      reauthenticatedAt: '2026-08-02T11:58:00.000Z',
      policyVersion: 5,
      comparisonMode: 'enforce',
      educationOrganizationId: 'organization',
      schoolId: 'school',
    })

    for (const value of [
      'account=account',
      'tenant=tenant',
      'session=session',
      'membership=3',
      'security=4',
      'assurance=aal2',
      'reauthenticated=2026-08-02T11:58:00.000Z',
      'policy=5',
      'comparison=enforce',
      'organization=organization',
      'school=school',
    ]) {
      assert.equal(key.includes(value), true)
    }

    assert.notEqual(
      key,
      buildTenantContextCacheKey({
        accountId: 'account',
        tenantId: 'tenant',
        sessionId: 'session',
        membershipVersion: 3,
        securityVersion: 4,
        assuranceLevel: 'aal2',
        reauthenticatedAt: '2026-08-02T11:57:00.000Z',
        policyVersion: 5,
        comparisonMode: 'observe',
        educationOrganizationId: 'organization',
        schoolId: 'school',
      })
    )
  })

  it('expires entries and supports immediate Account and session invalidation', () => {
    const cache = new TenantRequestContextCache<{ id: string }>()
    const now = new Date('2026-08-02T12:00:00Z')
    cache.set(
      'one',
      { id: 'one' },
      { accountId: 'a', sessionId: 's1', expiresAt: new Date(now.getTime() + 1000) }
    )
    cache.set(
      'two',
      { id: 'two' },
      { accountId: 'a', sessionId: 's2', expiresAt: new Date(now.getTime() + 1000) }
    )

    assert.deepEqual(cache.get('one', now), { id: 'one' })
    cache.invalidateSession('s1')
    assert.equal(cache.get('one', now), null)
    assert.deepEqual(cache.get('two', now), { id: 'two' })
    cache.invalidateAccount('a')
    assert.equal(cache.get('two', now), null)

    cache.set('expired', { id: 'expired' }, { accountId: 'b', sessionId: 's3', expiresAt: now })
    assert.equal(cache.get('expired', now), null)
  })
})
