import { createHash } from 'node:crypto'
import {
  appendInvitationAcceptanceAudit,
  appendInvitationAcceptanceDenialAudit,
} from '@openschool/audit'
import { type DatabaseTransaction, accountSessions, withIdentityTransaction } from '@openschool/db'
import { eq, sql } from 'drizzle-orm'
import { hashInvitationToken } from './invitation-token'
import type { VerifiedAccountIdentity } from './verified-identity'

export type InvitationAcceptanceDenialReason =
  | 'INVITATION_INVALID'
  | 'INVITATION_UNAVAILABLE'
  | 'INVITATION_IDENTITY_MISMATCH'
  | 'INVITATION_ACCOUNT_CONFLICT'

export class InvitationAcceptanceError extends Error {
  constructor(
    readonly reason: InvitationAcceptanceDenialReason,
    message: string,
    readonly cause?: unknown
  ) {
    super(message)
    this.name = 'InvitationAcceptanceError'
  }
}

export class InvitationAcceptanceRateLimitError extends Error {
  constructor() {
    super('INVITATION_ACCEPTANCE_RATE_LIMITED')
    this.name = 'InvitationAcceptanceRateLimitError'
  }
}

export interface AcceptedInvitation {
  invitationId: string
  tenantId: string
  accountId: string
  personId: string
  membershipVersion: number
  securityVersion: number
}

interface AcceptanceRow extends Record<string, unknown> {
  acceptanceOutcome: 'accepted' | 'denied'
  acceptanceReason:
    | 'ACCEPTED'
    | 'INVITATION_UNAVAILABLE'
    | 'INVITATION_IDENTITY_MISMATCH'
    | 'INVITATION_ACCOUNT_CONFLICT'
  invitationId: string
  tenantId: string
  accountId: string | null
  personId: string
  membershipVersion: number | string | null
  securityVersion: number | string | null
  educationOrganizationId: string | null
  schoolId: string | null
}

interface RateLimitRow extends Record<string, unknown> {
  allowed: boolean
}

function identityTransactionContext(identity: VerifiedAccountIdentity, requestId: string) {
  return {
    identityProvider: identity.provider,
    providerSubject: identity.subject,
    providerSessionId: identity.sessionId,
    identityEmail: identity.email?.trim().toLowerCase(),
    requestId,
    assuranceLevel: identity.assuranceLevel,
  }
}

export async function enforceInvitationAcceptanceRateLimit(
  identity: VerifiedAccountIdentity,
  requestId = crypto.randomUUID()
): Promise<void> {
  const keyHash = createHash('sha256')
    .update(JSON.stringify([identity.provider, identity.subject]))
    .digest('hex')
  const result = await withIdentityTransaction(
    identityTransactionContext(identity, requestId),
    (tx) =>
      tx.execute<RateLimitRow>(sql`
        select openschool_private.consume_invitation_acceptance_rate_limit(
          ${keyHash}
        ) as "allowed"
      `)
  )
  if (result[0]?.allowed !== true) throw new InvitationAcceptanceRateLimitError()
}

function mapAcceptanceError(error: unknown): InvitationAcceptanceError {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('INVITATION_IDENTITY_MISMATCH')) {
    return new InvitationAcceptanceError(
      'INVITATION_IDENTITY_MISMATCH',
      'The signed-in identity does not match this invitation',
      error
    )
  }
  if (
    message.includes('INVITATION_ACCOUNT_CONFLICT') ||
    message.includes('INVITATION_PERSON_UNAVAILABLE')
  ) {
    return new InvitationAcceptanceError(
      'INVITATION_ACCOUNT_CONFLICT',
      'The invitation cannot be linked to this account',
      error
    )
  }
  if (message.includes('INVITATION_UNAVAILABLE')) {
    return new InvitationAcceptanceError(
      'INVITATION_UNAVAILABLE',
      'The invitation is expired, cancelled, or already used',
      error
    )
  }
  return new InvitationAcceptanceError(
    'INVITATION_INVALID',
    'The invitation could not be accepted',
    error
  )
}

