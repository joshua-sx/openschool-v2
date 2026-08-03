import {
  PlatformDatabaseError,
  type PlatformIdentityDatabaseContext,
  resolvePlatformDatabaseContext,
} from '@openschool/db'
import type { PolicyContext } from '@openschool/rbac'
import { TenantRequestContextError, registerVerifiedAccountSession } from './tenant-request-context'
import type { VerifiedAccountIdentity } from './verified-identity'

export type PlatformContextDenialReason =
  | 'ACCOUNT_DISABLED'
  | 'SESSION_REVOKED'
  | 'PLATFORM_ACCESS_DENIED'

export class PlatformRequestContextError extends Error {
  constructor(
    readonly reason: PlatformContextDenialReason,
    message: string,
    readonly cause?: unknown
  ) {
    super(message)
    this.name = 'PlatformRequestContextError'
  }
}

export interface PlatformRequestContext {
  version: 1
  accountId: string
  accountSessionId: string
  providerSessionId: string
  platformAccessGrantId: string
  roleTemplateKey: 'super_admin' | 'support_agent'
  assuranceLevel: 'aal1' | 'aal2'
  reauthenticatedAt?: string
  securityVersion: number
  requestId: string
  expiresAt: string
}

export interface PlatformRequestMetadata {
  requestId: string
}

export function toPlatformIdentityDatabaseContext(
  identity: VerifiedAccountIdentity,
  metadata: PlatformRequestMetadata
): PlatformIdentityDatabaseContext {
  return Object.freeze({
    identityProvider: identity.provider,
    providerSubject: identity.subject,
    providerSessionId: identity.sessionId,
    requestId: metadata.requestId,
    assuranceLevel: identity.assuranceLevel,
    ...(identity.reauthenticatedAt ? { reauthenticatedAt: identity.reauthenticatedAt } : {}),
  })
}

export async function resolvePlatformRequestContext(
  identity: VerifiedAccountIdentity,
  metadata: PlatformRequestMetadata
): Promise<PlatformRequestContext> {
  try {
    // Session registration intentionally uses the ordinary identity-bootstrap
    // seam. The isolated control plane can verify the canonical row but cannot
    // create, refresh, revive, or revoke provider sessions itself.
    await registerVerifiedAccountSession(identity, metadata.requestId)
    const context = await resolvePlatformDatabaseContext(
      toPlatformIdentityDatabaseContext(identity, metadata)
    )
    return Object.freeze({
      version: 1 as const,
      accountId: context.accountId,
      accountSessionId: context.accountSessionId,
      providerSessionId: context.providerSessionId,
      platformAccessGrantId: context.platformAccessGrantId,
      roleTemplateKey: context.roleTemplateKey,
      assuranceLevel: context.assuranceLevel,
      ...(context.reauthenticatedAt ? { reauthenticatedAt: context.reauthenticatedAt } : {}),
      securityVersion: context.securityVersion,
      requestId: context.requestId,
      expiresAt: context.expiresAt,
    })
  } catch (cause) {
    if (cause instanceof TenantRequestContextError) {
      const reason = cause.reason === 'ACCOUNT_DISABLED' ? 'ACCOUNT_DISABLED' : 'SESSION_REVOKED'
      throw new PlatformRequestContextError(reason, cause.message, cause)
    }
    if (cause instanceof PlatformDatabaseError) {
      throw new PlatformRequestContextError('PLATFORM_ACCESS_DENIED', cause.message, cause)
    }
    throw cause
  }
}

export function toPlatformPolicyContext(
  context: PlatformRequestContext,
  identity?: Pick<VerifiedAccountIdentity, 'email'>
): PolicyContext {
  return Object.freeze({
    accountId: context.accountId,
    ...(identity?.email ? { userEmail: identity.email } : {}),
    roleTemplateKeys: Object.freeze([context.roleTemplateKey]),
    assuranceLevel: context.assuranceLevel,
    ...(context.reauthenticatedAt ? { authenticatedAt: context.reauthenticatedAt } : {}),
    platformAccess: true,
  })
}
