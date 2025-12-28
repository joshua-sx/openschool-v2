import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@openschool/auth/server'
import { cookies } from 'next/headers'

/**
 * Email Confirmation Endpoint (PKCE Flow)
 * 
 * This endpoint handles email verification links from Supabase Auth.
 * It exchanges the token_hash for a session and redirects the user.
 * 
 * Required for Next.js SSR authentication flow.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') || '/dashboard'

  // Create redirect URL without the secret token
  const redirectTo = request.nextUrl.clone()
  redirectTo.pathname = next
  redirectTo.searchParams.delete('token_hash')
  redirectTo.searchParams.delete('type')
  redirectTo.searchParams.delete('next')

  if (token_hash && type) {
    const cookieStore = await cookies()
    const supabase = createServerClient(cookieStore)

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    })

    if (!error) {
      // Successfully verified - redirect to the intended destination
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://app.openschool.local:3000'
      return NextResponse.redirect(`${appUrl}${redirectTo.pathname}${redirectTo.search}`)
    }
  }

  // If there's an error or missing params, redirect to error page
  const wwwUrl = process.env.NEXT_PUBLIC_WWW_URL || 'http://www.openschool.local:3000'
  return NextResponse.redirect(`${wwwUrl}/auth/login?error=verification_failed`)
}

