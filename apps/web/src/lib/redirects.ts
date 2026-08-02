const DEFAULT_AUTH_REDIRECT = '/dashboard'

export function normalizeInternalRedirectPath(
  requestedPath: string | null,
  fallback = DEFAULT_AUTH_REDIRECT
): string {
  if (
    !requestedPath ||
    !requestedPath.startsWith('/') ||
    requestedPath.startsWith('//') ||
    requestedPath.includes('\\')
  ) {
    return fallback
  }

  return requestedPath
}
