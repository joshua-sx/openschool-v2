import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ISOLATION_FIXTURES } from './fixtures'
import {
  TenantBoundaryError,
  assertTenantCacheKey,
  assertTenantJobEnvelope,
  assertTenantObjectKey,
  buildTenantCacheKey,
  buildTenantObjectKey,
} from './tenant-boundaries'

const { requestId, tenantA, tenantB } = ISOLATION_FIXTURES

describe('Tenant-bound non-database keys', () => {
  it('binds cache and object keys to the canonical Tenant', () => {
    const cacheKey = buildTenantCacheKey({
      tenantId: tenantA,
      namespace: 'student-directory',
      resourceId: 'page-1',
      scopeVersion: 7,
    })
    assert.equal(assertTenantCacheKey(cacheKey, tenantA), cacheKey)
    assert.throws(
      () => assertTenantCacheKey(cacheKey, tenantB),
      (error: unknown) =>
        error instanceof TenantBoundaryError && error.reason === 'TENANT_SCOPE_MISMATCH'
    )

    const objectKey = buildTenantObjectKey({
      tenantId: tenantA,
      recordId: 'student-401',
      objectId: 'document-1.pdf',
    })
    assert.equal(assertTenantObjectKey(objectKey, tenantA), objectKey)
    assert.throws(() => assertTenantObjectKey(objectKey, tenantB), TenantBoundaryError)
  })

  it('rejects omitted Tenant keys and unsafe object paths before adapter access', () => {
    assert.throws(
      () => assertTenantCacheKey('namespace=students|resource=page-1|scope=1', tenantA),
      TenantBoundaryError
    )
    assert.throws(
      () => assertTenantObjectKey('student-401/document-1.pdf', tenantA),
      TenantBoundaryError
    )
    assert.throws(
      () => buildTenantObjectKey({ tenantId: tenantA, recordId: '..', objectId: 'secret' }),
      TenantBoundaryError
    )
  })

  it('requires a Tenant on every ordinary background job envelope', () => {
    const job = assertTenantJobEnvelope({
      tenantId: tenantA,
      jobId: requestId,
      jobType: 'attendance_rollup',
      requestId,
      payload: { schoolId: ISOLATION_FIXTURES.schoolAPrimary },
    })
    assert.equal(job.tenantId, tenantA)
    assert.throws(
      () =>
        assertTenantJobEnvelope({
          jobId: requestId,
          jobType: 'attendance_rollup',
          requestId,
          payload: {},
        }),
      (error: unknown) =>
        error instanceof TenantBoundaryError && error.reason === 'TENANT_ID_REQUIRED'
    )
  })
})
