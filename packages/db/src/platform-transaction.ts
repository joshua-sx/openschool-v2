import { getControlPlaneEnv } from '@openschool/config/server'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import type { DatabaseAssuranceLevel, DatabaseTransaction } from './tenant-transaction'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface PlatformIdentityDatabaseContext {
  identityProvider: string
  providerSubject: string
  providerSessionId: string
  requestId: string
  assuranceLevel: DatabaseAssuranceLevel
  reauthenticatedAt?: string
}

export interface PlatformDatabaseContext {
  accountId: string
  accountSessionId: string
  providerSessionId: string
  requestId: string
  securityVersion: number
  platformAccessGrantId: string
  roleTemplateKey: 'super_admin' | 'support_agent'
  assuranceLevel: DatabaseAssuranceLevel
  reauthenticatedAt?: string
  expiresAt: string
}

export interface PlatformDatabasePolicyContext {
  capability: string
  policyVersion: string
  queryConstraints: readonly [Readonly<{ kind: 'platform' }>]
  correlationId: string
}

export type PlatformDatabaseDenialReason =
  | 'PLATFORM_DATABASE_CONTEXT_INVALID'
  | 'PLATFORM_DATABASE_ROLE_UNSAFE'
  | 'PLATFORM_ACCESS_DENIED'

export class PlatformDatabaseError extends Error {
  constructor(
    readonly reason: PlatformDatabaseDenialReason,
    message: string,
    readonly cause?: unknown
  ) {
    super(message)
    this.name = 'PlatformDatabaseError'
  }
}

function deny(reason: PlatformDatabaseDenialReason, message: string, cause?: unknown): never {
  throw new PlatformDatabaseError(reason, message, cause)
}

function requireSafeValue(name: string, value: string): void {
  const containsControlCharacter = [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0
    return code <= 31 || code === 127
  })
  if (value.length < 1 || value.length > 512 || containsControlCharacter) {
    deny('PLATFORM_DATABASE_CONTEXT_INVALID', `${name} is missing or unsafe`)
  }
}

function requireCanonicalInstant(name: string, value: string): void {
  const instant = new Date(value)
  if (Number.isNaN(instant.getTime()) || instant.toISOString() !== value) {
    deny('PLATFORM_DATABASE_CONTEXT_INVALID', `${name} must be a canonical ISO timestamp`)
  }
}

export function validatePlatformIdentityDatabaseContext(
  context: PlatformIdentityDatabaseContext
): void {
  requireSafeValue('identityProvider', context.identityProvider)
  requireSafeValue('providerSubject', context.providerSubject)
  requireSafeValue('providerSessionId', context.providerSessionId)
  requireSafeValue('requestId', context.requestId)
  if (context.assuranceLevel !== 'aal1' && context.assuranceLevel !== 'aal2') {
    deny('PLATFORM_DATABASE_CONTEXT_INVALID', 'assuranceLevel is invalid')
  }
  if (context.reauthenticatedAt) {
    requireCanonicalInstant('reauthenticatedAt', context.reauthenticatedAt)
  }
}

export function validatePlatformDatabasePolicyContext(policy: PlatformDatabasePolicyContext): void {
  requireSafeValue('capability', policy.capability)
  requireSafeValue('policyVersion', policy.policyVersion)
  requireSafeValue('correlationId', policy.correlationId)
  if (!/^[a-z][a-z0-9_.:-]{0,127}$/.test(policy.capability)) {
    deny('PLATFORM_DATABASE_CONTEXT_INVALID', 'capability contains unsupported characters')
  }
  if (policy.queryConstraints.length !== 1 || policy.queryConstraints[0]?.kind !== 'platform') {
    deny('PLATFORM_DATABASE_CONTEXT_INVALID', 'platform policy scope is invalid')
  }
}

function createControlPlaneDatabase(connectionString: string) {
  const client = postgres(connectionString, {
    max: 3,
    prepare: false,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
    connection: {
      statement_timeout: 15_000,
      idle_in_transaction_session_timeout: 15_000,
    },
  })
  return drizzle(client, { schema })
}

type ControlPlaneDatabase = ReturnType<typeof createControlPlaneDatabase>

interface ControlPlaneRoleEvidence extends Record<string, unknown> {
  currentUser: string
  bypassesRls: boolean
  canCreateDatabase: boolean
  canCreateRole: boolean
  isSuperuser: boolean
  ownsProductTables: boolean
  canCreateInPublic: boolean
  hasDirectProductTableAccess: boolean
  canUsePrivateSchema: boolean
  canCreateInPrivateSchema: boolean
  canResolvePlatformAccess: boolean
  canApplyTenantLifecycle: boolean
  hasUnsafeMembership: boolean
}

