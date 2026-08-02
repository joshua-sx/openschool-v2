import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EnvironmentValidationError, parsePublicEnv } from './public'
import { parseServerEnv } from './server'

const validPublicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_test_key',
  NEXT_PUBLIC_APP_URL: 'http://app.openschool.local:3000',
  NEXT_PUBLIC_WWW_URL: 'http://www.openschool.local:3000',
  DATABASE_URL: 'postgresql://should-not-be-public',
}

describe('public environment validation', () => {
  it('returns only explicitly public values', () => {
    const parsed = parsePublicEnv(validPublicEnv)

    assert.deepEqual(parsed, {
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_test_key',
      NEXT_PUBLIC_APP_URL: 'http://app.openschool.local:3000',
      NEXT_PUBLIC_WWW_URL: 'http://www.openschool.local:3000',
    })
    assert.equal('DATABASE_URL' in parsed, false)
  })

  it('reports a missing variable by name', () => {
    assert.throws(
      () => parsePublicEnv({ ...validPublicEnv, NEXT_PUBLIC_SUPABASE_URL: undefined }),
      /NEXT_PUBLIC_SUPABASE_URL: is required/
    )
  })

  it('rejects Markdown-corrupted URLs', () => {
    assert.throws(
      () =>
        parsePublicEnv({
          ...validPublicEnv,
          NEXT_PUBLIC_SUPABASE_URL: '[https://example.supabase.co](https://example.supabase.co)',
        }),
      /NEXT_PUBLIC_SUPABASE_URL: contains Markdown link syntax/
    )
  })

  it('rejects the copied Supabase URL placeholder until it is configured', () => {
    assert.throws(
      () =>
        parsePublicEnv({
          ...validPublicEnv,
          NEXT_PUBLIC_SUPABASE_URL: 'https://replace-with-project-ref.supabase.co',
        }),
      /NEXT_PUBLIC_SUPABASE_URL: still contains the template placeholder/
    )
  })

  it('rejects secret keys in public configuration', () => {
    assert.throws(
      () =>
        parsePublicEnv({
          ...validPublicEnv,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_this_must_never_reach_the_browser',
        }),
      EnvironmentValidationError
    )
  })

  it('rejects the copied key placeholder until it is configured', () => {
    assert.throws(
      () =>
        parsePublicEnv({
          ...validPublicEnv,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_replace_with_your_project_key',
        }),
      /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: still contains the template placeholder/
    )
  })

  it('requires distinct application and marketing origins', () => {
    assert.throws(
      () =>
        parsePublicEnv({
          ...validPublicEnv,
          NEXT_PUBLIC_WWW_URL: validPublicEnv.NEXT_PUBLIC_APP_URL,
        }),
      /NEXT_PUBLIC_APP_URL: must use a different origin/
    )
  })
})

describe('server environment validation', () => {
  it('accepts PostgreSQL connection URLs', () => {
    assert.deepEqual(
      parseServerEnv({ DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/db' }),
      {
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/db',
      }
    )
  })

  it('rejects non-PostgreSQL URLs with a variable-specific error', () => {
    assert.throws(
      () => parseServerEnv({ DATABASE_URL: 'https://example.com/db' }),
      /DATABASE_URL: must use one of these protocols: postgres:, postgresql:/
    )
  })
})
