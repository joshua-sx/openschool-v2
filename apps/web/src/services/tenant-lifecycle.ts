import {
  type PlatformRequestContext,
  type VerifiedAccountIdentity,
  toPlatformIdentityDatabaseContext,
} from '@openschool/auth/server'
import {
  type TenantLifecycleAction,
  type TenantLifecycleEffect,
  applyTenantLifecycle,
  withPlatformPolicyTransaction,
} from '@openschool/db'
import { type AllowedPolicyDecision, CAPABILITIES } from '@openschool/rbac'
import { TRPCError } from '@trpc/server'

export interface TenantLifecycleRequest {
  action: TenantLifecycleAction
  tenantId: string
  reason: string
}

function postgresMessage(error: unknown): string | null {
  let current = error
  for (let depth = 0; depth < 6; depth += 1) {
    if (typeof current !== 'object' || current === null) return null
    const candidate = current as { message?: unknown; cause?: unknown }
    if (
      typeof candidate.message === 'string' &&
      candidate.message.startsWith('TENANT_LIFECYCLE_')
    ) {
      return candidate.message
    }
    current = candidate.cause
  }
  return null
}

function lifecycleError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error
  switch (postgresMessage(error)) {
    case 'TENANT_LIFECYCLE_CONTEXT_INVALID':
      return new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'REAUTHENTICATION_REQUIRED',
        cause: error,
      })
    case 'TENANT_LIFECYCLE_CONTEXT_STALE':
      return new TRPCError({ code: 'CONFLICT', message: 'SECURITY_CONTEXT_STALE', cause: error })
    case 'TENANT_LIFECYCLE_TARGET_UNAVAILABLE':
      return new TRPCError({ code: 'NOT_FOUND', message: 'TENANT_UNAVAILABLE', cause: error })
    case 'TENANT_LIFECYCLE_TRANSITION_INVALID':
      return new TRPCError({ code: 'CONFLICT', message: 'TENANT_STATUS_CONFLICT', cause: error })
    default:
      return new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'TENANT_LIFECYCLE_CHANGE_FAILED',
        cause: error,
      })
  }
}

export async function changeTenantLifecycle(
  identity: VerifiedAccountIdentity,
  platformContext: PlatformRequestContext,
  decision: AllowedPolicyDecision,
  input: TenantLifecycleRequest
): Promise<Readonly<TenantLifecycleEffect>> {
  if (
    decision.capability !== CAPABILITIES.PLATFORM_TENANTS_MANAGE ||
    decision.queryConstraints.length !== 1 ||
    decision.queryConstraints[0]?.kind !== 'platform'
  ) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'PLATFORM_CAPABILITY_MISMATCH' })
  }
  if (
    platformContext.providerSessionId !== identity.sessionId ||
    platformContext.assuranceLevel !== identity.assuranceLevel ||
    platformContext.reauthenticatedAt !== identity.reauthenticatedAt
  ) {
    throw new TRPCError({ code: 'CONFLICT', message: 'SECURITY_CONTEXT_STALE' })
  }

  try {
    return await withPlatformPolicyTransaction(
      toPlatformIdentityDatabaseContext(identity, { requestId: platformContext.requestId }),
      {
        capability: decision.capability,
        policyVersion: decision.policyVersion,
        queryConstraints: [{ kind: 'platform' }],
        correlationId: platformContext.requestId,
      },
      async (transaction, currentContext) => {
        if (
          currentContext.accountId !== platformContext.accountId ||
          currentContext.platformAccessGrantId !== platformContext.platformAccessGrantId ||
          currentContext.securityVersion !== platformContext.securityVersion ||
          currentContext.roleTemplateKey !== platformContext.roleTemplateKey
        ) {
          throw new TRPCError({ code: 'CONFLICT', message: 'SECURITY_CONTEXT_STALE' })
        }
        return applyTenantLifecycle(transaction, input)
      }
    )
  } catch (error) {
    throw lifecycleError(error)
  }
}
