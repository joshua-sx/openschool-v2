import {
  type TenantCacheKey,
  assertTenantCacheKey,
  buildTenantCacheKey,
} from '@openschool/isolation'
import type { AssuranceLevel } from './verified-identity'

export const TENANT_CONTEXT_POLICY_VERSION = 1
export const MAX_CONTEXT_CACHE_TTL_MS = 5_000

export interface TenantContextCacheKeyInput {
  accountId: string
  tenantId: string
  sessionId: string
  membershipVersion: number
  securityVersion: number
  assuranceLevel: AssuranceLevel
  reauthenticatedAt?: string
  policyVersion: number
  comparisonMode: 'off' | 'observe' | 'enforce'
  educationOrganizationId?: string
  schoolId?: string
}

export function buildTenantContextCacheKey(input: TenantContextCacheKeyInput): TenantCacheKey {
  const boundary = buildTenantCacheKey({
    tenantId: input.tenantId,
    namespace: 'tenant-request-context',
    resourceId: input.accountId,
    scopeVersion: input.policyVersion,
  })
  return [
    boundary,
    `account=${input.accountId}`,
    `session=${input.sessionId}`,
    `membership=${input.membershipVersion}`,
    `security=${input.securityVersion}`,
    `assurance=${input.assuranceLevel}`,
    `reauthenticated=${input.reauthenticatedAt ?? '-'}`,
    `policy=${input.policyVersion}`,
    `comparison=${input.comparisonMode}`,
    `organization=${input.educationOrganizationId ?? '-'}`,
    `school=${input.schoolId ?? '-'}`,
  ].join('|') as TenantCacheKey
}

interface CacheEntry<T> {
  accountId: string
  sessionId: string
  tenantId: string
  expiresAt: number
  value: T
}

/**
 * A bounded short-lived cache implementation. The resolver does not enable it
 * by default; callers must supply an invalidation-capable instance explicitly.
 */
export class TenantRequestContextCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>()

  constructor(private readonly maximumEntries = 1_000) {}

  get(key: TenantCacheKey, at = new Date()): T | null {
    const entry = this.entries.get(key)
    if (!entry) return null
    if (entry.expiresAt <= at.getTime()) {
      this.entries.delete(key)
      return null
    }
    return entry.value
  }

  set(
    key: TenantCacheKey,
    value: T,
    metadata: { accountId: string; tenantId: string; sessionId: string; expiresAt: Date }
  ): void {
    assertTenantCacheKey(key, metadata.tenantId)
    if (this.entries.size >= this.maximumEntries && !this.entries.has(key)) {
      const oldestKey = this.entries.keys().next().value
      if (typeof oldestKey === 'string') this.entries.delete(oldestKey)
    }
    this.entries.set(key, { ...metadata, expiresAt: metadata.expiresAt.getTime(), value })
  }

  invalidateAccount(accountId: string): void {
    for (const [key, entry] of this.entries) {
      if (entry.accountId === accountId) this.entries.delete(key)
    }
  }

  invalidateSession(sessionId: string): void {
    for (const [key, entry] of this.entries) {
      if (entry.sessionId === sessionId) this.entries.delete(key)
    }
  }

  clear(): void {
    this.entries.clear()
  }
}
