import {
  TenantRequestContextError,
  createServerClient,
  openInvitationContinuation,
  registerVerifiedAccountSession,
  verifySupabaseIdentity,
} from '@openschool/auth/server'
import { getPublicEnv } from '@openschool/config/public'
import { getInvitationDeliveryEnv } from '@openschool/config/server'
import { cookies } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'

const PROVIDER_TOKEN_HASH = /^[A-Za-z0-9_-]{20,512}$/

function privateRedirect(destination: string | URL): NextResponse {
  const response = NextResponse.redirect(destination)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}

function authenticationFailure(): NextResponse {
  return privateRedirect(`${getPublicEnv().NEXT_PUBLIC_WWW_URL}/auth/login?error=auth_failed`)
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const tokenHash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type')
  const continuation = requestUrl.searchParams.get('invitation_continuation')
  if (
    !tokenHash ||
    !PROVIDER_TOKEN_HASH.test(tokenHash) ||
    (type !== 'invite' && type !== 'magiclink') ||
    !continuation
  ) {
    return authenticationFailure()
  }

  let invitationToken: string
  try {
    const environment = getInvitationDeliveryEnv()
    invitationToken = openInvitationContinuation(continuation, {
      activeKeyId: environment.INVITATION_TOKEN_ENCRYPTION_KEY_ID,
      keys: environment.INVITATION_TOKEN_ENCRYPTION_KEYS,
    }).token
  } catch {
    return authenticationFailure()
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
  if (error) return authenticationFailure()

  try {
    const identity = await verifySupabaseIdentity(supabase)
    await registerVerifiedAccountSession(identity)
  } catch (error) {
    if (!(error instanceof TenantRequestContextError && error.reason === 'TENANT_DENIED')) {
      return authenticationFailure()
    }
  }

  const destination = new URL('/auth/invitation', getPublicEnv().NEXT_PUBLIC_APP_URL)
  destination.hash = new URLSearchParams({ invitation_token: invitationToken }).toString()
  return privateRedirect(destination)
}
