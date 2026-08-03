import { appendAuditEventInTransaction, recordAuditAttempt } from '@openschool/audit'
import {
  type MfaAdministrationAdapter,
  createSupabaseMfaAdministrationAdapter,
} from '@openschool/auth/server'
import {
  type IdentityRevocationAction,
  type IdentityRevocationEffect,
  type TenantDatabaseContext,
  accounts,
  applyIdentityRevocation,
  withPolicyTenantTransaction,
} from '@openschool/db'
import { type AllowedPolicyDecision, CAPABILITIES, type PolicyContext } from '@openschool/rbac'
import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { assertDatabasePolicyContext, toDatabasePolicyContext } from './database-context'

interface RevocationAuditDescriptor {
  targetType: string
  changedFields: readonly string[]
  purpose: string
}

const AUDIT_DESCRIPTOR: Readonly<Record<IdentityRevocationAction, RevocationAuditDescriptor>> = {
  account_session_revoke: {
    targetType: 'account.session',
    changedFields: ['sessionStatus'],
    purpose: 'session_revocation',
  },
  account_sessions_revoke: {
    targetType: 'account.sessions',
    changedFields: ['securityVersion', 'sessionStatus'],
    purpose: 'session_revocation',
  },
  account_disable: {
    targetType: 'account',
    changedFields: ['securityVersion', 'sessionStatus', 'status'],
    purpose: 'account_security',
  },
  account_mfa_reset: {
    targetType: 'account.mfa',
    changedFields: ['mfaFactors', 'securityVersion', 'sessionStatus'],
    purpose: 'mfa_recovery',
  },
  affiliation_revoke: {
    targetType: 'account.affiliation',
    changedFields: ['membershipVersion', 'roleAssignments', 'status'],
    purpose: 'membership_revocation',
  },
  role_revoke: {
    targetType: 'account.role_assignment',
    changedFields: ['membershipVersion', 'status'],
    purpose: 'membership_revocation',
  },
}

export interface IdentityRevocationRequest {
  action: IdentityRevocationAction
  targetId: string
  reason: string
}

export interface IdentityRevocationResult {
  action: IdentityRevocationAction
  targetId: string
  effects: readonly IdentityRevocationEffect[]
  auditEventId: string
  invalidationOutboxId: string
  providerMfaReset: 'not_applicable' | 'completed' | 'pending'
  deletedMfaFactorCount: number
}

function postgresMessage(error: unknown): string | null {
  let current = error
  for (let depth = 0; depth < 6; depth += 1) {
    if (typeof current !== 'object' || current === null) return null
    const candidate = current as { message?: unknown; cause?: unknown }
    if (typeof candidate.message === 'string' && candidate.message.startsWith('IDENTITY_')) {
      return candidate.message
    }
    current = candidate.cause
  }
  return null
}

function administratorError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error
  switch (postgresMessage(error)) {
    case 'IDENTITY_REVOCATION_CONTEXT_INVALID':
      return new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'REAUTHENTICATION_REQUIRED',
        cause: error,
      })
    case 'IDENTITY_REVOCATION_CONTEXT_STALE':
      return new TRPCError({ code: 'CONFLICT', message: 'SECURITY_CONTEXT_STALE', cause: error })
    case 'IDENTITY_REVOCATION_TARGET_UNAVAILABLE':
      return new TRPCError({
        code: 'NOT_FOUND',
        message: 'SECURITY_TARGET_UNAVAILABLE',
        cause: error,
      })
    case 'IDENTITY_REVOCATION_TARGET_OUT_OF_SCOPE':
      return new TRPCError({
        code: 'FORBIDDEN',
        message: 'SECURITY_TARGET_OUT_OF_SCOPE',
        cause: error,
      })
    case 'IDENTITY_REVOCATION_SELF_DISABLE_DENIED':
      return new TRPCError({ code: 'BAD_REQUEST', message: 'SELF_DISABLE_DENIED', cause: error })
    default:
      return new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'SECURITY_CHANGE_FAILED',
        cause: error,
      })
  }
}

