'use client'

import { Header } from './header'
import { Sidebar } from './sidebar'

interface AppShellProps {
  children: React.ReactNode
  user: {
    email: string
  }
  requestContext?: {
    tenantName: string
    activeEducationOrganizationName?: string
    activeSchoolName?: string
    roleTemplateKeys: readonly string[]
  } | null
}

export function AppShell({ children, user, requestContext }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header user={user} requestContext={requestContext} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
