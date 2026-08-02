import { type EnvironmentSource, parseUrl } from './validation'

export interface ServerEnvironment {
  DATABASE_URL: string
}

export function parseServerEnv(source: EnvironmentSource): Readonly<ServerEnvironment> {
  return Object.freeze({
    DATABASE_URL: parseUrl(source, 'DATABASE_URL', ['postgres:', 'postgresql:']),
  })
}

export function getServerEnv(): Readonly<ServerEnvironment> {
  return parseServerEnv({ DATABASE_URL: process.env.DATABASE_URL })
}

export { EnvironmentValidationError } from './validation'
