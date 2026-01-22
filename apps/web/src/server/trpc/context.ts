import { initTRPC, TRPCError } from '@trpc/server'
import { cookies, headers } from 'next/headers'
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
  const requestedOrgId = headerStore.get('x-org-id') || undefined
  const requestedSchoolId = headerStore.get('x-school-id') || undefined

  // First resolve tenant context to get user's actual memberships
  const tenantContext = await resolveTenantContext(session.user.id, {})

  // Validate requested org/school against user's actual memberships
  // Only use header values if user actually has access to them
  const validatedOrgId = requestedOrgId && tenantContext.orgIds.includes(requestedOrgId)
    ? requestedOrgId
    : undefined
  const validatedSchoolId = requestedSchoolId && tenantContext.schoolIds.includes(requestedSchoolId)
    ? requestedSchoolId
    : undefined

  // If valid headers were provided, re-resolve with the active context
  // This sets the effectiveRole based on the selected org/school
  if (validatedOrgId || validatedSchoolId) {
    const contextWithActive = await resolveTenantContext(session.user.id, {
      orgId: validatedOrgId,
      schoolId: validatedSchoolId,
    })
    return {
      tenantContext: contextWithActive,
      userId: session.user.id,
    }
  }

  return {
    tenantContext,
    userId: session.user.id,
  }
}

const t = initTRPC.context<Awaited<ReturnType<typeof createTRPCContext>>>().create()

export const router = t.router
export const publicProcedure = t.procedure

