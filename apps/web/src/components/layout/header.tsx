'use client'

import { useRouter } from 'next/navigation'
import { LogOut, ChevronDown } from 'lucide-react'

interface HeaderProps {
  user: {
    email: string
  }
  tenantContext?: {
    effectiveRole: string
    orgIds: string[]
    schoolIds: string[]
  } | null
}

export function Header({ user, tenantContext }: HeaderProps) {
  const router = useRouter()

  const handleSignOut = async () => {
    const res = await fetch('/auth/signout', { method: 'POST' })
    if (res.ok) {
      const wwwUrl = process.env.NEXT_PUBLIC_WWW_URL || 'http://www.openschool.local:3000'
      window.location.href = wwwUrl
    }
  }

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center space-x-4">
        {/* School Selector - placeholder for now */}
        {tenantContext && tenantContext.schoolIds.length > 0 && (
          <div className="flex items-center space-x-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
            <span className="text-sm text-gray-600">
              {tenantContext.schoolIds.length} school{tenantContext.schoolIds.length !== 1 ? 's' : ''}
            </span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </div>
        )}
      </div>

      <div className="flex items-center space-x-4">
        {tenantContext && (
          <span className="text-xs px-2 py-1 bg-gray-100 rounded text-gray-600 capitalize">
            {tenantContext.effectiveRole}
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
