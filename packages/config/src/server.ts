import {
  type EnvironmentSource,
  EnvironmentValidationError,
  parseUrl,
  requireValue,
} from './validation'

const DATABASE_ROLE_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/

export interface ServerEnvironment {
  DATABASE_RUNTIME_URL: string
  /** Non-secret expected owner identity used by runtime role assertions. */
  DATABASE_MIGRATION_ROLE: string
}

export interface WorkerEnvironment {
  DATABASE_WORKER_URL: string
  DATABASE_MIGRATION_ROLE: string
}

export interface MigrationEnvironment {
  DATABASE_MIGRATION_URL: string
}

function databaseUsername(variable: string, value: string): string {
  const username = decodeURIComponent(new URL(value).username)
  if (!username) throw new EnvironmentValidationError(variable, 'must include a database username')
  return username
}

export function parseServerEnv(source: EnvironmentSource): Readonly<ServerEnvironment> {
  const environment = {
    DATABASE_RUNTIME_URL: parseUrl(source, 'DATABASE_RUNTIME_URL', ['postgres:', 'postgresql:']),
    DATABASE_MIGRATION_ROLE: requireValue(source, 'DATABASE_MIGRATION_ROLE'),
  }
  if (!DATABASE_ROLE_PATTERN.test(environment.DATABASE_MIGRATION_ROLE)) {
    throw new EnvironmentValidationError(
      'DATABASE_MIGRATION_ROLE',
      'must be an unquoted lowercase PostgreSQL role name'
    )
  }
  const identities = [
    [
      'DATABASE_RUNTIME_URL',
      databaseUsername('DATABASE_RUNTIME_URL', environment.DATABASE_RUNTIME_URL),
    ],
    ['DATABASE_MIGRATION_ROLE', environment.DATABASE_MIGRATION_ROLE],
  ] as const
  for (let left = 0; left < identities.length; left += 1) {
    for (let right = left + 1; right < identities.length; right += 1) {
      const leftIdentity = identities[left]
      const rightIdentity = identities[right]
      if (leftIdentity?.[1] === rightIdentity?.[1]) {
        throw new EnvironmentValidationError(
          leftIdentity?.[0] ?? 'DATABASE_ROLE',
          `must use a different database role than ${rightIdentity?.[0]}`
        )
      }
    }
  }
  return Object.freeze(environment)
}

export function parseWorkerEnv(source: EnvironmentSource): Readonly<WorkerEnvironment> {
  const environment = {
    DATABASE_WORKER_URL: parseUrl(source, 'DATABASE_WORKER_URL', ['postgres:', 'postgresql:']),
    DATABASE_MIGRATION_ROLE: requireValue(source, 'DATABASE_MIGRATION_ROLE'),
  }
  if (!DATABASE_ROLE_PATTERN.test(environment.DATABASE_MIGRATION_ROLE)) {
    throw new EnvironmentValidationError(
      'DATABASE_MIGRATION_ROLE',
      'must be an unquoted lowercase PostgreSQL role name'
    )
  }
  if (
    databaseUsername('DATABASE_WORKER_URL', environment.DATABASE_WORKER_URL) ===
    environment.DATABASE_MIGRATION_ROLE
  ) {
    throw new EnvironmentValidationError(
      'DATABASE_WORKER_URL',
      'must use a different database role than DATABASE_MIGRATION_ROLE'
    )
  }
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

export function getServerEnv(): Readonly<ServerEnvironment> {
  return parseServerEnv({
    DATABASE_RUNTIME_URL: process.env.DATABASE_RUNTIME_URL,
    DATABASE_MIGRATION_ROLE: process.env.DATABASE_MIGRATION_ROLE,
  })
}

export function getWorkerEnv(): Readonly<WorkerEnvironment> {
  return parseWorkerEnv({
    DATABASE_WORKER_URL: process.env.DATABASE_WORKER_URL,
    DATABASE_MIGRATION_ROLE: process.env.DATABASE_MIGRATION_ROLE,
  })
}

export function getMigrationEnv(): Readonly<MigrationEnvironment> {
  return parseMigrationEnv({ DATABASE_MIGRATION_URL: process.env.DATABASE_MIGRATION_URL })
}

export { EnvironmentValidationError }
