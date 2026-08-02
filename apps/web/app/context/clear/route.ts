import { CONTEXT_COOKIE_NAMES, isAllowedRequestOrigin } from '@/server/request-context'
import { getPublicEnv } from '@openschool/config/public'
import { type NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const env = getPublicEnv()
  if (!isAllowedRequestOrigin(request.headers.get('origin'), env.NEXT_PUBLIC_APP_URL)) {
    return new NextResponse('Invalid request origin', { status: 403 })
  }

  const response = NextResponse.redirect(new URL('/dashboard', env.NEXT_PUBLIC_APP_URL), 303)
  response.cookies.delete(CONTEXT_COOKIE_NAMES.tenantId)
  response.cookies.delete(CONTEXT_COOKIE_NAMES.educationOrganizationId)
  response.cookies.delete(CONTEXT_COOKIE_NAMES.schoolId)
  return response
}
