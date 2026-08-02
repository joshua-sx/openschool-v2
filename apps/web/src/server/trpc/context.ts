import type {
  TenantContextDenialReason,
  TenantRequestContext,
  VerifiedAccountIdentity,
} from '@openschool/auth/server'
import type { PolicyContext } from '@openschool/rbac'
import { initTRPC } from '@trpc/server'
import { cookies, headers } from 'next/headers'
import { resolveVerifiedRequestState } from '../request-context'

/**
 * Create tRPC context from Next.js request
 * Resolves user session and tenant context
 */
export async function createTRPCContext(): Promise<{
  denialReason: TenantContextDenialReason | null
  identity: VerifiedAccountIdentity | null
  requestContext: TenantRequestContext | null
  policyContext: PolicyContext | null
  userId: string | null
}> {
  const cookieStore = await cookies()
  const headerStore = await headers()
  const state = await resolveVerifiedRequestState(cookieStore, headerStore)

  return {
    ...state,
    userId: state.requestContext?.accountId ?? null,
  }
}

const t = initTRPC.context<Awaited<ReturnType<typeof createTRPCContext>>>().create()

export const router = t.router
export const publicProcedure = t.procedure
