import { and, eq, sql } from 'drizzle-orm'
import { accountLinks, accounts, identityMigrationEvents } from './schema'
import type { DatabaseTransaction } from './tenant-transaction'

export interface ActivateAccountLinkInput {
  tenantId: string
  accountLinkId: string
  actorAccountId: string
  reason: string
  at?: Date
  evidence?: Record<string, unknown>
}

export interface RevokeAccountLinkInput extends ActivateAccountLinkInput {}

export interface AccountLinkLifecycleResult {
  accountId: string
  accountLinkId: string
  membershipVersion: number
  personId: string
  tenantId: string
}

export type AccountLinkLifecycleErrorCode =
  | 'account_disabled'
  | 'invalid_status'
  | 'invalid_validity'
  | 'link_not_found'
  | 'reason_required'

export class AccountLinkLifecycleError extends Error {
  constructor(
    readonly code: AccountLinkLifecycleErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'AccountLinkLifecycleError'
  }
}

function requireReason(reason: string): string {
  const normalized = reason.trim()
  if (normalized.length === 0) {
    throw new AccountLinkLifecycleError('reason_required', 'Account Link change requires a reason')
  }
  return normalized
}

function revokedValidUntil(
  link: { validFrom: Date | null; validUntil: Date | null },
  at: Date
): Date {
  if (link.validUntil && link.validUntil.getTime() <= at.getTime()) {
    return link.validUntil
  }
  if (link.validFrom && link.validFrom.getTime() >= at.getTime()) {
    return new Date(link.validFrom.getTime() + 1)
  }
  return at
}

async function bumpMembershipVersion(
  tx: DatabaseTransaction,
  accountId: string,
  at: Date
): Promise<number> {
  const [account] = await tx
    .update(accounts)
    .set({
      membershipVersion: sql`${accounts.membershipVersion} + 1`,
      updatedAt: at,
    })
    .where(eq(accounts.id, accountId))
    .returning({ membershipVersion: accounts.membershipVersion })

  if (!account) {
    throw new AccountLinkLifecycleError('link_not_found', 'Linked Account no longer exists')
  }
  return account.membershipVersion
}

export async function activateAccountLink(
  tx: DatabaseTransaction,
  input: ActivateAccountLinkInput
): Promise<AccountLinkLifecycleResult> {
  const reason = requireReason(input.reason)
  const at = input.at ?? new Date()

  const [link] = await tx
    .select({
      id: accountLinks.id,
      tenantId: accountLinks.tenantId,
      accountId: accountLinks.accountId,
      personId: accountLinks.personId,
      status: accountLinks.status,
      validFrom: accountLinks.validFrom,
      validUntil: accountLinks.validUntil,
    })
    .from(accountLinks)
    .where(and(eq(accountLinks.tenantId, input.tenantId), eq(accountLinks.id, input.accountLinkId)))
    .for('update')

  if (!link) {
    throw new AccountLinkLifecycleError('link_not_found', 'Account Link was not found')
  }
  if (link.status !== 'pending') {
    throw new AccountLinkLifecycleError(
      'invalid_status',
      `Only a pending Account Link can be activated; found ${link.status}`
    )
  }
  if (link.validUntil && link.validUntil.getTime() <= at.getTime()) {
    throw new AccountLinkLifecycleError(
      'invalid_validity',
      'An expired Account Link cannot be activated'
    )
  }

  const [account] = await tx
    .select({ status: accounts.status })
    .from(accounts)
    .where(eq(accounts.id, link.accountId))
    .for('update')
  if (!account) {
    throw new AccountLinkLifecycleError('link_not_found', 'Linked Account no longer exists')
  }
  if (account.status !== 'active') {
    throw new AccountLinkLifecycleError(
      'account_disabled',
      `A ${account.status} Account cannot activate a link`
    )
  }

  const validFrom = link.validFrom ?? at
  await tx
    .update(accountLinks)
    .set({ status: 'active', validFrom, activatedAt: at, updatedAt: at })
    .where(and(eq(accountLinks.tenantId, link.tenantId), eq(accountLinks.id, link.id)))

  const membershipVersion = await bumpMembershipVersion(tx, link.accountId, at)
  await tx.insert(identityMigrationEvents).values({
    tenantId: link.tenantId,
    accountId: link.accountId,
    personId: link.personId,
    accountLinkId: link.id,
    eventType: 'account_link_activated',
    membershipVersion,
    actorAccountId: input.actorAccountId,
    evidence: { ...input.evidence, reason },
    createdAt: at,
  })

  return {
    tenantId: link.tenantId,
    accountId: link.accountId,
    personId: link.personId,
    accountLinkId: link.id,
    membershipVersion,
  }
}

export async function revokeAccountLink(
  tx: DatabaseTransaction,
  input: RevokeAccountLinkInput
): Promise<AccountLinkLifecycleResult> {
  const reason = requireReason(input.reason)
  const at = input.at ?? new Date()

  const [link] = await tx
    .select({
      id: accountLinks.id,
      tenantId: accountLinks.tenantId,
      accountId: accountLinks.accountId,
      personId: accountLinks.personId,
      status: accountLinks.status,
      validFrom: accountLinks.validFrom,
      validUntil: accountLinks.validUntil,
    })
    .from(accountLinks)
    .where(and(eq(accountLinks.tenantId, input.tenantId), eq(accountLinks.id, input.accountLinkId)))
    .for('update')

  if (!link) {
    throw new AccountLinkLifecycleError('link_not_found', 'Account Link was not found')
  }
  if (link.status === 'revoked' || link.status === 'expired') {
    throw new AccountLinkLifecycleError('invalid_status', `Account Link is already ${link.status}`)
  }

  await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.id, link.accountId))
    .for('update')

  const validUntil = revokedValidUntil(link, at)
  await tx
    .update(accountLinks)
    .set({
      status: 'revoked',
      validUntil,
      revokedAt: at,
      revokedByAccountId: input.actorAccountId,
      revocationReason: reason,
      updatedAt: at,
    })
    .where(and(eq(accountLinks.tenantId, link.tenantId), eq(accountLinks.id, link.id)))

  const membershipVersion = await bumpMembershipVersion(tx, link.accountId, at)
  await tx.insert(identityMigrationEvents).values({
    tenantId: link.tenantId,
    accountId: link.accountId,
    personId: link.personId,
    accountLinkId: link.id,
    eventType: 'account_link_revoked',
    membershipVersion,
    actorAccountId: input.actorAccountId,
    evidence: { ...input.evidence, reason },
    createdAt: at,
  })

  return {
    tenantId: link.tenantId,
    accountId: link.accountId,
    personId: link.personId,
    accountLinkId: link.id,
    membershipVersion,
  }
}
