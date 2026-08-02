import { createServerClient } from '@openschool/auth/server'
import { getPublicEnv } from '@openschool/config/public'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST() {
  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)

  const { error } = await supabase.auth.signOut()

  if (error) {
    console.error('Sign out error:', error.message)
    // Still redirect even on error - user likely wants to leave
  }

  // Use 303 See Other for POST->GET redirect
  return NextResponse.redirect(getPublicEnv().NEXT_PUBLIC_WWW_URL, { status: 303 })
}
