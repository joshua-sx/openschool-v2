import {
  type EnvironmentSource,
  EnvironmentValidationError,
  parseUrl,
  requireValue,
} from './validation'

const DATABASE_ROLE_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/
export const DATABASE_RUNTIME_ROLE_NAME = 'openschool_runtime'
export const DATABASE_WORKER_ROLE_NAME = 'openschool_worker'

export interface DatabaseRoleEnvironment {
  DATABASE_MIGRATION_ROLE: string
  DATABASE_RUNTIME_ROLE: string
  DATABASE_WORKER_ROLE: string
}

export interface ServerEnvironment extends DatabaseRoleEnvironment {
  DATABASE_RUNTIME_URL: string
}

export interface WorkerEnvironment extends DatabaseRoleEnvironment {
  DATABASE_WORKER_URL: string
}

export interface MigrationEnvironment {
  DATABASE_MIGRATION_URL: string
}

export interface StudentSliceEnvironment {
  OPENSCHOOL_STUDENT_SLICE_MODE: 'forced_rls' | 'disabled'
}

export interface InvitationDeliveryEnvironment {
  INVITATION_TOKEN_ENCRYPTION_KEY_ID: string
  INVITATION_TOKEN_ENCRYPTION_KEYS: Readonly<Record<string, string>>
}

export interface SupabaseAdminEnvironment {
  SUPABASE_SECRET_KEY: string
}

const ENCRYPTION_KEY_ID = /^[A-Za-z0-9_.-]{1,64}$/
const BASE64URL_256_BIT_KEY = /^[A-Za-z0-9_-]{43}$/

function databaseUsername(variable: string, value: string): string {
  const username = decodeURIComponent(new URL(value).username)
  if (!username) throw new EnvironmentValidationError(variable, 'must include a database username')
  return username
}

function parseDatabaseRoles(source: EnvironmentSource): Readonly<DatabaseRoleEnvironment> {
  const roles = {
    DATABASE_MIGRATION_ROLE: requireValue(source, 'DATABASE_MIGRATION_ROLE'),
    DATABASE_RUNTIME_ROLE: requireValue(source, 'DATABASE_RUNTIME_ROLE'),
    DATABASE_WORKER_ROLE: requireValue(source, 'DATABASE_WORKER_ROLE'),
  }
  for (const [variable, role] of Object.entries(roles)) {
    if (!DATABASE_ROLE_PATTERN.test(role)) {
      throw new EnvironmentValidationError(
        variable,
        'must be an unquoted lowercase PostgreSQL role name'
      )
    }
  }
  if (new Set(Object.values(roles)).size !== Object.values(roles).length) {
    throw new EnvironmentValidationError(
      'DATABASE_RUNTIME_ROLE',
      'migration, runtime, and worker database roles must be distinct'
    )
  }
  if (roles.DATABASE_RUNTIME_ROLE !== DATABASE_RUNTIME_ROLE_NAME) {
    throw new EnvironmentValidationError(
      'DATABASE_RUNTIME_ROLE',
      `must be ${DATABASE_RUNTIME_ROLE_NAME} for named RLS policies`
    )
  }
  if (roles.DATABASE_WORKER_ROLE !== DATABASE_WORKER_ROLE_NAME) {
    throw new EnvironmentValidationError(
      'DATABASE_WORKER_ROLE',
      `must be ${DATABASE_WORKER_ROLE_NAME} for named RLS policies`
    )
  }
  return Object.freeze(roles)
}

function requireUrlRole(
  variable: string,
  url: string,
  roleVariable: string,
  expectedRole: string
): void {
  if (databaseUsername(variable, url) !== expectedRole) {
    throw new EnvironmentValidationError(
      variable,
      `username must match the ${roleVariable} assertion`
    )
  }
}

export function parseServerEnv(source: EnvironmentSource): Readonly<ServerEnvironment> {
  const roles = parseDatabaseRoles(source)
  const environment = {
    DATABASE_RUNTIME_URL: parseUrl(source, 'DATABASE_RUNTIME_URL', ['postgres:', 'postgresql:']),
    ...roles,
  }
  requireUrlRole(
    'DATABASE_RUNTIME_URL',
    environment.DATABASE_RUNTIME_URL,
    'DATABASE_RUNTIME_ROLE',
    environment.DATABASE_RUNTIME_ROLE
  )
  return Object.freeze(environment)
}

export function parseWorkerEnv(source: EnvironmentSource): Readonly<WorkerEnvironment> {
  const roles = parseDatabaseRoles(source)
  const environment = {
    DATABASE_WORKER_URL: parseUrl(source, 'DATABASE_WORKER_URL', ['postgres:', 'postgresql:']),
    ...roles,
  }
  requireUrlRole(
    'DATABASE_WORKER_URL',
    environment.DATABASE_WORKER_URL,
    'DATABASE_WORKER_ROLE',
    environment.DATABASE_WORKER_ROLE
  )
  return Object.freeze(environment)
}

export function parseMigrationEnv(source: EnvironmentSource): Readonly<MigrationEnvironment> {
  return Object.freeze({
    DATABASE_MIGRATION_URL: parseUrl(source, 'DATABASE_MIGRATION_URL', [
      'postgres:',
      'postgresql:',
    ]),
  })
}

export function parseStudentSliceEnv(source: EnvironmentSource): Readonly<StudentSliceEnvironment> {
  const mode = requireValue(source, 'OPENSCHOOL_STUDENT_SLICE_MODE')
  if (mode !== 'forced_rls' && mode !== 'disabled') {
    throw new EnvironmentValidationError(
      'OPENSCHOOL_STUDENT_SLICE_MODE',
      'must be forced_rls or disabled'
    )
  }
  return Object.freeze({ OPENSCHOOL_STUDENT_SLICE_MODE: mode })
}

