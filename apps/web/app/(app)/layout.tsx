import { AppShell } from '@/components/layout'
import { TRPCProvider } from '@/lib/trpc/provider'
import { createServerClient, resolveTenantContext } from '@openschool/auth/server'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
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
  const supabase = createServerClient(cookieStore)

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    const wwwUrl = process.env.NEXT_PUBLIC_WWW_URL || 'http://www.openschool.local:3000'
    redirect(`${wwwUrl}/auth/login`)
  }

  // Resolve tenant context
  let tenantContext = null
  try {
    tenantContext = await resolveTenantContext(session.user.id)
  } catch (error) {
    console.error('Error resolving tenant context:', error)
  }

  return (
    <TRPCProvider>
      <AppShell user={{ email: session.user.email || '' }} tenantContext={tenantContext}>
        {children}
      </AppShell>
    </TRPCProvider>
  )
}
