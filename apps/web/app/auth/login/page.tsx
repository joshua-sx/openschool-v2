'use client'

import { createBrowserClient } from '@openschool/auth'
import { getPublicEnv } from '@openschool/config/public'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { BookOpen } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState, useSyncExternalStore } from 'react'

// Auth theme colors - matches CSS variables in globals.css
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

export default function LoginPage() {
  const { NEXT_PUBLIC_APP_URL: appUrl } = getPublicEnv()
  const [supabase] = useState(() => createBrowserClient())
  const isMounted = useIsMounted()

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        window.location.href = `${appUrl}/dashboard`
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [appUrl, supabase])

  if (!isMounted) {
    return null
  }

  return (
    <div className="min-h-screen bg-surface-primary flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link
            href="/"
            className="inline-flex items-center space-x-2 mb-6 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">OpenSchool</span>
          </Link>
          <h1 className="text-2xl font-bold text-text-primary mb-2">Welcome back</h1>
          <p className="text-text-secondary">Sign in to your account to continue</p>
        </div>

        <div className="bg-surface-primary border border-border-default rounded-xl p-6 shadow-sm">
          <Auth
            supabaseClient={supabase}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: AUTH_THEME_COLORS,
                },
              },
            }}
            providers={[]}
            redirectTo={`${appUrl}/auth/callback`}
            onlyThirdPartyProviders={false}
          />
        </div>

        <p className="text-center text-sm text-text-secondary mt-6">
          Don&apos;t have an account?{' '}
          <Link href="/auth/signup" className="text-brand font-medium hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