export function parseInvitationDeliveryEnv(
  source: EnvironmentSource
): Readonly<InvitationDeliveryEnvironment> {
  const activeKeyId = requireValue(source, 'INVITATION_TOKEN_ENCRYPTION_KEY_ID')
  if (!ENCRYPTION_KEY_ID.test(activeKeyId)) {
    throw new EnvironmentValidationError(
      'INVITATION_TOKEN_ENCRYPTION_KEY_ID',
      'must be a safe 1-64 character key identifier'
    )
  }

  const serializedKeys = requireValue(source, 'INVITATION_TOKEN_ENCRYPTION_KEYS')
  let parsed: unknown
  try {
    parsed = JSON.parse(serializedKeys)
  } catch {
    throw new EnvironmentValidationError(
      'INVITATION_TOKEN_ENCRYPTION_KEYS',
      'must be a JSON object of key IDs to base64url-encoded 256-bit keys'
    )
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new EnvironmentValidationError(
      'INVITATION_TOKEN_ENCRYPTION_KEYS',
      'must be a JSON object of key IDs to base64url-encoded 256-bit keys'
    )
  }

  const keys: Record<string, string> = Object.create(null)
  for (const [keyId, key] of Object.entries(parsed)) {
    if (
      !ENCRYPTION_KEY_ID.test(keyId) ||
      typeof key !== 'string' ||
      !BASE64URL_256_BIT_KEY.test(key)
    ) {
      throw new EnvironmentValidationError(
        'INVITATION_TOKEN_ENCRYPTION_KEYS',
        'contains an invalid key ID or non-256-bit base64url key'
      )
    }
    keys[keyId] = key
  }
  if (!Object.hasOwn(keys, activeKeyId)) {
    throw new EnvironmentValidationError(
      'INVITATION_TOKEN_ENCRYPTION_KEY_ID',
      'must identify a key present in INVITATION_TOKEN_ENCRYPTION_KEYS'
    )
  }
  return Object.freeze({
    INVITATION_TOKEN_ENCRYPTION_KEY_ID: activeKeyId,
    INVITATION_TOKEN_ENCRYPTION_KEYS: Object.freeze(keys),
  })
}

export function parseSupabaseAdminEnv(
  source: EnvironmentSource
): Readonly<SupabaseAdminEnvironment> {
  const secretKey = requireValue(source, 'SUPABASE_SECRET_KEY')
  // Three dot-separated segments support legacy Supabase service-role JWTs;
  // this is format validation, not token signature verification.
  if (
    /replace[_-]?with|your[_-]?project/i.test(secretKey) ||
    (!secretKey.startsWith('sb_secret_') && secretKey.split('.').length !== 3)
  ) {
    throw new EnvironmentValidationError(
      'SUPABASE_SECRET_KEY',
      'must be a server-only Supabase secret key'
    )
  }
  return Object.freeze({ SUPABASE_SECRET_KEY: secretKey })
}

export function parseOpenSignupAllowed(
  source: EnvironmentSource,
  nodeEnvironment = 'development'
): boolean {
  const configured = source.OPENSCHOOL_ALLOW_OPEN_SIGNUP?.trim()
  if (configured && configured !== 'true' && configured !== 'false') {
    throw new EnvironmentValidationError(
      'OPENSCHOOL_ALLOW_OPEN_SIGNUP',
      'must be true or false when provided'
    )
  }
  return nodeEnvironment !== 'production' && configured === 'true'
}

export function getServerEnv(): Readonly<ServerEnvironment> {
  return parseServerEnv({
    DATABASE_RUNTIME_URL: process.env.DATABASE_RUNTIME_URL,
    DATABASE_MIGRATION_ROLE: process.env.DATABASE_MIGRATION_ROLE,
    DATABASE_RUNTIME_ROLE: process.env.DATABASE_RUNTIME_ROLE,
    DATABASE_WORKER_ROLE: process.env.DATABASE_WORKER_ROLE,
  })
}

export function getWorkerEnv(): Readonly<WorkerEnvironment> {
  return parseWorkerEnv({
    DATABASE_WORKER_URL: process.env.DATABASE_WORKER_URL,
    DATABASE_MIGRATION_ROLE: process.env.DATABASE_MIGRATION_ROLE,
    DATABASE_RUNTIME_ROLE: process.env.DATABASE_RUNTIME_ROLE,
    DATABASE_WORKER_ROLE: process.env.DATABASE_WORKER_ROLE,
  })
}

export function getMigrationEnv(): Readonly<MigrationEnvironment> {
  return parseMigrationEnv({ DATABASE_MIGRATION_URL: process.env.DATABASE_MIGRATION_URL })
}

export function getStudentSliceEnv(): Readonly<StudentSliceEnvironment> {
  return parseStudentSliceEnv({
    OPENSCHOOL_STUDENT_SLICE_MODE: process.env.OPENSCHOOL_STUDENT_SLICE_MODE,
  })
}

export function getInvitationDeliveryEnv(): Readonly<InvitationDeliveryEnvironment> {
  return parseInvitationDeliveryEnv({
    INVITATION_TOKEN_ENCRYPTION_KEY_ID: process.env.INVITATION_TOKEN_ENCRYPTION_KEY_ID,
    INVITATION_TOKEN_ENCRYPTION_KEYS: process.env.INVITATION_TOKEN_ENCRYPTION_KEYS,
  })
}

export function getSupabaseAdminEnv(): Readonly<SupabaseAdminEnvironment> {
  return parseSupabaseAdminEnv({ SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY })
}

export function isOpenSignupAllowed(): boolean {
  return parseOpenSignupAllowed(process.env, process.env.NODE_ENV)
}

export { EnvironmentValidationError }
