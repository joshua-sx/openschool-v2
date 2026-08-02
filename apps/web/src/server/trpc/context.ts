import { createServerClient, resolveTenantContext } from '@openschool/auth/server'
import type { TenantContext } from '@openschool/rbac'
import { initTRPC } from '@trpc/server'
import { cookies, headers } from 'next/headers'

/**
 * Create tRPC context from Next.js request
 * Resolves user session and tenant context
 */
export async function createTRPCContext(): Promise<{
  tenantContext: TenantContext | null
  userId: string | null
}> {
  const cookieStore = await cookies()
  const headerStore = await headers()

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

  // Extract orgId and schoolId from custom headers
  // These should be set by the client based on user's current selection
  const orgId = headerStore.get('x-org-id') || undefined
  const schoolId = headerStore.get('x-school-id') || undefined

  // Resolve tenant context with the active org/school if provided
  const tenantContext = await resolveTenantContext(session.user.id, {
    orgId,
    schoolId,
  })

  return {
    tenantContext,
    userId: session.user.id,
  }
}

const t = initTRPC.context<Awaited<ReturnType<typeof createTRPCContext>>>().create()

export const router = t.router
export const publicProcedure = t.procedure
