import { and, eq, sql } from 'drizzle-orm'
import { appendSanitizedAuditLedgerEvent } from './audit-ledger'
import { accountLinks, accounts, identityMigrationEvents } from './schema'
import type { DatabaseTransaction } from './tenant-transaction'

export interface AccountLinkLifecycleAuditContext {
  actorPersonId: string
  requestId: string
  correlationId: string
  capability: string
  policyVersion: string
  policyReason: string
  purpose: string
  educationOrganizationId?: string
  schoolId?: string
}

export interface ActivateAccountLinkInput {
  tenantId: string
  accountLinkId: string
  actorAccountId: string
  reason: string
  at?: Date
  audit: AccountLinkLifecycleAuditContext
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
  | 'audit_context_invalid'
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

const SAFE_AUDIT_REFERENCE = /^[A-Za-z0-9_.:/-]{1,512}$/
const SAFE_PURPOSE_CODE = /^[a-z][a-z0-9_.-]{2,63}$/
const UUID_REFERENCE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function validateAuditContext(context: AccountLinkLifecycleAuditContext): void {
  for (const value of [
    context.requestId,
    context.correlationId,
    context.capability,
    context.policyVersion,
    context.policyReason,
  ]) {
    if (!SAFE_AUDIT_REFERENCE.test(value)) {
      throw new AccountLinkLifecycleError('audit_context_invalid', 'Audit context is invalid')
    }
  }
  for (const value of [context.actorPersonId, context.educationOrganizationId, context.schoolId]) {
    if (value && !UUID_REFERENCE.test(value)) {
      throw new AccountLinkLifecycleError('audit_context_invalid', 'Audit scope is invalid')
    }
  }
  if (!UUID_REFERENCE.test(context.actorPersonId)) {
    throw new AccountLinkLifecycleError('audit_context_invalid', 'Audit actor is invalid')
  }
  if (!SAFE_PURPOSE_CODE.test(context.purpose)) {
    throw new AccountLinkLifecycleError('audit_context_invalid', 'Audit purpose must be a code')
  }
}

async function appendAccountLinkAuditEvent(
  tx: DatabaseTransaction,
  input: ActivateAccountLinkInput,
  link: { id: string; tenantId: string; status: string },
  membershipVersion: number,
  eventType: 'account_link.activate' | 'account_link.revoke',
  nextStatus: 'active' | 'revoked',
  at: Date
): Promise<void> {
  validateAuditContext(input.audit)
  await appendSanitizedAuditLedgerEvent(
    tx,
    {
      occurredAt: at,
      eventVersion: 1,
      eventType,
      outcome: 'succeeded',
      tenantId: link.tenantId,
      ...(input.audit.educationOrganizationId
        ? { educationOrganizationId: input.audit.educationOrganizationId }
        : {}),
      ...(input.audit.schoolId ? { schoolId: input.audit.schoolId } : {}),
      actorType: 'account',
      actorAccountId: input.actorAccountId,
      actorPersonId: input.audit.actorPersonId,
      capability: input.audit.capability,
      policyVersion: input.audit.policyVersion,
      policyDecision: {
        effect: 'allow',
        reason: input.audit.policyReason,
        capability: input.audit.capability,
        policyVersion: input.audit.policyVersion,
      },
      requestId: input.audit.requestId,
      correlationId: input.audit.correlationId,
      targetType: 'account_link',
      targetId: link.id,
      dataClasses: ['internal', 'credential'],
      changeSummary: {
        changedFields: ['membershipVersion', 'status'],
      },
      purpose: input.audit.purpose,
      source: 'web',
      retentionClass: 'security',
    },
    {
      topic: 'audit.event.committed',
      deduplicationKey: `${eventType}:${input.audit.requestId}:${link.id}:${membershipVersion}:${nextStatus}`,
    }
  )
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
    evidence: { reason },
    createdAt: at,
  })
  await appendAccountLinkAuditEvent(
    tx,
    input,
    link,
    membershipVersion,
    'account_link.activate',
    'active',
    at
  )

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
    evidence: { reason },
    createdAt: at,
  })
  await appendAccountLinkAuditEvent(
    tx,
    input,
    link,
    membershipVersion,
    'account_link.revoke',
    'revoked',
    at
  )

  return {
    tenantId: link.tenantId,
    accountId: link.accountId,
    personId: link.personId,
    accountLinkId: link.id,
    membershipVersion,
  }
}
