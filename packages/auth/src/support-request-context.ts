import type { SupportDatabaseContext, SupportIdentityDatabaseContext } from '@openschool/db'
import type { PolicyContext } from '@openschool/rbac'
import type { VerifiedAccountIdentity } from './verified-identity'

export type SupportRequestContext = Readonly<SupportDatabaseContext & { version: 1 }>

export function toSupportIdentityDatabaseContext(
  identity: VerifiedAccountIdentity,
  requestId: string
): SupportIdentityDatabaseContext {
  if (!identity.reauthenticatedAt) {
    throw new Error('REAUTHENTICATION_REQUIRED')
  }
  return Object.freeze({
    identityProvider: identity.provider,
    providerSubject: identity.subject,
    providerSessionId: identity.sessionId,
    requestId,
    assuranceLevel: identity.assuranceLevel,
    reauthenticatedAt: identity.reauthenticatedAt,
  })
}

export function toSupportRequestContext(context: SupportDatabaseContext): SupportRequestContext {
  return Object.freeze({ ...context, version: 1 as const })
}

export function toSupportPolicyContext(
  context: SupportRequestContext,
  identity?: Pick<VerifiedAccountIdentity, 'email'>
): PolicyContext {
  return Object.freeze({
    accountId: context.accountId,
    tenantId: context.tenantId,
    ...(identity?.email ? { userEmail: identity.email } : {}),
    roleTemplateKeys: Object.freeze([context.roleTemplateKey]),
    assuranceLevel: context.assuranceLevel,
    authenticatedAt: context.reauthenticatedAt,
    supportAccess: Object.freeze({
      grantId: context.supportGrantId,
      kind: context.supportKind,
      purpose: context.purpose,
      allowedCapabilities: Object.freeze([...context.allowedCapabilities]),
      queryConstraint: context.queryConstraints[0],
      expiresAt: context.expiresAt,
    }),
  })
}
