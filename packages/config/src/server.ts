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

export { EnvironmentValidationError }
