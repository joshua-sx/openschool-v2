import { initTRPC, TRPCError } from '@trpc/server'
import { cookies } from 'next/headers'
import { createServerClient, resolveTenantContext } from '@openschool/auth/server'
import type { TenantContext } from '@openschool/rbac'

/**
 * Create tRPC context from Next.js request
 * Resolves user session and tenant context
 */
export async function createTRPCContext(): Promise<{
  tenantContext: TenantContext | null
  userId: string | null
}> {
  const cookieStore = await cookies()
  
  const supabase = createServerClient(cookieStore)

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user?.id) {
    return {
      tenantContext: null,
      userId: null,
    }
  }

  // Extract orgId and schoolId from headers or query params
  // For now, we'll resolve without specific context
  // In the future, these can come from request headers
  const tenantContext = await resolveTenantContext(session.user.id, {})

  return {
    tenantContext,
    userId: session.user.id,
  }
}

const t = initTRPC.context<Awaited<ReturnType<typeof createTRPCContext>>>().create()

export const router = t.router
export const publicProcedure = t.procedure