async function assertSafeControlPlaneRole(database: ControlPlaneDatabase): Promise<void> {
  const environment = getControlPlaneEnv()
  const expectedUsername = decodeURIComponent(
    new URL(environment.DATABASE_CONTROL_PLANE_URL).username
  )
  const result = await database.execute<ControlPlaneRoleEvidence>(sql`
    select
      current_user as "currentUser",
      role.rolbypassrls as "bypassesRls",
      role.rolcreatedb as "canCreateDatabase",
      role.rolcreaterole as "canCreateRole",
      role.rolsuper as "isSuperuser",
      exists (
        select 1
        from pg_class relation
        inner join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relkind in ('r', 'p')
          and pg_get_userbyid(relation.relowner) = current_user
      ) as "ownsProductTables",
      has_schema_privilege(current_user, 'public', 'CREATE') as "canCreateInPublic",
      exists (
        select 1
        from pg_class relation
        inner join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relkind in ('r', 'p')
          and has_table_privilege(
            current_user,
            relation.oid,
            'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
          )
      ) as "hasDirectProductTableAccess",
      has_schema_privilege(current_user, 'openschool_private', 'USAGE')
        as "canUsePrivateSchema",
      has_schema_privilege(current_user, 'openschool_private', 'CREATE')
        as "canCreateInPrivateSchema",
      has_function_privilege(
        current_user,
        'openschool_private.resolve_platform_access()'::regprocedure,
        'EXECUTE'
      ) as "canResolvePlatformAccess",
      has_function_privilege(
        current_user,
        'openschool_private.apply_tenant_lifecycle(text,uuid,text)'::regprocedure,
        'EXECUTE'
      ) as "canApplyTenantLifecycle",
      exists (
        select 1 from pg_roles granted_role
        where granted_role.rolname <> current_user
          and pg_has_role(current_user, granted_role.oid, 'member')
      ) as "hasUnsafeMembership"
    from pg_roles role
    where role.rolname = current_user
  `)
  const evidence = result[0]
  if (
    !evidence ||
    evidence.currentUser !== expectedUsername ||
    evidence.bypassesRls ||
    evidence.canCreateDatabase ||
    evidence.canCreateRole ||
    evidence.isSuperuser ||
    evidence.ownsProductTables ||
    evidence.canCreateInPublic ||
    evidence.hasDirectProductTableAccess ||
    !evidence.canUsePrivateSchema ||
    evidence.canCreateInPrivateSchema ||
    !evidence.canResolvePlatformAccess ||
    !evidence.canApplyTenantLifecycle ||
    evidence.hasUnsafeMembership
  ) {
    deny(
      'PLATFORM_DATABASE_ROLE_UNSAFE',
      'Platform control-plane role failed the least-privilege assertion'
    )
  }
}

let controlPlaneDatabase: ControlPlaneDatabase | undefined
let controlPlaneSecurityAssertion: Promise<void> | undefined

function controlPlane(): ControlPlaneDatabase {
  if (!controlPlaneDatabase) {
    controlPlaneDatabase = createControlPlaneDatabase(
      getControlPlaneEnv().DATABASE_CONTROL_PLANE_URL
    )
  }
  return controlPlaneDatabase
}

async function assertControlPlaneSecurity(): Promise<void> {
  if (!controlPlaneSecurityAssertion) {
    controlPlaneSecurityAssertion = assertSafeControlPlaneRole(controlPlane()).catch((error) => {
      controlPlaneSecurityAssertion = undefined
      throw error
    })
  }
  return controlPlaneSecurityAssertion
}

async function setContext(
  transaction: DatabaseTransaction,
  settings: Readonly<Record<string, string | undefined>>
): Promise<void> {
  const setters = Object.entries(settings).map(
    ([key, value]) => sql`set_config(${key}, ${value ?? ''}, true)`
  )
  await transaction.execute(sql`select ${sql.join(setters, sql`, `)}`)
}

interface PlatformAccessRow extends Record<string, unknown> {
  accountId: string
  accountSessionId: string
  securityVersion: string
  platformAccessGrantId: string
  roleTemplateKey: string
  assuranceLevel: string
  reauthenticatedAt: Date | null
  expiresAt: Date
}

