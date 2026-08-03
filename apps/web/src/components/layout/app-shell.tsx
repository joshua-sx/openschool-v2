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
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Skip to main content
      </a>
      <Sidebar roleTemplateKeys={requestContext?.roleTemplateKeys} />
      <div className="flex-1 flex flex-col">
        <Header user={user} requestContext={requestContext} />
        <main id="main-content" className="flex-1 p-6" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  )
}
