import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EnvironmentValidationError, parsePublicEnv } from './public'
import {
  parseInvitationDeliveryEnv,
  parseMigrationEnv,
  parseOpenSignupAllowed,
  parseServerEnv,
  parseStudentSliceEnv,
  parseSupabaseAdminEnv,
  parseWorkerEnv,
} from './server'

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

  it('validates a rotatable invitation-token encryption keyring', () => {
    const key = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    const environment = parseInvitationDeliveryEnv({
      INVITATION_TOKEN_ENCRYPTION_KEY_ID: 'local-v1',
      INVITATION_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ 'local-v1': key }),
    })
    assert.equal(environment.INVITATION_TOKEN_ENCRYPTION_KEY_ID, 'local-v1')
    assert.equal(environment.INVITATION_TOKEN_ENCRYPTION_KEYS['local-v1'], key)
    assert.equal(Object.getPrototypeOf(environment.INVITATION_TOKEN_ENCRYPTION_KEYS), null)
    const prototypeNamedKeyring = parseInvitationDeliveryEnv({
      INVITATION_TOKEN_ENCRYPTION_KEY_ID: '__proto__',
      INVITATION_TOKEN_ENCRYPTION_KEYS: `{"__proto__":"${key}"}`,
    })
    assert.equal(prototypeNamedKeyring.INVITATION_TOKEN_ENCRYPTION_KEYS.__proto__, key)
    assert.throws(
      () =>
        parseInvitationDeliveryEnv({
          INVITATION_TOKEN_ENCRYPTION_KEY_ID: 'missing',
          INVITATION_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ 'local-v1': key }),
        }),
      /must identify a key present/
    )
    assert.throws(
      () =>
        parseInvitationDeliveryEnv({
          INVITATION_TOKEN_ENCRYPTION_KEY_ID: 'local-v1',
          INVITATION_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ 'local-v1': 'too-short' }),
        }),
      /non-256-bit base64url key/
    )
  })

  it('keeps Supabase admin keys server-only and rejects placeholders', () => {
    assert.deepEqual(parseSupabaseAdminEnv({ SUPABASE_SECRET_KEY: 'sb_secret_local_test_key' }), {
      SUPABASE_SECRET_KEY: 'sb_secret_local_test_key',
    })
    assert.throws(
      () => parseSupabaseAdminEnv({ SUPABASE_SECRET_KEY: 'sb_secret_replace_with_project_key' }),
      /must be a server-only Supabase secret key/
    )
    assert.throws(
      () => parseSupabaseAdminEnv({ SUPABASE_SECRET_KEY: 'anon-key' }),
      /must be a server-only Supabase secret key/
    )
    assert.deepEqual(parseSupabaseAdminEnv({ SUPABASE_SECRET_KEY: 'header.payload.signature' }), {
      SUPABASE_SECRET_KEY: 'header.payload.signature',
    })
  })

  it('allows open signup only through an explicit non-production override', () => {
    assert.equal(parseOpenSignupAllowed({}, 'development'), false)
    assert.equal(parseOpenSignupAllowed({ OPENSCHOOL_ALLOW_OPEN_SIGNUP: 'true' }, 'test'), true)
    assert.equal(
      parseOpenSignupAllowed({ OPENSCHOOL_ALLOW_OPEN_SIGNUP: 'true' }, 'production'),
      false
    )
    assert.throws(
      () => parseOpenSignupAllowed({ OPENSCHOOL_ALLOW_OPEN_SIGNUP: 'yes' }, 'development'),
      /must be true or false/
    )
  })
})
