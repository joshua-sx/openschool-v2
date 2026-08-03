const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SAFE_SEGMENT = /^[a-z0-9][a-z0-9._:-]{0,127}$/i

export type TenantCacheKey = string & { readonly __tenantCacheKey: unique symbol }
export type TenantObjectKey = string & { readonly __tenantObjectKey: unique symbol }

export type TenantBoundaryReason =
  | 'TENANT_ID_REQUIRED'
  | 'TENANT_SCOPE_MISMATCH'
  | 'TENANT_KEY_INVALID'
  | 'TENANT_JOB_INVALID'

export class TenantBoundaryError extends Error {
  readonly name = 'TenantBoundaryError'

  constructor(readonly reason: TenantBoundaryReason) {
    super(reason)
  }
}

function tenantId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new TenantBoundaryError('TENANT_ID_REQUIRED')
  }
  return value.toLowerCase()
}

function segment(value: unknown): string {
  if (typeof value !== 'string' || !SAFE_SEGMENT.test(value)) {
    throw new TenantBoundaryError('TENANT_KEY_INVALID')
  }
  return value
}

export function buildTenantCacheKey(input: {
  tenantId: string
  namespace: string
  resourceId: string
  scopeVersion: string | number
}): TenantCacheKey {
  const canonicalTenantId = tenantId(input.tenantId)
  const scopeVersion = String(input.scopeVersion)
  if (!SAFE_SEGMENT.test(scopeVersion)) throw new TenantBoundaryError('TENANT_KEY_INVALID')
  return [
    `tenant=${canonicalTenantId}`,
    `namespace=${segment(input.namespace)}`,
    `resource=${segment(input.resourceId)}`,
    `scope=${scopeVersion}`,
  ].join('|') as TenantCacheKey
}

export function assertTenantCacheKey(value: unknown, expectedTenantId: string): TenantCacheKey {
  const canonicalTenantId = tenantId(expectedTenantId)
  if (
    typeof value !== 'string' ||
    !value.startsWith(`tenant=${canonicalTenantId}|`) ||
    !value.includes('|namespace=') ||
    !value.includes('|resource=') ||
    !value.includes('|scope=')
  ) {
    throw new TenantBoundaryError('TENANT_SCOPE_MISMATCH')
  }
  return value as TenantCacheKey
}

export interface TenantJobEnvelope<T = unknown> {
  tenantId: string
  jobId: string
  jobType: string
  requestId: string
  payload: T
}

export function assertTenantJobEnvelope<T = unknown>(
  value: unknown
): Readonly<TenantJobEnvelope<T>> {
  if (!value || typeof value !== 'object') throw new TenantBoundaryError('TENANT_JOB_INVALID')
  const candidate = value as Partial<TenantJobEnvelope<T>>
  const canonicalTenantId = tenantId(candidate.tenantId)
  if (
    typeof candidate.jobId !== 'string' ||
    !UUID_PATTERN.test(candidate.jobId) ||
    typeof candidate.requestId !== 'string' ||
    !UUID_PATTERN.test(candidate.requestId) ||
    typeof candidate.jobType !== 'string' ||
    !SAFE_SEGMENT.test(candidate.jobType) ||
    !Object.hasOwn(candidate, 'payload')
  ) {
    throw new TenantBoundaryError('TENANT_JOB_INVALID')
  }
  return Object.freeze({
    tenantId: canonicalTenantId,
    jobId: candidate.jobId.toLowerCase(),
    jobType: candidate.jobType,
    requestId: candidate.requestId.toLowerCase(),
    payload: candidate.payload as T,
  })
}

export function buildTenantObjectKey(input: {
  tenantId: string
  recordId: string
  objectId: string
}): TenantObjectKey {
  return `${tenantId(input.tenantId)}/${segment(input.recordId)}/${segment(input.objectId)}` as TenantObjectKey
}

export function assertTenantObjectKey(value: unknown, expectedTenantId: string): TenantObjectKey {
  const canonicalTenantId = tenantId(expectedTenantId)
  if (typeof value !== 'string') throw new TenantBoundaryError('TENANT_KEY_INVALID')
  const parts = value.split('/')
  if (
    parts.length !== 3 ||
    parts[0] !== canonicalTenantId ||
    !SAFE_SEGMENT.test(parts[1] ?? '') ||
    !SAFE_SEGMENT.test(parts[2] ?? '')
  ) {
    throw new TenantBoundaryError(
      parts[0] && UUID_PATTERN.test(parts[0]) ? 'TENANT_SCOPE_MISMATCH' : 'TENANT_KEY_INVALID'
    )
  }
  return value as TenantObjectKey
}
