/**
 * Role validation utilities
 *
 * Provides safe type validation for roles coming from the database
 * to prevent unsafe type assertions.
 */
import { ROLES, type Role } from '../roles'

const VALID_ROLES = new Set<string>(Object.values(ROLES))

/**
 * Type guard to check if a value is a valid Role
 */
export function isValidRole(role: unknown): role is Role {
  return typeof role === 'string' && VALID_ROLES.has(role)
}

/**
 * Validates a role and throws if invalid
 */
export function validateRole(role: unknown): Role {
  if (!isValidRole(role)) {
    throw new Error(`Invalid role: "${role}". Valid roles are: ${Object.values(ROLES).join(', ')}`)
  }
  return role
}

/**
 * Safely parses a role, returning a default if invalid.
 * Logs a warning for debugging but doesn't throw.
 */
export function safeParseRole(role: unknown, defaultRole: Role = 'student'): Role {
  if (isValidRole(role)) {
    return role
  }
  if (role !== undefined && role !== null) {
    console.warn(`Invalid role "${role}" encountered, defaulting to "${defaultRole}"`)
  }
  return defaultRole
}