async function recordRevocationFailure(
  error: unknown,
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  input: IdentityRevocationRequest
): Promise<never> {
  const mapped = administratorError(error)
  const descriptor = AUDIT_DESCRIPTOR[input.action]
  try {
    await recordAuditAttempt(databaseContext, context, decision, {
      eventType: 'account.manage',
      outcome: mapped.code === 'FORBIDDEN' ? 'denied' : 'failed',
      targetType: descriptor.targetType,
      targetId: input.targetId,
      dataClasses: ['credential'],
      change: { changedFields: ['operation'] },
      purpose: descriptor.purpose,
    })
  } catch (auditError) {
    throw new AggregateError(
      [mapped, auditError],
      'Identity revocation failed and its failure evidence could not be recorded'
    )
  }
  throw mapped
}

/**
 * Applies local fail-closed access invalidation first. Supabase factor deletion
 * follows the committed audit/outbox transaction and is safe to retry.
 */
export async function revokeIdentityAccess(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  input: IdentityRevocationRequest,
  mfaAdapter?: MfaAdministrationAdapter
): Promise<Readonly<IdentityRevocationResult>> {
  assertDatabasePolicyContext(databaseContext, context)
  if (decision.capability !== CAPABILITIES.ACCOUNTS_MANAGE) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'SECURITY_CAPABILITY_MISMATCH' })
  }
  const descriptor = AUDIT_DESCRIPTOR[input.action]

  let committed: {
    effects: readonly IdentityRevocationEffect[]
    auditEventId: string
    invalidationOutboxId: string
    providerSubject: string | null
    identityProvider: string | null
  }
  try {
    committed = await withPolicyTenantTransaction(
      databaseContext,
      toDatabasePolicyContext(decision),
      async (tx) => {
        let providerSubject: string | null = null
        let identityProvider: string | null = null
        if (input.action === 'account_mfa_reset') {
          const [target] = await tx
            .select({
              identityProvider: accounts.identityProvider,
              providerSubject: accounts.providerSubject,
            })
            .from(accounts)
            .where(eq(accounts.id, input.targetId))
            .limit(1)
          providerSubject = target?.providerSubject ?? null
          identityProvider = target?.identityProvider ?? null
        }

        const effects = await applyIdentityRevocation(tx, input)
        const occurredAt = effects[0]?.occurredAt ?? new Date()
        const audit = await appendAuditEventInTransaction(tx, databaseContext, context, decision, {
          eventType: 'account.manage',
          outcome: 'succeeded',
          targetType: descriptor.targetType,
          targetId: input.targetId,
          dataClasses: ['credential'],
          change: { changedFields: descriptor.changedFields },
          purpose: descriptor.purpose,
          occurredAt,
          outbox: {
            topic: 'security.context.invalidate',
            deduplicationKey: `identity.revocation:${databaseContext.requestId}:${input.action}:${input.targetId}`,
          },
        })
        if (!audit.outboxId) throw new Error('IDENTITY_REVOCATION_OUTBOX_MISSING')
        return {
          effects,
          auditEventId: audit.eventId,
          invalidationOutboxId: audit.outboxId,
          providerSubject,
          identityProvider,
        }
      }
    )
  } catch (error) {
    return recordRevocationFailure(error, databaseContext, context, decision, input)
  }

  let providerMfaReset: IdentityRevocationResult['providerMfaReset'] = 'not_applicable'
  let deletedMfaFactorCount = 0
  if (input.action === 'account_mfa_reset') {
    providerMfaReset = 'pending'
    if (committed.identityProvider === 'supabase' && committed.providerSubject) {
      try {
        deletedMfaFactorCount = await (
          mfaAdapter ?? createSupabaseMfaAdministrationAdapter()
        ).resetFactors(committed.providerSubject)
        providerMfaReset = 'completed'
      } catch {
        // Local securityVersion/session invalidation already committed. The
        // direct provider operation is safe to retry, and the durable security
        // outbox records that provider reconciliation remains required.
      }
    }
  }

  return Object.freeze({
    action: input.action,
    targetId: input.targetId,
    effects: committed.effects,
    auditEventId: committed.auditEventId,
    invalidationOutboxId: committed.invalidationOutboxId,
    providerMfaReset,
    deletedMfaFactorCount,
  })
}
