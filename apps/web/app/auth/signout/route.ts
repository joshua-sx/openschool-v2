import { createServerClient } from '@openschool/auth/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST() {
  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)

  await supabase.auth.signOut()

  const wwwUrl = process.env.NEXT_PUBLIC_WWW_URL || 'http://www.openschool.local:3000'
  return NextResponse.redirect(wwwUrl)
}
