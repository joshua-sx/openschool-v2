'use client'

import { Sidebar } from './sidebar'
import { Header } from './header'

interface AppShellProps {
  children: React.ReactNode
  user: {
    email: string
  }
  tenantContext?: {
    effectiveRole: string
    orgIds: string[]
    schoolIds: string[]
    classIds: string[]
  } | null
}

export function AppShell({ children, user, tenantContext }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header user={user} tenantContext={tenantContext} />
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
