'use client'

import {
  BarChart3,
  BookOpen,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Students', href: '/students', icon: Users },
  { name: 'Classes', href: '/classes', icon: GraduationCap },
  { name: 'Gradebook', href: '/gradebook', icon: BookOpen },
  { name: 'Attendance', href: '/attendance', icon: ClipboardList },
  { name: 'Reports', href: '/reports', icon: BarChart3 },
]

const secondaryNavigation = [{ name: 'Settings', href: '/settings/security', icon: Settings }]

export function Sidebar({ roleTemplateKeys = [] }: { roleTemplateKeys?: readonly string[] }) {
  const pathname = usePathname()
  const canManageSupport = roleTemplateKeys.some((role) =>
    ['org_admin', 'school_admin'].includes(role)
  )
  const visibleSecondaryNavigation = canManageSupport
    ? [
        ...secondaryNavigation,
        { name: 'Support access', href: '/settings/support-access', icon: ShieldCheck },
      ]
    : secondaryNavigation

  return (
    <aside
      aria-label="Primary navigation"
      className="flex min-h-screen w-64 flex-col border-r border-gray-200 bg-white"
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-6 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
            <BookOpen aria-hidden="true" className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight">OpenSchool</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
                isActive
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <item.icon aria-hidden="true" className="w-5 h-5 mr-3" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* Secondary Navigation */}
      <div className="px-3 py-4 border-t border-gray-200">
        {visibleSecondaryNavigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
                isActive
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <item.icon aria-hidden="true" className="w-5 h-5 mr-3" />
              {item.name}
            </Link>
          )
        })}
      </div>
    </aside>
  )
}
