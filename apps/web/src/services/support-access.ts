import {
  type PlatformRequestContext,
  type TenantRequestContext,
  type VerifiedAccountIdentity,
  toPlatformIdentityDatabaseContext,
  toSupportIdentityDatabaseContext,
  toSupportPolicyContext,
  toSupportRequestContext,
} from '@openschool/auth/server'
import {
  type IssueSupportAccessGrantInput,
  type OpenBreakGlassAccessInput,
  type SupportAccessEffect,
  closeSupportAccess,
  issueSupportAccessGrant,
  listSupportAccessGrants,
  openBreakGlassAccess,
  reviewSupportAccessGrant,
  revokeSupportAccessGrant,
  supportAccessNotifications,
  withPlatformPolicyTransaction,
  withPolicyTenantTransaction,
  withSupportAccessClosureTransaction,
  withSupportPolicyTenantTransaction,
} from '@openschool/db'
import {
  type AllowedPolicyDecision,
  CAPABILITIES,
  type Capability,
  type PolicyContext,
  evaluatePolicy,
  selectPolicyBundle,
} from '@openschool/rbac'
import { TRPCError } from '@trpc/server'
import { desc, eq } from 'drizzle-orm'
import { toDatabasePolicyContext } from './database-context'
import { getAccessibleSchoolsInTransaction } from './schools'
import { getStudentsInTransaction } from './students'

function postgresMessage(error: unknown): string | null {
  let current = error
  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== 'object') return null
    const candidate = current as { message?: unknown; cause?: unknown }
    if (typeof candidate.message === 'string' && candidate.message.includes('SUPPORT_')) {
      return candidate.message.match(/[A-Z][A-Z0-9_]{4,}/)?.[0] ?? null
    }
    current = candidate.cause
  }
  return null
}

function supportError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error
  switch (postgresMessage(error)) {
    case 'SUPPORT_GRANT_CONTEXT_INVALID':
    case 'SUPPORT_ACCESS_CONTEXT_INVALID':
      return new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'REAUTHENTICATION_REQUIRED',
        cause: error,
      })
    case 'SUPPORT_GRANT_CONTEXT_STALE':
    case 'SUPPORT_ACCESS_SESSION_REUSED':
      return new TRPCError({ code: 'CONFLICT', message: 'SECURITY_CONTEXT_STALE', cause: error })
    case 'SUPPORT_GRANT_SCOPE_DENIED':
    case 'SUPPORT_ACCESS_DENIED':
      return new TRPCError({ code: 'FORBIDDEN', message: 'SUPPORT_ACCESS_DENIED', cause: error })
    case 'SUPPORT_ACCOUNT_UNAVAILABLE':
    case 'SUPPORT_GRANT_UNAVAILABLE':
    case 'SUPPORT_GRANT_REVIEW_UNAVAILABLE':
      return new TRPCError({
        code: 'NOT_FOUND',
        message: 'SUPPORT_GRANT_UNAVAILABLE',
        cause: error,
      })
    default:
      return new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'SUPPORT_ACCESS_OPERATION_FAILED',
        cause: error,
      })
  }
}

function assertTenantManagementContext(
  requestContext: TenantRequestContext,
  policyContext: PolicyContext,
  decision: AllowedPolicyDecision
): void {
  if (
    decision.capability !== CAPABILITIES.SUPPORT_GRANTS_MANAGE ||
    requestContext.accountId !== policyContext.accountId ||
    requestContext.personId !== policyContext.personId ||
    requestContext.tenantId !== policyContext.tenantId
  ) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'SUPPORT_GRANT_CONTEXT_MISMATCH' })
  }
}

function managementDatabasePolicy(
  requestContext: TenantRequestContext,
  decision: AllowedPolicyDecision
) {
  return {
    ...toDatabasePolicyContext(decision),
    correlationId: requestContext.requestId,
  } as const
}

