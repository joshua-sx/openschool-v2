import { AppShell, ContextBoundary } from '@/components/layout'
import { TRPCProvider } from '@/lib/trpc/provider'
import { resolveVerifiedRequestState } from '@/server/request-context'
import {
  type AvailableTenantContext,
  TenantRequestContextError,
  listAvailableTenantContexts,
} from '@openschool/auth/server'
import { getPublicEnv } from '@openschool/config/public'
import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'OpenSchool - Dashboard',
  description: 'Your school management dashboard',
}

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const headerStore = await headers()
  const state = await resolveVerifiedRequestState(cookieStore, headerStore)
  if (
    !state.identity ||
    state.denialReason === 'UNAUTHENTICATED' ||
    state.denialReason === 'TOKEN_INVALID'
  ) {
    redirect(`${getPublicEnv().NEXT_PUBLIC_WWW_URL}/auth/login`)
  }

  const denialReason = state.denialReason ?? (state.requestContext ? null : 'POLICY_DENIED')
  let contextOptions: AvailableTenantContext[] = []
  if (denialReason === 'CONTEXT_REQUIRED') {
    try {
      contextOptions = await listAvailableTenantContexts(state.identity, { limit: 50 })
    } catch (error) {
      if (!(error instanceof TenantRequestContextError)) throw error
    }
  }

  return (
    <TRPCProvider>
      <AppShell user={{ email: state.identity.email ?? '' }} requestContext={state.requestContext}>
        {denialReason ? (
          <ContextBoundary denialReason={denialReason} options={contextOptions} />
        ) : (
          children
        )}
      </AppShell>
    </TRPCProvider>
  )
}
