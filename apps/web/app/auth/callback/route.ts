import { normalizeInternalRedirectPath } from '@/lib/redirects'
import {
  TenantRequestContextError,
  createServerClient,
  registerVerifiedAccountSession,
  verifySupabaseIdentity,
} from '@openschool/auth/server'
import { getPublicEnv } from '@openschool/config/public'
import { cookies } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const env = getPublicEnv()
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = normalizeInternalRedirectPath(requestUrl.searchParams.get('next'))

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(cookieStore)

    // Exchange code for session
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      try {
        const identity = await verifySupabaseIdentity(supabase)
        await registerVerifiedAccountSession(identity)
        return NextResponse.redirect(new URL(next, env.NEXT_PUBLIC_APP_URL))
      } catch (error) {
        if (
          next.startsWith('/auth/invitation') &&
          error instanceof TenantRequestContextError &&
          error.reason === 'TENANT_DENIED'
        ) {
          // A verified invitee has no Account yet; the private acceptance flow
          // creates it atomically after checking the invitation identity.
          return NextResponse.redirect(new URL(next, env.NEXT_PUBLIC_APP_URL))
        }
        return NextResponse.redirect(`${env.NEXT_PUBLIC_WWW_URL}/auth/login?error=auth_failed`)
      }
    }
  }

  // If there's an error or no code, redirect to login
  return NextResponse.redirect(`${env.NEXT_PUBLIC_WWW_URL}/auth/login?error=auth_failed`)
}
