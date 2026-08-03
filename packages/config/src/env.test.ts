import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EnvironmentValidationError, parsePublicEnv } from './public'
import { parseMigrationEnv, parseServerEnv, parseStudentSliceEnv, parseWorkerEnv } from './server'

const validPublicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_test_key',
  NEXT_PUBLIC_APP_URL: 'http://app.openschool.local:3000',
  NEXT_PUBLIC_WWW_URL: 'http://www.openschool.local:3000',
  DATABASE_MIGRATION_URL: 'postgresql://should-not-be-public',
  DATABASE_RUNTIME_URL: 'postgresql://should-not-be-public',
  DATABASE_WORKER_URL: 'postgresql://should-not-be-public',
  DATABASE_MIGRATION_ROLE: 'should-not-be-public',
  DATABASE_RUNTIME_ROLE: 'should-not-be-public',
  DATABASE_WORKER_ROLE: 'should-not-be-public',
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
    assert.equal('DATABASE_MIGRATION_URL' in parsed, false)
    assert.equal('DATABASE_RUNTIME_URL' in parsed, false)
    assert.equal('DATABASE_WORKER_URL' in parsed, false)
    assert.equal('DATABASE_MIGRATION_ROLE' in parsed, false)
    assert.equal('DATABASE_RUNTIME_ROLE' in parsed, false)
    assert.equal('DATABASE_WORKER_ROLE' in parsed, false)
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
      parseServerEnv({
        DATABASE_RUNTIME_URL: 'postgresql://openschool_runtime:secret@localhost:5432/db',
        DATABASE_MIGRATION_ROLE: 'migration',
        DATABASE_RUNTIME_ROLE: 'openschool_runtime',
        DATABASE_WORKER_ROLE: 'openschool_worker',
      }),
      {
        DATABASE_RUNTIME_URL: 'postgresql://openschool_runtime:secret@localhost:5432/db',
        DATABASE_MIGRATION_ROLE: 'migration',
        DATABASE_RUNTIME_ROLE: 'openschool_runtime',
        DATABASE_WORKER_ROLE: 'openschool_worker',
      }
    )
  })

  it('rejects non-PostgreSQL migration URLs with a variable-specific error', () => {
    assert.throws(
      () => parseMigrationEnv({ DATABASE_MIGRATION_URL: 'https://example.com/db' }),
      /DATABASE_MIGRATION_URL: must use one of these protocols: postgres:, postgresql:/
    )
  })

  it('requires distinct migration, runtime, and worker roles', () => {
    assert.throws(
      () =>
        parseServerEnv({
          DATABASE_RUNTIME_URL: 'postgresql://openschool_runtime:two@localhost:5432/db',
          DATABASE_MIGRATION_ROLE: 'owner',
          DATABASE_RUNTIME_ROLE: 'openschool_runtime',
          DATABASE_WORKER_ROLE: 'owner',
        }),
      /migration, runtime, and worker database roles must be distinct/
    )
  })

  it('validates the separately loaded worker role', () => {
    assert.deepEqual(
      parseWorkerEnv({
        DATABASE_WORKER_URL: 'postgresql://openschool_worker:secret@localhost:5432/db',
        DATABASE_MIGRATION_ROLE: 'migration',
        DATABASE_RUNTIME_ROLE: 'openschool_runtime',
        DATABASE_WORKER_ROLE: 'openschool_worker',
      }),
      {
        DATABASE_WORKER_URL: 'postgresql://openschool_worker:secret@localhost:5432/db',
        DATABASE_MIGRATION_ROLE: 'migration',
        DATABASE_RUNTIME_ROLE: 'openschool_runtime',
        DATABASE_WORKER_ROLE: 'openschool_worker',
      }
    )
  })

  it('rejects a worker URL that does not match the asserted worker role', () => {
    assert.throws(
      () =>
        parseWorkerEnv({
          DATABASE_WORKER_URL: 'postgresql://openschool_runtime:secret@localhost:5432/db',
          DATABASE_MIGRATION_ROLE: 'migration',
          DATABASE_RUNTIME_ROLE: 'openschool_runtime',
          DATABASE_WORKER_ROLE: 'openschool_worker',
        }),
      /DATABASE_WORKER_URL: username must match the DATABASE_WORKER_ROLE assertion/
    )
  })

  it('requires an explicit forced-RLS or disabled student slice mode', () => {
    assert.deepEqual(parseStudentSliceEnv({ OPENSCHOOL_STUDENT_SLICE_MODE: 'forced_rls' }), {
      OPENSCHOOL_STUDENT_SLICE_MODE: 'forced_rls',
    })
    assert.deepEqual(parseStudentSliceEnv({ OPENSCHOOL_STUDENT_SLICE_MODE: 'disabled' }), {
      OPENSCHOOL_STUDENT_SLICE_MODE: 'disabled',
    })
    assert.throws(
      () => parseStudentSliceEnv({ OPENSCHOOL_STUDENT_SLICE_MODE: 'owner_fallback' }),
      /OPENSCHOOL_STUDENT_SLICE_MODE: must be forced_rls or disabled/
    )
  })
})
