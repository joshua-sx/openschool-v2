import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  CONTEXT_COOKIE_NAMES,
  isAllowedRequestOrigin,
  readTenantContextSelectors,
} from './request-context'

function headers(values: Record<string, string>) {
  return { get: (name: string) => values[name] ?? null }
}

function cookies(values: Record<string, string>) {
  return {
    get: (name: string) => (values[name] ? { value: values[name] } : undefined),
    getAll: () => [],
    set: () => undefined,
  }
}

describe('Tenant context selectors', () => {
  it('treats headers as selectors and gives them precedence over selector cookies', () => {
    const selectors = readTenantContextSelectors(
      headers({
        'x-tenant-id': 'header-tenant',
        'x-education-organization-id': 'header-organization',
        'x-school-id': 'header-school',
      }),
      cookies({
        [CONTEXT_COOKIE_NAMES.tenantId]: 'cookie-tenant',
        [CONTEXT_COOKIE_NAMES.educationOrganizationId]: 'cookie-organization',
        [CONTEXT_COOKIE_NAMES.schoolId]: 'cookie-school',
      })
    )

    assert.deepEqual(selectors, {
      tenantId: 'header-tenant',
      educationOrganizationId: 'header-organization',
      schoolId: 'header-school',
    })
  })

  it('returns no asserted defaults when selectors are absent', () => {
    assert.deepEqual(readTenantContextSelectors(headers({}), cookies({})), {})
  })

  it('falls back to selector cookies when selector headers are absent', () => {
    assert.deepEqual(
      readTenantContextSelectors(
        headers({}),
        cookies({
          [CONTEXT_COOKIE_NAMES.tenantId]: 'cookie-tenant',
          [CONTEXT_COOKIE_NAMES.schoolId]: 'cookie-school',
        })
      ),
      { tenantId: 'cookie-tenant', schoolId: 'cookie-school' }
    )
  })

  it('prefers the canonical organization header over its legacy alias', () => {
    assert.deepEqual(
      readTenantContextSelectors(
        headers({
          'x-education-organization-id': 'canonical-organization',
          'x-org-id': 'alias-organization',
        }),
        cookies({})
      ),
      { educationOrganizationId: 'canonical-organization' }
    )
  })

  it('compares normalized origins and rejects missing or malformed origins', () => {
    assert.equal(isAllowedRequestOrigin('https://school.test', 'https://school.test/'), true)
    assert.equal(isAllowedRequestOrigin('https://school.test', 'https://other.test'), false)
    assert.equal(isAllowedRequestOrigin(null, 'https://school.test'), false)
    assert.equal(isAllowedRequestOrigin('not a url', 'https://school.test'), false)
  })

  it('keeps every server authorization seam off unverified getSession claims', () => {
    const authorizationSeams = [
      new URL('../../middleware.ts', import.meta.url),
      new URL('../../app/auth/callback/route.ts', import.meta.url),
      new URL('../../app/(app)/layout.tsx', import.meta.url),
      new URL('../../app/context/select/route.ts', import.meta.url),
      new URL('./trpc/context.ts', import.meta.url),
    ]

    for (const seam of authorizationSeams) {
      const source = readFileSync(seam, 'utf8')
      assert.equal(/(?:\.auth\.)?\bgetSession\s*\(/.test(source), false, seam.pathname)
    }
  })
})
