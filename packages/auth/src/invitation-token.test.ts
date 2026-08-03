import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  generateInvitationToken,
  hashInvitationToken,
  normalizeInvitationEmail,
  openInvitationToken,
  sealInvitationToken,
} from './invitation-token'

const keyring = {
  activeKeyId: 'test-v1',
  keys: { 'test-v1': Buffer.alloc(32, 7).toString('base64url') },
}
const context = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  invitationId: '00000000-0000-4000-8000-000000000002',
  deliveryId: '00000000-0000-4000-8000-000000000003',
}

describe('invitation token security', () => {
  it('generates opaque versioned tokens and stores only deterministic hashes', () => {
    const token = generateInvitationToken()
    assert.match(token, /^osi_v1\.[A-Za-z0-9_-]{43}$/)
    assert.match(hashInvitationToken(token), /^[0-9a-f]{64}$/)
    assert.notEqual(generateInvitationToken(), token)
  })

  it('round-trips AES-GCM ciphertext bound to its Tenant, invitation, and delivery', () => {
    const token = generateInvitationToken()
    const sealed = sealInvitationToken(token, context, keyring)
    assert.equal(openInvitationToken(sealed, context, keyring), token)
    assert.equal(JSON.stringify(sealed).includes(token), false)
    assert.throws(
      () => openInvitationToken(sealed, { ...context, invitationId: crypto.randomUUID() }, keyring),
      /authenticate data|unable to authenticate/i
    )
  })

  it('rejects malformed tokens, email addresses, and unknown encryption keys', () => {
    assert.throws(() => hashInvitationToken('raw-token'), /INVITATION_TOKEN_INVALID/)
    assert.throws(() => normalizeInvitationEmail('not-an-email'), /INVITATION_EMAIL_INVALID/)
    assert.equal(normalizeInvitationEmail(' Admin@School.Test '), 'admin@school.test')
    const sealed = sealInvitationToken(generateInvitationToken(), context, keyring)
    assert.throws(
      () => openInvitationToken(sealed, context, { activeKeyId: 'other', keys: {} }),
      /INVITATION_ENCRYPTION_KEY_UNKNOWN/
    )
  })
})
