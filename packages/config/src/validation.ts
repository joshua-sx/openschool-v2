export type EnvironmentSource = Record<string, string | undefined>

export class EnvironmentValidationError extends Error {
  constructor(
    readonly variable: string,
    reason: string
  ) {
    super(`${variable}: ${reason}`)
    this.name = 'EnvironmentValidationError'
  }
}

export function requireValue(source: EnvironmentSource, variable: string): string {
  const value = source[variable]?.trim()

  if (!value) {
    throw new EnvironmentValidationError(variable, 'is required')
  }

  if (/\[[^\]]+\]\([^)]+\)/.test(value)) {
    throw new EnvironmentValidationError(variable, 'contains Markdown link syntax')
  }

  return value
}

export function parseUrl(
  source: EnvironmentSource,
  variable: string,
  protocols: readonly string[]
): string {
  const value = requireValue(source, variable)
  let url: URL

  try {
    url = new URL(value)
  } catch {
    throw new EnvironmentValidationError(variable, 'must be a valid URL')
  }

  if (!protocols.includes(url.protocol)) {
    throw new EnvironmentValidationError(
      variable,
      `must use one of these protocols: ${protocols.join(', ')}`
    )
  }

  return value
}

export function parseHttpOrigin(source: EnvironmentSource, variable: string): string {
  const value = parseUrl(source, variable, ['http:', 'https:'])
  const url = new URL(value)

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname && url.pathname !== '/')
  ) {
    throw new EnvironmentValidationError(
      variable,
      'must be an origin without credentials, path, query, or hash'
    )
  }

  return url.origin
}
