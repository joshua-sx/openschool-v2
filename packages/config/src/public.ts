import {
  type EnvironmentSource,
  EnvironmentValidationError,
  parseHttpOrigin,
  requireValue,
} from './validation'

export interface PublicEnvironment {
  NEXT_PUBLIC_SUPABASE_URL: string
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string
  NEXT_PUBLIC_APP_URL: string
  NEXT_PUBLIC_WWW_URL: string
}

function getLegacyJwtRole(value: string): string | undefined {
  const payload = value.split('.')[1]
  if (!payload) return undefined

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const decoded = JSON.parse(atob(padded)) as { role?: unknown }
    return typeof decoded.role === 'string' ? decoded.role : undefined
  } catch {
    return undefined
  }
}

function parsePublishableKey(source: EnvironmentSource): string {
  const variable = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
  const value = requireValue(source, variable)

  if (/replace[_-]?with|your[_-]?project/i.test(value)) {
    throw new EnvironmentValidationError(variable, 'still contains the template placeholder')
  }

  if (value.startsWith('sb_secret_') || getLegacyJwtRole(value) === 'service_role') {
    throw new EnvironmentValidationError(variable, 'must not contain a secret or service-role key')
  }

  const isPublishable = value.startsWith('sb_publishable_') && value.length >= 24
  const isLegacyAnon = getLegacyJwtRole(value) === 'anon'

  if (!isPublishable && !isLegacyAnon) {
    throw new EnvironmentValidationError(
      variable,
      'must be a Supabase publishable key or legacy anon key'
    )
  }

  return value
}

export function parsePublicEnv(source: EnvironmentSource): Readonly<PublicEnvironment> {
  const supabaseUrl = parseHttpOrigin(source, 'NEXT_PUBLIC_SUPABASE_URL')
  if (/replace[_-]?with|project[_-]?ref/i.test(supabaseUrl)) {
    throw new EnvironmentValidationError(
      'NEXT_PUBLIC_SUPABASE_URL',
      'still contains the template placeholder'
    )
  }

  const env = {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: parsePublishableKey(source),
    NEXT_PUBLIC_APP_URL: parseHttpOrigin(source, 'NEXT_PUBLIC_APP_URL'),
    NEXT_PUBLIC_WWW_URL: parseHttpOrigin(source, 'NEXT_PUBLIC_WWW_URL'),
  }

  if (env.NEXT_PUBLIC_APP_URL === env.NEXT_PUBLIC_WWW_URL) {
    throw new EnvironmentValidationError(
      'NEXT_PUBLIC_APP_URL',
      'must use a different origin from NEXT_PUBLIC_WWW_URL'
    )
  }

  return Object.freeze(env)
}

export function getPublicEnv(): Readonly<PublicEnvironment> {
  return parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_WWW_URL: process.env.NEXT_PUBLIC_WWW_URL,
  })
}

export { EnvironmentValidationError } from './validation'