async function registerAcceptedSession(
  tx: DatabaseTransaction,
  accountId: string,
  securityVersion: number,
  identity: VerifiedAccountIdentity,
  at: Date
): Promise<void> {
  const [existing] = await tx
    .select({ accountId: accountSessions.accountId, status: accountSessions.status })
    .from(accountSessions)
    .where(eq(accountSessions.providerSessionId, identity.sessionId))
    .for('update')
    .limit(1)

  if (existing && (existing.accountId !== accountId || existing.status !== 'active')) {
    throw new InvitationAcceptanceError(
      'INVITATION_ACCOUNT_CONFLICT',
      'The verified session belongs to another account'
    )
  }
  if (existing) {
    await tx
      .update(accountSessions)
      .set({
        assuranceLevel: identity.assuranceLevel,
        expiresAt: new Date(identity.expiresAt),
        lastSeenAt: at,
        updatedAt: at,
      })
      .where(eq(accountSessions.providerSessionId, identity.sessionId))
    return
  }
  await tx.insert(accountSessions).values({
    accountId,
    providerSessionId: identity.sessionId,
    status: 'active',
    assuranceLevel: identity.assuranceLevel,
    securityVersion,
    authenticatedAt: new Date(identity.issuedAt),
    expiresAt: new Date(identity.expiresAt),
    lastSeenAt: at,
  })
}

export async function acceptAccountInvitation(
  identity: VerifiedAccountIdentity,
  token: string,
  requestId = crypto.randomUUID(),
  at = new Date()
): Promise<AcceptedInvitation> {
  if (!identity.email) {
    throw new InvitationAcceptanceError(
      'INVITATION_IDENTITY_MISMATCH',
      'A verified email identity is required'
    )
  }
  let tokenHash: string
  try {
    tokenHash = hashInvitationToken(token)
  } catch (error) {
    throw new InvitationAcceptanceError(
      'INVITATION_INVALID',
      'The invitation token is invalid',
      error
    )
  }

  try {
    const accepted = await withIdentityTransaction(
      identityTransactionContext(identity, requestId),
      async (tx) => {
        await tx.execute(sql`select set_config('app.invitation_token_hash', ${tokenHash}, true)`)
        const result = await tx.execute<AcceptanceRow>(sql`
          select
            accepted.acceptance_outcome as "acceptanceOutcome",
            accepted.acceptance_reason as "acceptanceReason",
            accepted.invitation_id as "invitationId",
            accepted.tenant_id as "tenantId",
            accepted.account_id as "accountId",
            accepted.person_id as "personId",
            accepted.membership_version as "membershipVersion",
            accepted.security_version as "securityVersion",
            accepted.education_organization_id as "educationOrganizationId",
            accepted.school_id as "schoolId"
          from openschool_private.accept_account_invitation(
            ${tokenHash},
            ${identity.issuedAt}::timestamp with time zone,
            ${identity.expiresAt}::timestamp with time zone
          ) as accepted
        `)
        const row = result[0]
        if (!row) throw new Error('INVITATION_ACCEPTANCE_RETURNED_NO_RESULT')
        if (row.acceptanceOutcome === 'denied') {
          if (row.acceptanceReason === 'ACCEPTED') {
            throw new Error('INVITATION_ACCEPTANCE_RETURNED_INVALID_REASON')
          }
          await appendInvitationAcceptanceDenialAudit(tx, {
            invitationId: row.invitationId,
            tenantId: row.tenantId,
            requestId,
            occurredAt: at,
            reason: row.acceptanceReason,
            ...(row.educationOrganizationId
              ? { educationOrganizationId: row.educationOrganizationId }
              : {}),
            ...(row.schoolId ? { schoolId: row.schoolId } : {}),
          })
          return Object.freeze({ denialReason: row.acceptanceReason })
        }
        if (row.acceptanceReason !== 'ACCEPTED' || !row.accountId) {
          throw new Error('INVITATION_ACCEPTANCE_RETURNED_INVALID_RESULT')
        }
        const membershipVersion = Number(row.membershipVersion)
        const securityVersion = Number(row.securityVersion)
        if (!Number.isSafeInteger(membershipVersion) || !Number.isSafeInteger(securityVersion)) {
          throw new Error('INVITATION_ACCEPTANCE_RETURNED_INVALID_VERSION')
        }
        await registerAcceptedSession(tx, row.accountId, securityVersion, identity, at)
        await appendInvitationAcceptanceAudit(tx, {
          invitationId: row.invitationId,
          tenantId: row.tenantId,
          accountId: row.accountId,
          personId: row.personId,
          requestId,
          occurredAt: at,
          ...(row.educationOrganizationId
            ? { educationOrganizationId: row.educationOrganizationId }
            : {}),
          ...(row.schoolId ? { schoolId: row.schoolId } : {}),
        })
        return Object.freeze({
          invitationId: row.invitationId,
          tenantId: row.tenantId,
          accountId: row.accountId,
          personId: row.personId,
          membershipVersion,
          securityVersion,
        })
      }
    )
    if ('denialReason' in accepted) {
      throw mapAcceptanceError(new Error(accepted.denialReason))
    }
    return accepted
  } catch (error) {
    if (error instanceof InvitationAcceptanceError) throw error
    throw mapAcceptanceError(error)
  }
}
