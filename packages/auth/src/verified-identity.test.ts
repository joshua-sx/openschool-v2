import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { IdentityVerificationError, verifySupabaseIdentity } from './verified-identity'

const NOW = new Date('2026-08-02T12:00:00Z')
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000)

function verifier(claims: Record<string, unknown> | null, error: unknown = null) {
  return {
    auth: {
      async getClaims() {
        return { data: claims ? { claims } : null, error }
      },
    },
  }
}

function validClaims(overrides: Record<string, unknown> = {}) {
  return {
    sub: 'account-subject',
    session_id: 'session-id',
    aud: 'authenticated',
    role: 'authenticated',
    aal: 'aal1',
    iat: NOW_SECONDS - 60,
    exp: NOW_SECONDS + 600,
    email: 'verified@example.test',
    ...overrides,
  }
}

describe('verified Supabase identity', () => {
  it('returns only identity and assurance from cryptographically verified claims', async () => {
    const identity = await verifySupabaseIdentity(verifier(validClaims()), NOW)

    assert.deepEqual(identity, {
      provider: 'supabase',
      subject: 'account-subject',
      sessionId: 'session-id',
      email: 'verified@example.test',
      assuranceLevel: 'aal1',
      issuedAt: new Date((NOW_SECONDS - 60) * 1000).toISOString(),
      expiresAt: new Date((NOW_SECONDS + 600) * 1000).toISOString(),
    })
    assert.equal(Object.isFrozen(identity), true)
  })

  it('distinguishes missing authentication from invalid verification', async () => {
    await assert.rejects(
      verifySupabaseIdentity(verifier(null), NOW),
      (error: unknown) =>
        error instanceof IdentityVerificationError && error.reason === 'UNAUTHENTICATED'
    )
    await assert.rejects(
      verifySupabaseIdentity(verifier(null, new Error('bad signature')), NOW),
      (error: unknown) =>
        error instanceof IdentityVerificationError && error.reason === 'TOKEN_INVALID'
    )
    await assert.rejects(
      verifySupabaseIdentity(verifier(validClaims(), new Error('ambiguous verification')), NOW),
      (error: unknown) =>
        error instanceof IdentityVerificationError && error.reason === 'TOKEN_INVALID'
    )
    await assert.rejects(
      verifySupabaseIdentity(
        {
          auth: {
            async getClaims() {
              throw new Error('verification unavailable')
            },
          },
        },
        NOW
      ),
      (error: unknown) =>
        error instanceof IdentityVerificationError && error.reason === 'TOKEN_INVALID'
    )
  })

  it('rejects expired, anonymous, wrong-audience, and malformed claims', async () => {
    const cases = [
      validClaims({ exp: NOW_SECONDS }),
      validClaims({ is_anonymous: true }),
      validClaims({ aud: 'service_role' }),
      validClaims({ session_id: null }),
      validClaims({ aal: 'aal3' }),
    ]

    for (const claims of cases) {
      await assert.rejects(
        verifySupabaseIdentity(verifier(claims), NOW),
        (error: unknown) =>
          error instanceof IdentityVerificationError && error.reason === 'TOKEN_INVALID'
      )
    }
  })
})
