import { createServerClient } from '@openschool/auth/server'
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

  const wwwUrl = process.env.NEXT_PUBLIC_WWW_URL || 'http://www.openschool.local:3000'
  // Use 303 See Other for POST->GET redirect
  return NextResponse.redirect(wwwUrl, { status: 303 })
}
