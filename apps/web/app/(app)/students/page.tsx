import { createServerClient, resolveTenantContext } from '@openschool/auth/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { StudentList } from '@/components/features/students/StudentList'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function StudentsPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    const wwwUrl = process.env.NEXT_PUBLIC_WWW_URL || 'http://www.openschool.local:3000'
    redirect(`${wwwUrl}/auth/login`)
  }

  // Resolve tenant context
  let tenantContext
  try {
    tenantContext = await resolveTenantContext(session.user.id)
  } catch (error) {
    console.error('Error resolving tenant context:', error)
    tenantContext = null
  }

  if (!tenantContext || tenantContext.schoolIds.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <Card>
          <CardHeader>
            <CardTitle>No Access</CardTitle>
            <CardDescription>
              You don't have access to any schools. Contact your administrator.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  // For now, use the first school. In the future, we can add school selection
  const schoolId = tenantContext.schoolIds[0]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-2">
              <a href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">
                ← Back to Dashboard
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <StudentList schoolId={schoolId} />
      </main>
    </div>
  )
}

