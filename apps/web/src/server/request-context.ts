import {
  IdentityVerificationError,
  type TenantContextDenialReason,
  type TenantContextSelectors,
  type TenantRequestContext,
  TenantRequestContextError,
  type VerifiedAccountIdentity,
  createServerClient,
  resolveTenantRequestContext,
  toRbacTenantContext,
  verifySupabaseIdentity,
} from '@openschool/auth/server'
import type { TenantContext } from '@openschool/rbac'
import type { CookieOptions } from '@supabase/ssr'

export const CONTEXT_COOKIE_NAMES = {
  tenantId: 'openschool_tenant_id',
  educationOrganizationId: 'openschool_education_organization_id',
  schoolId: 'openschool_school_id',
} as const

interface HeaderReader {
  get(name: string): string | null
}

interface CookieStore {
  get(name: string): { value: string } | undefined
  getAll(): Array<{ name: string; value: string }>
  set(name: string, value: string, options: CookieOptions): void
}

export interface VerifiedRequestState {
  identity: VerifiedAccountIdentity | null
  requestContext: TenantRequestContext | null
  tenantContext: TenantContext | null
  denialReason: TenantContextDenialReason | null
}

export function isAllowedRequestOrigin(origin: string | null, configuredUrl: string): boolean {
  if (!origin) return false
  try {
    return new URL(origin).origin === new URL(configuredUrl).origin
  } catch {
    return false
  }
}

export function readTenantContextSelectors(
  headerStore: HeaderReader,
  cookieStore: CookieStore
): TenantContextSelectors {
  const tenantId =
    headerStore.get('x-tenant-id') ?? cookieStore.get(CONTEXT_COOKIE_NAMES.tenantId)?.value
  const educationOrganizationId =
    headerStore.get('x-education-organization-id') ??
    headerStore.get('x-org-id') ??
    cookieStore.get(CONTEXT_COOKIE_NAMES.educationOrganizationId)?.value
  const schoolId =
    headerStore.get('x-school-id') ?? cookieStore.get(CONTEXT_COOKIE_NAMES.schoolId)?.value

  return {
    ...(tenantId ? { tenantId } : {}),
    ...(educationOrganizationId ? { educationOrganizationId } : {}),
    ...(schoolId ? { schoolId } : {}),
  }
}

export async function resolveVerifiedRequestState(
  cookieStore: CookieStore,
  headerStore: HeaderReader,
  requiredAssuranceLevel: 'aal1' | 'aal2' = 'aal1'
): Promise<VerifiedRequestState> {
  const supabase = createServerClient(cookieStore)
  let identity: VerifiedAccountIdentity

  try {
    identity = await verifySupabaseIdentity(supabase)
  } catch (error) {
    if (error instanceof IdentityVerificationError) {
      return {
        identity: null,
        requestContext: null,
        tenantContext: null,
        denialReason: error.reason,
      }
    }
    throw error
  }

  try {
    const requestContext = await resolveTenantRequestContext(
      identity,
      readTenantContextSelectors(headerStore, cookieStore),
      { requestId: crypto.randomUUID() },
      {
        requiredAssuranceLevel,
        comparisonMode: process.env.NODE_ENV === 'production' ? 'off' : 'enforce',
      }
    )
    return {
      identity,
      requestContext,
      tenantContext: toRbacTenantContext(requestContext, identity.email),
      denialReason: null,
    }
  } catch (error) {
    if (error instanceof TenantRequestContextError) {
      return {
        identity,
        requestContext: null,
        tenantContext: null,
        denialReason: error.reason,
      }
    }
    throw error
  }
}
