import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const TOKEN_PATTERN = /^osi_v1\.[A-Za-z0-9_-]{43}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/

export interface InvitationTokenKeyring {
  activeKeyId: string
  keys: Readonly<Record<string, string>>
}

export interface SealedInvitationToken {
  encryptionKeyId: string
  tokenCiphertext: string
  tokenIv: string
  tokenAuthTag: string
}

function decodeKey(keyId: string, encoded: string | undefined): Buffer {
  if (!encoded) throw new Error(`INVITATION_ENCRYPTION_KEY_UNKNOWN:${keyId}`)
  const key = Buffer.from(encoded, 'base64url')
  if (key.length !== 32) throw new Error(`INVITATION_ENCRYPTION_KEY_INVALID:${keyId}`)
  return key
}

function aad(tenantId: string, invitationId: string, deliveryId: string): Buffer {
  return Buffer.from(`openschool.invitation.v1:${tenantId}:${invitationId}:${deliveryId}`, 'utf8')
}

export function normalizeInvitationEmail(email: string): string {
  const normalized = email.trim().toLowerCase()
  if (normalized.length < 3 || normalized.length > 320 || !EMAIL_PATTERN.test(normalized)) {
    throw new Error('INVITATION_EMAIL_INVALID')
  }
  return normalized
}

export function generateInvitationToken(): string {
  return `osi_v1.${randomBytes(32).toString('base64url')}`
}

export function hashInvitationToken(token: string): string {
  if (!TOKEN_PATTERN.test(token)) throw new Error('INVITATION_TOKEN_INVALID')
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function sealInvitationToken(
  token: string,
  context: { tenantId: string; invitationId: string; deliveryId: string },
  keyring: InvitationTokenKeyring
): SealedInvitationToken {
  hashInvitationToken(token)
  const key = decodeKey(keyring.activeKeyId, keyring.keys[keyring.activeKeyId])
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(aad(context.tenantId, context.invitationId, context.deliveryId))
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])

  return Object.freeze({
    encryptionKeyId: keyring.activeKeyId,
    tokenCiphertext: ciphertext.toString('base64url'),
    tokenIv: iv.toString('base64url'),
    tokenAuthTag: cipher.getAuthTag().toString('base64url'),
  })
}

export function openInvitationToken(
  sealed: SealedInvitationToken,
  context: { tenantId: string; invitationId: string; deliveryId: string },
  keyring: InvitationTokenKeyring
): string {
  const key = decodeKey(sealed.encryptionKeyId, keyring.keys[sealed.encryptionKeyId])
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.tokenIv, 'base64url'))
  decipher.setAAD(aad(context.tenantId, context.invitationId, context.deliveryId))
  decipher.setAuthTag(Buffer.from(sealed.tokenAuthTag, 'base64url'))
  const token = Buffer.concat([
    decipher.update(Buffer.from(sealed.tokenCiphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
  hashInvitationToken(token)
  return token
}
