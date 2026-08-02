import { CAPABILITY_REGISTRY, isCapability, isScopeKind } from './registry'
import type {
  CompiledRoleTemplate,
  PolicyBundle,
  PolicyGrant,
  PolicyObligation,
  RoleTemplateDefinition,
} from './types'

const KEY_PATTERN = /^[a-z][a-z0-9_.-]{1,127}$/
const VERSION_PATTERN = /^[a-z0-9][a-z0-9_.-]{1,127}$/i

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value as Readonly<T>
  }
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

function validateObligation(obligation: PolicyObligation, roleKey: string, grantId: string): void {
  switch (obligation.kind) {
    case 'mfa':
      if (obligation.assuranceLevel !== 'aal2') {
        throw new Error(`${roleKey}/${grantId} has an invalid MFA obligation`)
      }
      return
    case 'reauthentication':
      if (!Number.isInteger(obligation.maxAgeSeconds) || obligation.maxAgeSeconds <= 0) {
        throw new Error(`${roleKey}/${grantId} has an invalid reauthentication window`)
      }
      return
    case 'purpose':
      if (
        obligation.allowed.length === 0 ||
        obligation.allowed.some((purpose) => !purpose.trim())
      ) {
        throw new Error(`${roleKey}/${grantId} has an invalid purpose obligation`)
      }
      return
    case 'audit':
      if (!obligation.event.trim()) {
        throw new Error(`${roleKey}/${grantId} has an invalid audit obligation`)
      }
  }
}

function validateGrant(grant: PolicyGrant, roleKey: string): void {
  if (!KEY_PATTERN.test(grant.id)) throw new Error(`${roleKey} has an invalid grant id`)
  if (!isCapability(grant.capability)) {
    throw new Error(`${roleKey}/${grant.id} references an unknown capability`)
  }
  if (!isScopeKind(grant.scope)) {
    throw new Error(`${roleKey}/${grant.id} references an unknown scope`)
  }
  if (!CAPABILITY_REGISTRY[grant.capability].scopes.some((scope) => scope === grant.scope)) {
    throw new Error(`${roleKey}/${grant.id} uses a scope unsupported by its capability`)
  }
  for (const obligation of grant.obligations ?? []) {
    validateObligation(obligation, roleKey, grant.id)
  }
}

/**
 * Compiles immutable role templates and resolves custom composition without
 * hierarchy, inheritance ranks, or implicit grants.
 */
export function createPolicyBundle(input: {
  version: string
  roleTemplates: readonly RoleTemplateDefinition[]
}): PolicyBundle {
  if (!VERSION_PATTERN.test(input.version)) throw new Error('Policy version is invalid')

  const definitions = new Map<string, RoleTemplateDefinition>()
  for (const definition of input.roleTemplates) {
    if (!KEY_PATTERN.test(definition.key)) throw new Error('Role Template key is invalid')
    if (!definition.description.trim()) {
      throw new Error(`${definition.key} requires a description`)
    }
    if (definitions.has(definition.key)) {
      throw new Error(`Duplicate Role Template key: ${definition.key}`)
    }
    for (const grant of definition.grants ?? []) validateGrant(grant, definition.key)
    definitions.set(definition.key, definition)
  }

  const compiled = new Map<string, CompiledRoleTemplate>()
  const compiling = new Set<string>()

  const compile = (key: string): CompiledRoleTemplate => {
    const existing = compiled.get(key)
    if (existing) return existing
    const definition = definitions.get(key)
    if (!definition) throw new Error(`Unknown composed Role Template: ${key}`)
    if (compiling.has(key)) throw new Error(`Role Template composition cycle: ${key}`)
    compiling.add(key)

    const grants: PolicyGrant[] = []
    for (const composedKey of definition.composes ?? []) {
      grants.push(...compile(composedKey).grants)
    }
    grants.push(...(definition.grants ?? []))

    const uniqueGrants = new Map<string, PolicyGrant>()
    for (const grant of grants) {
      const signature = JSON.stringify([grant.capability, grant.scope, grant.obligations ?? []])
      if (!uniqueGrants.has(signature)) uniqueGrants.set(signature, grant)
    }

    const roleTemplate = deepFreeze({
      key: definition.key,
      description: definition.description,
      grants: [...uniqueGrants.values()].map((grant) => ({
        ...grant,
        ...(grant.obligations
          ? { obligations: grant.obligations.map((obligation) => ({ ...obligation })) }
          : {}),
      })),
    }) as CompiledRoleTemplate
    compiling.delete(key)
    compiled.set(key, roleTemplate)
    return roleTemplate
  }

  for (const key of definitions.keys()) compile(key)

  return deepFreeze({
    version: input.version,
    roleTemplates: Object.fromEntries(
      [...compiled.entries()].sort(([a], [b]) => a.localeCompare(b))
    ),
  }) as PolicyBundle
}