export async function approveSupportAccess(
  requestContext: TenantRequestContext,
  policyContext: PolicyContext,
  decision: AllowedPolicyDecision,
  input: IssueSupportAccessGrantInput
): Promise<Readonly<SupportAccessEffect>> {
  assertTenantManagementContext(requestContext, policyContext, decision)
  try {
    return await withPolicyTenantTransaction(
      requestContext,
      managementDatabasePolicy(requestContext, decision),
      (transaction) => issueSupportAccessGrant(transaction, input)
    )
  } catch (error) {
    throw supportError(error)
  }
}

export async function revokeTenantSupportAccess(
  requestContext: TenantRequestContext,
  policyContext: PolicyContext,
  decision: AllowedPolicyDecision,
  supportGrantId: string,
  reason: string
): Promise<Readonly<SupportAccessEffect>> {
  assertTenantManagementContext(requestContext, policyContext, decision)
  try {
    return await withPolicyTenantTransaction(
      requestContext,
      managementDatabasePolicy(requestContext, decision),
      (transaction) => revokeSupportAccessGrant(transaction, supportGrantId, reason)
    )
  } catch (error) {
    throw supportError(error)
  }
}

export async function reviewTenantSupportAccess(
  requestContext: TenantRequestContext,
  policyContext: PolicyContext,
  decision: AllowedPolicyDecision,
  supportGrantId: string,
  outcome: 'confirmed' | 'no_impact' | 'control_gap' | 'incident',
  notes: string
): Promise<Readonly<SupportAccessEffect>> {
  assertTenantManagementContext(requestContext, policyContext, decision)
  try {
    return await withPolicyTenantTransaction(
      requestContext,
      managementDatabasePolicy(requestContext, decision),
      (transaction) => reviewSupportAccessGrant(transaction, supportGrantId, outcome, notes)
    )
  } catch (error) {
    throw supportError(error)
  }
}

export async function listTenantSupportNotifications(
  requestContext: TenantRequestContext,
  policyContext: PolicyContext,
  decision: AllowedPolicyDecision,
  limit = 50
) {
  assertTenantManagementContext(requestContext, policyContext, decision)
  return withPolicyTenantTransaction(
    requestContext,
    managementDatabasePolicy(requestContext, decision),
    (transaction) =>
      transaction
        .select()
        .from(supportAccessNotifications)
        .where(eq(supportAccessNotifications.tenantId, requestContext.tenantId))
        .orderBy(desc(supportAccessNotifications.occurredAt))
        .limit(Math.min(Math.max(limit, 1), 100))
  )
}

export async function listTenantSupportGrants(
  requestContext: TenantRequestContext,
  policyContext: PolicyContext,
  decision: AllowedPolicyDecision,
  limit = 50
) {
  assertTenantManagementContext(requestContext, policyContext, decision)
  try {
    return await withPolicyTenantTransaction(
      requestContext,
      managementDatabasePolicy(requestContext, decision),
      (transaction) => listSupportAccessGrants(transaction, Math.min(Math.max(limit, 1), 100))
    )
  } catch (error) {
    throw supportError(error)
  }
}

export async function openEmergencySupportAccess(
  identity: VerifiedAccountIdentity,
  platformContext: PlatformRequestContext,
  decision: AllowedPolicyDecision,
  input: OpenBreakGlassAccessInput
): Promise<Readonly<SupportAccessEffect>> {
  if (
    decision.capability !== CAPABILITIES.PLATFORM_BREAK_GLASS_OPEN ||
    platformContext.roleTemplateKey !== 'break_glass_operator' ||
    platformContext.providerSessionId !== identity.sessionId
  ) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'BREAK_GLASS_CONTEXT_MISMATCH' })
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
          currentContext.securityVersion !== platformContext.securityVersion
        ) {
          throw new TRPCError({ code: 'CONFLICT', message: 'SECURITY_CONTEXT_STALE' })
        }
        return openBreakGlassAccess(transaction, input)
      }
    )
  } catch (error) {
    throw supportError(error)
  }
}

