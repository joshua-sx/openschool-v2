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
              className="flex items-center space-x-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
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
            className="flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <LogOut className="w-4 h-4 mr-1" />
            Sign Out
          </button>
        </form>
      </div>
    </header>
  )
}
