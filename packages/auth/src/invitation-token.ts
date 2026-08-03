import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const TOKEN_PATTERN = /^osi_v1\.[A-Za-z0-9_-]{43}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const KEY_ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/
const CIPHERTEXT_PATTERN = /^[A-Za-z0-9_-]{16,1024}$/
const IV_PATTERN = /^[A-Za-z0-9_-]{16}$/
const AUTH_TAG_PATTERN = /^[A-Za-z0-9_-]{22}$/
const CONTINUATION_PATTERN = /^[A-Za-z0-9_-]{100,4096}$/

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

export interface InvitationTokenContext {
  tenantId: string
  invitationId: string
  deliveryId: string
}

export interface OpenedInvitationContinuation {
  token: string
  context: InvitationTokenContext
}

function decodeKey(keyId: string, encoded: string | undefined): Buffer {
  if (typeof encoded !== 'string') throw new Error(`INVITATION_ENCRYPTION_KEY_UNKNOWN:${keyId}`)
  const key = Buffer.from(encoded, 'base64url')
  if (key.length !== 32) throw new Error(`INVITATION_ENCRYPTION_KEY_INVALID:${keyId}`)
  return key
}

function aad(tenantId: string, invitationId: string, deliveryId: string): Buffer {
  return Buffer.from(`openschool.invitation.v1:${tenantId}:${invitationId}:${deliveryId}`, 'utf8')
}

function assertSealedInvitationToken(sealed: SealedInvitationToken): void {
  if (
    !KEY_ID_PATTERN.test(sealed.encryptionKeyId) ||
    !CIPHERTEXT_PATTERN.test(sealed.tokenCiphertext) ||
    !IV_PATTERN.test(sealed.tokenIv) ||
    !AUTH_TAG_PATTERN.test(sealed.tokenAuthTag)
  ) {
    throw new Error('INVITATION_ENCRYPTED_PAYLOAD_INVALID')
  }
}

function assertInvitationTokenContext(context: InvitationTokenContext): void {
  if (
    !UUID_PATTERN.test(context.tenantId) ||
    !UUID_PATTERN.test(context.invitationId) ||
    !UUID_PATTERN.test(context.deliveryId)
  ) {
    throw new Error('INVITATION_CONTINUATION_CONTEXT_INVALID')
  }
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
  context: InvitationTokenContext,
  keyring: InvitationTokenKeyring
): SealedInvitationToken {
  hashInvitationToken(token)
  assertInvitationTokenContext(context)
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
  context: InvitationTokenContext,
  keyring: InvitationTokenKeyring
): string {
  assertSealedInvitationToken(sealed)
  assertInvitationTokenContext(context)
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

export function createInvitationContinuation(
  sealed: SealedInvitationToken,
  context: InvitationTokenContext
): string {
  assertSealedInvitationToken(sealed)
  assertInvitationTokenContext(context)
  return Buffer.from(
    JSON.stringify({
      v: 1,
      t: context.tenantId,
      i: context.invitationId,
      d: context.deliveryId,
      k: sealed.encryptionKeyId,
      c: sealed.tokenCiphertext,
      n: sealed.tokenIv,
      a: sealed.tokenAuthTag,
    }),
    'utf8'
  ).toString('base64url')
}

export function openInvitationContinuation(
  continuation: string,
  keyring: InvitationTokenKeyring
): OpenedInvitationContinuation {
  if (!CONTINUATION_PATTERN.test(continuation)) {
    throw new Error('INVITATION_CONTINUATION_INVALID')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(continuation, 'base64url').toString('utf8'))
  } catch {
    throw new Error('INVITATION_CONTINUATION_INVALID')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('INVITATION_CONTINUATION_INVALID')
  }
  const envelope = parsed as Record<string, unknown>
  if (
    envelope.v !== 1 ||
    typeof envelope.t !== 'string' ||
    typeof envelope.i !== 'string' ||
    typeof envelope.d !== 'string' ||
    typeof envelope.k !== 'string' ||
    typeof envelope.c !== 'string' ||
    typeof envelope.n !== 'string' ||
    typeof envelope.a !== 'string'
  ) {
    throw new Error('INVITATION_CONTINUATION_INVALID')
  }
  const context = Object.freeze({
    tenantId: envelope.t,
    invitationId: envelope.i,
    deliveryId: envelope.d,
  })
  const sealed = Object.freeze({
    encryptionKeyId: envelope.k,
    tokenCiphertext: envelope.c,
    tokenIv: envelope.n,
    tokenAuthTag: envelope.a,
  })
  return Object.freeze({ token: openInvitationToken(sealed, context, keyring), context })
}