function supportDecision(
  context: PolicyContext,
  capability: Capability,
  schoolId?: string
): AllowedPolicyDecision {
  const bundle = selectPolicyBundle(process.env.OPENSCHOOL_POLICY_VERSION)
  if (!bundle) throw new TRPCError({ code: 'FORBIDDEN', message: 'UNKNOWN_POLICY_VERSION' })
  const decision = evaluatePolicy({
    bundle,
    context,
    capability,
    resource: {
      kind: capability === CAPABILITIES.SUPPORT_STUDENTS_READ ? 'student' : 'school',
      tenantId: context.tenantId,
      ...(schoolId ? { schoolId } : {}),
    },
    attributes: { purpose: context.supportAccess?.purpose },
  })
  if (decision.effect === 'deny') {
    throw new TRPCError({ code: 'FORBIDDEN', message: decision.reason })
  }
  return decision
}

function currentPolicyVersion(): string {
  const bundle = selectPolicyBundle(process.env.OPENSCHOOL_POLICY_VERSION)
  if (!bundle) throw new TRPCError({ code: 'FORBIDDEN', message: 'UNKNOWN_POLICY_VERSION' })
  return bundle.version
}

export async function getSupportSchools(
  identity: VerifiedAccountIdentity,
  input: { tenantId: string; supportGrantId: string; schoolId?: string }
) {
  const requestId = crypto.randomUUID()
  try {
    return await withSupportPolicyTenantTransaction(
      toSupportIdentityDatabaseContext(identity, requestId),
      input.tenantId,
      input.supportGrantId,
      {
        capability: CAPABILITIES.SUPPORT_SCHOOLS_READ,
        policyVersion: currentPolicyVersion(),
        correlationId: requestId,
      },
      async (transaction, databaseContext) => {
        const requestContext = toSupportRequestContext(databaseContext)
        const context = toSupportPolicyContext(requestContext, identity)
        const decision = supportDecision(context, CAPABILITIES.SUPPORT_SCHOOLS_READ, input.schoolId)
        const schools = await getAccessibleSchoolsInTransaction(
          transaction,
          context,
          decision,
          CAPABILITIES.SUPPORT_SCHOOLS_READ,
          input.schoolId
        )
        return Object.freeze({ requestContext, schools })
      }
    )
  } catch (error) {
    throw supportError(error)
  }
}

export async function getSupportStudents(
  identity: VerifiedAccountIdentity,
  input: { tenantId: string; supportGrantId: string; schoolId: string }
) {
  const requestId = crypto.randomUUID()
  try {
    return await withSupportPolicyTenantTransaction(
      toSupportIdentityDatabaseContext(identity, requestId),
      input.tenantId,
      input.supportGrantId,
      {
        capability: CAPABILITIES.SUPPORT_STUDENTS_READ,
        policyVersion: currentPolicyVersion(),
        correlationId: requestId,
      },
      async (transaction, databaseContext) => {
        const requestContext = toSupportRequestContext(databaseContext)
        const context = toSupportPolicyContext(requestContext, identity)
        const decision = supportDecision(
          context,
          CAPABILITIES.SUPPORT_STUDENTS_READ,
          input.schoolId
        )
        const students = await getStudentsInTransaction(
          transaction,
          context,
          decision,
          CAPABILITIES.SUPPORT_STUDENTS_READ,
          { schoolId: input.schoolId }
        )
        return Object.freeze({ requestContext, students })
      }
    )
  } catch (error) {
    throw supportError(error)
  }
}

export async function closeCurrentSupportAccess(
  identity: VerifiedAccountIdentity,
  input: { tenantId: string; supportGrantId: string; reason: string }
): Promise<Readonly<SupportAccessEffect>> {
  const requestId = crypto.randomUUID()
  try {
    return await withSupportAccessClosureTransaction(
      toSupportIdentityDatabaseContext(identity, requestId),
      input.tenantId,
      input.supportGrantId,
      {
        capability: CAPABILITIES.SUPPORT_SESSIONS_USE,
        policyVersion: currentPolicyVersion(),
        correlationId: requestId,
      },
      (transaction) =>
        closeSupportAccess(transaction, input.tenantId, input.supportGrantId, input.reason)
    )
  } catch (error) {
    throw supportError(error)
  }
}
