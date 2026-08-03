'use client'

import { createBrowserClient } from '@openschool/auth'
import { getPublicEnv } from '@openschool/config/public'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { BookOpen } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState, useSyncExternalStore } from 'react'

const AUTH_THEME_COLORS = {
  brand: '#000000',
  brandAccent: '#1f1f1f',
} as const

const subscribeToClient = () => () => undefined

function useIsMounted() {
  return useSyncExternalStore(
    subscribeToClient,
    () => true,
    () => false
  )
}

export function OpenSignupForm() {
  const { NEXT_PUBLIC_APP_URL: appUrl } = getPublicEnv()
  const [supabase] = useState(() => createBrowserClient())
  const isMounted = useIsMounted()

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) window.location.href = `${appUrl}/dashboard`
    })
    return () => subscription.unsubscribe()
  }, [appUrl, supabase])

  if (!isMounted) return null

  return (
    <div className="min-h-screen bg-surface-primary flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link
            href="/"
            className="inline-flex items-center space-x-2 mb-6 hover:opacity-80 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center">
              <BookOpen aria-hidden="true" className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">OpenSchool</span>
          </Link>
          <h1 className="text-2xl font-bold text-text-primary mb-2">Create a local test account</h1>
          <p className="text-text-secondary">Open signup is enabled for this environment only.</p>
        </div>

        <div className="bg-surface-primary border border-border-default rounded-xl p-6 shadow-sm">
          <Auth
            supabaseClient={supabase}
            appearance={{ theme: ThemeSupa, variables: { default: { colors: AUTH_THEME_COLORS } } }}
            providers={[]}
            redirectTo={`${appUrl}/auth/callback`}
            view="sign_up"
            onlyThirdPartyProviders={false}
          />
        </div>

        <p className="text-center text-sm text-text-secondary mt-6">
          Already have an account?{' '}
          <Link
            href="/auth/login"
            className="text-brand font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
