import { CONTEXT_COOKIE_NAMES, isAllowedRequestOrigin } from '@/server/request-context'
import {
  IdentityVerificationError,
  TenantRequestContextError,
  createServerClient,
  resolveTenantRequestContext,
  verifySupabaseIdentity,
} from '@openschool/auth/server'
import { getPublicEnv } from '@openschool/config/public'
import { cookies } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'

function stringField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name)
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export async function POST(request: NextRequest) {
  const env = getPublicEnv()
  if (!isAllowedRequestOrigin(request.headers.get('origin'), env.NEXT_PUBLIC_APP_URL)) {
    return new NextResponse('Invalid request origin', { status: 403 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)
  const formData = await request.formData()
  const selectors = {
    tenantId: stringField(formData, 'tenantId'),
    educationOrganizationId: stringField(formData, 'educationOrganizationId'),
    schoolId: stringField(formData, 'schoolId'),
  }
  if (!selectors.tenantId) {
    return new NextResponse('Tenant selection is required', { status: 400 })
  }

  try {
    const identity = await verifySupabaseIdentity(supabase)
    await resolveTenantRequestContext(
      identity,
      selectors,
      { requestId: crypto.randomUUID() },
      { comparisonMode: process.env.NODE_ENV === 'production' ? 'off' : 'enforce' }
    )
  } catch (error) {
    if (error instanceof IdentityVerificationError) {
      return new NextResponse('Authentication required', { status: 401 })
    }
    if (error instanceof TenantRequestContextError) {
      return new NextResponse('Context selection denied', { status: 403 })
    }
    throw error
  }

  const secure = new URL(env.NEXT_PUBLIC_APP_URL).protocol === 'https:'
  const options = {
    httpOnly: true,
    maxAge: 60 * 60 * 8,
    path: '/',
    sameSite: 'lax' as const,
    secure,
  }
  cookieStore.set(CONTEXT_COOKIE_NAMES.tenantId, selectors.tenantId ?? '', options)
  if (selectors.educationOrganizationId) {
    cookieStore.set(
      CONTEXT_COOKIE_NAMES.educationOrganizationId,
      selectors.educationOrganizationId,
      options
    )
  } else {
    cookieStore.delete(CONTEXT_COOKIE_NAMES.educationOrganizationId)
  }
  if (selectors.schoolId) {
    cookieStore.set(CONTEXT_COOKIE_NAMES.schoolId, selectors.schoolId, options)
  } else {
    cookieStore.delete(CONTEXT_COOKIE_NAMES.schoolId)
  }

  return NextResponse.redirect(new URL('/dashboard', env.NEXT_PUBLIC_APP_URL), 303)
}
