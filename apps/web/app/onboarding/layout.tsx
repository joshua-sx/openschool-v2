import { createServerClient } from '@openschool/auth/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { BookOpen } from 'lucide-react'

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect('/auth/login')
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="h-16 border-b border-gray-100 flex items-center px-6 sticky top-0 bg-white/80 backdrop-blur-sm z-50">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight text-gray-900">
            OpenSchool
          </span>
        </div>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 max-w-5xl mx-auto w-full">
        {children}
      </main>
    </div>
  )
}

