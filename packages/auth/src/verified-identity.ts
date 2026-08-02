export type AssuranceLevel = 'aal1' | 'aal2'

export interface VerifiedAccountIdentity {
  provider: 'supabase'
  subject: string
  sessionId: string
  email: string | null
  assuranceLevel: AssuranceLevel
  issuedAt: string
  expiresAt: string
}

export type IdentityVerificationDenialReason = 'UNAUTHENTICATED' | 'TOKEN_INVALID'

export class IdentityVerificationError extends Error {
  constructor(
    readonly reason: IdentityVerificationDenialReason,
    message: string,
    readonly cause?: unknown
  ) {
    super(message)
    this.name = 'IdentityVerificationError'
  }
}

interface ClaimsResult {
  data: { claims: Record<string, unknown> } | null
  error: unknown | null
}

export interface SupabaseClaimsVerifier {
  auth: {
    getClaims(): Promise<ClaimsResult>
  }
}

function isAudienceAuthenticated(value: unknown): boolean {
  return value === 'authenticated' || (Array.isArray(value) && value.includes('authenticated'))
}

function numericClaim(claims: Record<string, unknown>, name: string): number {
  const value = claims[name]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new IdentityVerificationError('TOKEN_INVALID', `Verified token is missing ${name}`)
  }
  return value
}

/**
 * Establishes identity only from Supabase's verified-claims API. Supabase
 * verifies asymmetric tokens against JWKS and performs an Auth-server
 * verification fallback for symmetric projects before returning claims.
 */
export async function verifySupabaseIdentity(
  supabase: SupabaseClaimsVerifier,
  at = new Date()
): Promise<VerifiedAccountIdentity> {
  let result: ClaimsResult
  try {
    result = await supabase.auth.getClaims()
  } catch (cause) {
    throw new IdentityVerificationError(
      'TOKEN_INVALID',
      'Supabase could not verify the access token',
      cause
    )
  }

  if (result.error) {
    throw new IdentityVerificationError(
      'TOKEN_INVALID',
      'Supabase could not verify the access token',
      result.error
    )
  }
  if (!result.data) {
    throw new IdentityVerificationError('UNAUTHENTICATED', 'No authenticated access token')
  }

  const { claims } = result.data
  const subject = claims.sub
  const sessionId = claims.session_id
  const assuranceLevel = claims.aal
  const issuedAtSeconds = numericClaim(claims, 'iat')
  const expiresAtSeconds = numericClaim(claims, 'exp')
  const nowSeconds = Math.floor(at.getTime() / 1000)

  if (
    typeof subject !== 'string' ||
    subject.length === 0 ||
    typeof sessionId !== 'string' ||
    sessionId.length === 0 ||
    (assuranceLevel !== 'aal1' && assuranceLevel !== 'aal2') ||
    claims.role !== 'authenticated' ||
    !isAudienceAuthenticated(claims.aud) ||
    claims.is_anonymous === true ||
    issuedAtSeconds > nowSeconds + 60 ||
    expiresAtSeconds <= nowSeconds ||
    expiresAtSeconds <= issuedAtSeconds
  ) {
    throw new IdentityVerificationError('TOKEN_INVALID', 'Verified token claims are not acceptable')
  }

  return Object.freeze({
    provider: 'supabase',
    subject,
    sessionId,
    email: typeof claims.email === 'string' ? claims.email : null,
    assuranceLevel,
    issuedAt: new Date(issuedAtSeconds * 1000).toISOString(),
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
  })
}
