import { createServerClient, resolveTenantContext } from '@openschool/auth/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { StudentDetail } from '@/components/features/students/StudentDetail'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

interface StudentDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function StudentDetailPage({ params }: StudentDetailPageProps) {
  const { id } = await params
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
        <div className="max-w-2xl mx-auto">
          <p className="text-muted-foreground">You don't have access to any schools.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/students">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Students
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <StudentDetail studentId={id} />
      </main>
    </div>
  )
}

