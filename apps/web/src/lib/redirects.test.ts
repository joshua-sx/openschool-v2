import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeInternalRedirectPath } from './redirects'

describe('normalizeInternalRedirectPath', () => {
  it('keeps internal application paths', () => {
    assert.equal(
      normalizeInternalRedirectPath('/students/123?tab=profile'),
      '/students/123?tab=profile'
    )
  })

  it('falls back for missing and relative paths', () => {
    assert.equal(normalizeInternalRedirectPath(null), '/dashboard')
    assert.equal(normalizeInternalRedirectPath('dashboard'), '/dashboard')
  })

  it('rejects protocol-relative and backslash-based paths', () => {
    assert.equal(normalizeInternalRedirectPath('//example.com'), '/dashboard')
    assert.equal(normalizeInternalRedirectPath('/\\example.com'), '/dashboard')
    assert.equal(normalizeInternalRedirectPath('\\example.com'), '/dashboard')
  })
})
