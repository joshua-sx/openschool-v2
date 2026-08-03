'use client'

import { ChevronDown, LogOut } from 'lucide-react'

interface HeaderProps {
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

export function Header({ user, requestContext }: HeaderProps) {
  const contextLabel =
    requestContext?.activeSchoolName ??
    requestContext?.activeEducationOrganizationName ??
    requestContext?.tenantName

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center space-x-4">
        {contextLabel && (
          <form action="/context/clear" method="POST">
            <button
              type="submit"
              className="flex min-h-10 items-center space-x-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2"
              aria-label={`Change context from ${contextLabel}`}
            >
              <span className="max-w-64 truncate">{contextLabel}</span>
              <ChevronDown className="w-4 h-4 text-gray-400" aria-hidden="true" />
            </button>
          </form>
        )}
      </div>

      <div className="flex items-center space-x-4">
        {requestContext && (
          <span className="text-xs px-2 py-1 bg-gray-100 rounded text-gray-600 capitalize">
            {requestContext.roleTemplateKeys.join(', ').replaceAll('_', ' ')}
          </span>
        )}
        <span className="text-sm text-gray-600">{user.email}</span>
        <form action="/auth/signout" method="POST">
          <button
            type="submit"
            className="flex min-h-10 items-center rounded-md px-2 text-sm text-gray-600 transition-colors hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <LogOut aria-hidden="true" className="w-4 h-4 mr-1" />
            Sign out
          </button>
        </form>
      </div>
    </header>
  )
}
