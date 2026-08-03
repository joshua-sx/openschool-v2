import {
  PlatformRequestContextError,
  resolvePlatformRequestContext,
  toPlatformPolicyContext,
} from '@openschool/auth/server'
import {
  CAPABILITY_REGISTRY,
  type Capability,
  type PolicyContext,
  type PolicyEvaluationAttributes,
  type PolicyResourceDescriptor,
  type ResourceKind,
  type ScopeKind,
  evaluatePolicy,
  selectPolicyBundle,
} from '@openschool/rbac'
import { TRPCError } from '@trpc/server'
import { publicProcedure } from './context'

export const requireAuth = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.policyContext || !ctx.requestContext || !ctx.userId) {
    const contextRequired = ctx.denialReason === 'CONTEXT_REQUIRED'
    const unauthenticated =
      !ctx.denialReason ||
      ctx.denialReason === 'UNAUTHENTICATED' ||
      ctx.denialReason === 'TOKEN_INVALID'
    throw new TRPCError({
      code: contextRequired
        ? 'PRECONDITION_FAILED'
        : unauthenticated
          ? 'UNAUTHORIZED'
          : 'FORBIDDEN',
      message: ctx.denialReason ?? 'UNAUTHENTICATED',
    })
  }

  return next({
    ctx: {
      ...ctx,
      requestContext: ctx.requestContext,
      policyContext: ctx.policyContext,
      userId: ctx.userId,
    },
  })
})

/** Allows verified-but-not-yet-provisioned identities to accept an invitation. */
export const requireVerifiedIdentity = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.identity) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: ctx.denialReason ?? 'UNAUTHENTICATED' })
  }
  return next({ ctx: { ...ctx, identity: ctx.identity } })
})

interface ProtectedProcedureOptions {
  requestedScope?: ScopeKind
  resourceKind?: ResourceKind
}

function policyBundle() {
  return selectPolicyBundle(process.env.OPENSCHOOL_POLICY_VERSION)
}

function throwPolicyDenial(
  decision: Extract<ReturnType<typeof evaluatePolicy>, { effect: 'deny' }>
): never {
  const obligationRequired = [
    'MFA_REQUIRED',
    'REAUTHENTICATION_REQUIRED',
    'PURPOSE_REQUIRED',
  ].includes(decision.reason)
  throw new TRPCError({
    code: obligationRequired ? 'PRECONDITION_FAILED' : 'FORBIDDEN',
    message: decision.reason,
  })
}

/**
 * Authorizes a capability and attaches its approved query constraints to the
 * handler context. Handlers must pass the decision to the data service rather
 * than reconstructing resource rules.
 */
export function protectedProcedure(
  capability: Capability,
  options: ProtectedProcedureOptions = {}
) {
  return requireAuth.use(async ({ ctx, next }) => {
    const resourceKind = options.resourceKind ?? CAPABILITY_REGISTRY[capability].resourceKinds[0]
    if (!resourceKind) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'UNKNOWN_RESOURCE' })
    }
    const decision = evaluatePolicy({
      bundle: policyBundle(),
      context: ctx.policyContext,
      capability,
      ...(options.requestedScope ? { requestedScope: options.requestedScope } : {}),
      resource: {
        kind: resourceKind,
        ...(ctx.policyContext.tenantId ? { tenantId: ctx.policyContext.tenantId } : {}),
      },
    })
    if (decision.effect === 'deny') throwPolicyDenial(decision)

    return next({
      ctx: {
        ...ctx,
        policyContext: ctx.policyContext,
        policyDecision: decision,
        userId: ctx.userId,
      },
    })
  })
}

/**
 * Resolves global authority from the isolated platform store. Tenant request
 * context is intentionally ignored: no Tenant Person or role can satisfy this
 * middleware, and a platform role gains no implicit Tenant data access.
 */
export function platformProcedure(capability: Capability) {
  return requireVerifiedIdentity.use(async ({ ctx, next }) => {
    let platformContext: Awaited<ReturnType<typeof resolvePlatformRequestContext>>
    try {
      platformContext = await resolvePlatformRequestContext(ctx.identity, {
        requestId: crypto.randomUUID(),
      })
    } catch (error) {
      if (error instanceof PlatformRequestContextError) {
        throw new TRPCError({
          code: error.reason === 'SESSION_REVOKED' ? 'CONFLICT' : 'FORBIDDEN',
          message: error.reason,
          cause: error,
        })
      }
      throw error
    }
    const platformPolicyContext = toPlatformPolicyContext(platformContext, ctx.identity)
    const decision = evaluatePolicy({
      bundle: policyBundle(),
      context: platformPolicyContext,
      capability,
      resource: { kind: 'platform' },
    })
    if (decision.effect === 'deny') throwPolicyDenial(decision)

    return next({
      ctx: {
        ...ctx,
        identity: ctx.identity,
        platformContext,
        platformPolicyContext,
        policyDecision: decision,
        userId: platformContext.accountId,
      },
    })
  })
}

/** Evaluates a resource-specific fact set through the same central policy. */
export function assertPolicy(
  context: PolicyContext,
  capability: Capability,
  resource: PolicyResourceDescriptor,
  options: {
    requestedScope?: ScopeKind
    attributes?: PolicyEvaluationAttributes
  } = {}
) {
  const decision = evaluatePolicy({
    bundle: policyBundle(),
    context,
    capability,
    resource,
    ...options,
  })
  if (decision.effect === 'deny') throwPolicyDenial(decision)
  return decision
}