async function resolvePlatformAccessInTransaction(
  transaction: DatabaseTransaction,
  identity: PlatformIdentityDatabaseContext
): Promise<PlatformDatabaseContext> {
  await setContext(transaction, {
    'app.identity_provider': identity.identityProvider,
    'app.provider_subject': identity.providerSubject,
    'app.provider_session_id': identity.providerSessionId,
    'app.request_id': identity.requestId,
    'app.assurance_level': identity.assuranceLevel,
    'app.reauthenticated_at': identity.reauthenticatedAt,
  })
  let rows: PlatformAccessRow[]
  try {
    rows = await transaction.execute<PlatformAccessRow>(
      sql`
        select
          account_id as "accountId",
          account_session_id as "accountSessionId",
          security_version as "securityVersion",
          platform_access_grant_id as "platformAccessGrantId",
          role_template_key as "roleTemplateKey",
          assurance_level as "assuranceLevel",
          reauthenticated_at as "reauthenticatedAt",
          expires_at as "expiresAt"
        from openschool_private.resolve_platform_access()
      `
    )
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    if (message.includes('PLATFORM_ACCESS_DENIED')) {
      deny('PLATFORM_ACCESS_DENIED', 'Verified identity has no active platform access', cause)
    }
    throw cause
  }
  const row = rows[0]
  if (
    rows.length !== 1 ||
    !row ||
    !UUID_PATTERN.test(row.accountId) ||
    !UUID_PATTERN.test(row.accountSessionId) ||
    !UUID_PATTERN.test(row.platformAccessGrantId) ||
    !Number.isSafeInteger(Number(row.securityVersion)) ||
    !['super_admin', 'support_agent'].includes(row.roleTemplateKey) ||
    !['aal1', 'aal2'].includes(row.assuranceLevel) ||
    !(row.expiresAt instanceof Date)
  ) {
    deny('PLATFORM_ACCESS_DENIED', 'Platform access resolver returned invalid evidence')
  }
  return Object.freeze({
    accountId: row.accountId,
    accountSessionId: row.accountSessionId,
    providerSessionId: identity.providerSessionId,
    requestId: identity.requestId,
    securityVersion: Number(row.securityVersion),
    platformAccessGrantId: row.platformAccessGrantId,
    roleTemplateKey: row.roleTemplateKey as PlatformDatabaseContext['roleTemplateKey'],
    assuranceLevel: row.assuranceLevel as DatabaseAssuranceLevel,
    ...(row.reauthenticatedAt ? { reauthenticatedAt: row.reauthenticatedAt.toISOString() } : {}),
    expiresAt: row.expiresAt.toISOString(),
  })
}

export async function resolvePlatformDatabaseContext(
  identity: PlatformIdentityDatabaseContext
): Promise<PlatformDatabaseContext> {
  validatePlatformIdentityDatabaseContext(identity)
  await assertControlPlaneSecurity()
  return controlPlane().transaction((transaction) =>
    resolvePlatformAccessInTransaction(transaction, identity)
  )
}

export async function withPlatformPolicyTransaction<T>(
  identity: PlatformIdentityDatabaseContext,
  policy: PlatformDatabasePolicyContext,
  operation: (transaction: DatabaseTransaction, context: PlatformDatabaseContext) => Promise<T>
): Promise<T> {
  validatePlatformIdentityDatabaseContext(identity)
  validatePlatformDatabasePolicyContext(policy)
  await assertControlPlaneSecurity()
  return controlPlane().transaction(async (transaction) => {
    const context = await resolvePlatformAccessInTransaction(transaction, identity)
    await setContext(transaction, {
      'app.account_id': context.accountId,
      'app.session_id': context.providerSessionId,
      'app.security_version': String(context.securityVersion),
      'app.platform_access_grant_id': context.platformAccessGrantId,
      'app.platform_role_template_key': context.roleTemplateKey,
      'app.policy_capability': policy.capability,
      'app.policy_version': policy.policyVersion,
      'app.policy_constraints': JSON.stringify(policy.queryConstraints),
      'app.correlation_id': policy.correlationId,
    })
    return operation(transaction, context)
  })
}

/** Guarded proof cleanup only; application code must never close the shared pool. */
export async function closePlatformDatabasePoolForProof(): Promise<void> {
  try {
    await controlPlaneDatabase?.$client.end({ timeout: 5 })
  } finally {
    controlPlaneDatabase = undefined
    controlPlaneSecurityAssertion = undefined
  }
}
