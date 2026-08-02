import { getServerEnv, getWorkerEnv } from '@openschool/config/server'
import { and, eq, gt, isNull, lte, or, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import {
  accountLinks,
  accountSessions,
  accounts,
  educationOrganizations,
  people,
  schools,
  tenantPlacements,
} from './schema'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type RuntimeDatabase = ReturnType<typeof createRuntimeDatabase>
export type DatabaseTransaction = Parameters<Parameters<RuntimeDatabase['transaction']>[0]>[0]
export type DatabaseOperation<T> = (transaction: DatabaseTransaction) => Promise<T>

export type DatabaseAssuranceLevel = 'aal1' | 'aal2'

export interface IdentityDatabaseContext {
  identityProvider: string
  providerSubject: string
  providerSessionId: string
  requestId: string
  assuranceLevel: DatabaseAssuranceLevel
}

export interface TenantDatabaseContext {
  accountId: string
  personId: string
  tenantId: string
  sessionId: string
  requestId: string
  assuranceLevel: DatabaseAssuranceLevel
  membershipVersion: number
  securityVersion: number
  contextPolicyVersion: number
  activeEducationOrganizationId?: string
  activeSchoolId?: string
}

export interface WorkerDatabaseContext {
  tenantId: string
  jobId: string
  jobType: string
  requestId: string
}

export type TenantPlacementDenialReason =
  | 'DATABASE_CONTEXT_INVALID'
  | 'DATABASE_ROLE_UNSAFE'
  | 'DATABASE_CONTEXT_STALE'
  | 'TENANT_PLACEMENT_UNKNOWN'
  | 'TENANT_PLACEMENT_DISABLED'
  | 'TENANT_PLACEMENT_UNSUPPORTED'

export class TenantDatabaseError extends Error {
  constructor(
    readonly reason: TenantPlacementDenialReason,
    message: string
  ) {
    super(message)
    this.name = 'TenantDatabaseError'
  }
}

function deny(reason: TenantPlacementDenialReason, message: string): never {
  throw new TenantDatabaseError(reason, message)
}

function requireUuid(name: string, value: string): void {
  if (!UUID_PATTERN.test(value)) deny('DATABASE_CONTEXT_INVALID', `${name} must be a UUID`)
}

function requireSafeValue(name: string, value: string): void {
  const containsControlCharacter = [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0
    return code <= 31 || code === 127
  })
  if (value.length < 1 || value.length > 512 || containsControlCharacter) {
    deny('DATABASE_CONTEXT_INVALID', `${name} is missing or contains unsafe characters`)
  }
}

export function validateIdentityDatabaseContext(context: IdentityDatabaseContext): void {
  requireSafeValue('identityProvider', context.identityProvider)
  requireSafeValue('providerSubject', context.providerSubject)
  requireSafeValue('providerSessionId', context.providerSessionId)
  requireSafeValue('requestId', context.requestId)
  if (!new Set<DatabaseAssuranceLevel>(['aal1', 'aal2']).has(context.assuranceLevel)) {
    deny('DATABASE_CONTEXT_INVALID', 'assuranceLevel is invalid')
  }
}

export function validateTenantDatabaseContext(context: TenantDatabaseContext): void {
  requireUuid('accountId', context.accountId)
  requireUuid('personId', context.personId)
  requireUuid('tenantId', context.tenantId)
  requireSafeValue('sessionId', context.sessionId)
  requireSafeValue('requestId', context.requestId)
  if (context.activeEducationOrganizationId) {
    requireUuid('activeEducationOrganizationId', context.activeEducationOrganizationId)
  }
  if (context.activeSchoolId) requireUuid('activeSchoolId', context.activeSchoolId)
  if (!new Set<DatabaseAssuranceLevel>(['aal1', 'aal2']).has(context.assuranceLevel)) {
    deny('DATABASE_CONTEXT_INVALID', 'assuranceLevel is invalid')
  }
  for (const [name, value] of [
    ['membershipVersion', context.membershipVersion],
    ['securityVersion', context.securityVersion],
    ['contextPolicyVersion', context.contextPolicyVersion],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 1) {
      deny('DATABASE_CONTEXT_INVALID', `${name} must be a positive safe integer`)
    }
  }
}

export function validateWorkerDatabaseContext(context: WorkerDatabaseContext): void {
  requireUuid('tenantId', context.tenantId)
  requireUuid('jobId', context.jobId)
  requireSafeValue('requestId', context.requestId)
  requireSafeValue('jobType', context.jobType)
}

function createRuntimeDatabase(connectionString: string, max: number) {
  const client = postgres(connectionString, {
    max,
    prepare: false,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
  })
  return drizzle(client, { schema })
}

interface RuntimeRoleEvidence extends Record<string, unknown> {
  currentUser: string
  bypassesRls: boolean
  canCreateDatabase: boolean
  canCreateRole: boolean
  isSuperuser: boolean
  ownsProductTables: boolean
  canCreateInPublic: boolean
  canTruncateStudents: boolean
  canAssumeMigrationRole: boolean
  canAssumeBackupRole: boolean
  canAssumeEmergencyRole: boolean
  hasUnsafeMembership: boolean
}

async function assertSafeExecutionRole(
  database: RuntimeDatabase,
  expectedUsername: string,
  migrationUsername: string
): Promise<void> {
  const result = await database.execute<RuntimeRoleEvidence>(sql`
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
      has_table_privilege(current_user, 'public.students', 'TRUNCATE') as "canTruncateStudents",
      pg_has_role(current_user, ${migrationUsername}, 'member') as "canAssumeMigrationRole",
      pg_has_role(current_user, 'openschool_backup', 'member') as "canAssumeBackupRole",
      pg_has_role(current_user, 'openschool_emergency', 'member') as "canAssumeEmergencyRole",
      exists (
        select 1
        from pg_auth_members membership
        inner join pg_roles granted_role on granted_role.oid = membership.roleid
        inner join pg_roles member_role on member_role.oid = membership.member
        where member_role.rolname = current_user
          and (
            granted_role.rolsuper
            or granted_role.rolbypassrls
            or granted_role.rolcreatedb
            or granted_role.rolcreaterole
          )
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
    evidence.canTruncateStudents ||
    evidence.canAssumeMigrationRole ||
    evidence.canAssumeBackupRole ||
    evidence.canAssumeEmergencyRole ||
    evidence.hasUnsafeMembership
  ) {
    deny('DATABASE_ROLE_UNSAFE', 'Database execution role failed the least-privilege assertion')
  }
}

let runtimeDatabase: RuntimeDatabase | undefined
let workerDatabase: RuntimeDatabase | undefined
let runtimeSecurityAssertion: Promise<void> | undefined
let workerSecurityAssertion: Promise<void> | undefined

function runtime(): RuntimeDatabase {
  if (!runtimeDatabase) {
    runtimeDatabase = createRuntimeDatabase(getServerEnv().DATABASE_RUNTIME_URL, 10)
  }
  return runtimeDatabase
}

function worker(): RuntimeDatabase {
  if (!workerDatabase) {
    workerDatabase = createRuntimeDatabase(getWorkerEnv().DATABASE_WORKER_URL, 4)
  }
  return workerDatabase
}

function databaseUsername(connectionString: string): string {
  return decodeURIComponent(new URL(connectionString).username)
}

async function assertRuntimeSecurity(): Promise<void> {
  if (!runtimeSecurityAssertion) {
    const environment = getServerEnv()
    runtimeSecurityAssertion = assertSafeExecutionRole(
      runtime(),
      databaseUsername(environment.DATABASE_RUNTIME_URL),
      environment.DATABASE_MIGRATION_ROLE
    ).catch((error) => {
      runtimeSecurityAssertion = undefined
      throw error
    })
  }
  return runtimeSecurityAssertion
}

async function assertWorkerSecurity(): Promise<void> {
  if (!workerSecurityAssertion) {
    const environment = getWorkerEnv()
    workerSecurityAssertion = assertSafeExecutionRole(
      worker(),
      databaseUsername(environment.DATABASE_WORKER_URL),
      environment.DATABASE_MIGRATION_ROLE
    ).catch((error) => {
      workerSecurityAssertion = undefined
      throw error
    })
  }
  return workerSecurityAssertion
}

async function setContext(
  transaction: DatabaseTransaction,
  settings: Readonly<Record<string, string | undefined>>
): Promise<void> {
  for (const [key, value] of Object.entries(settings)) {
    // Reviewed raw-SQL allowlist: values are parameters and `true` makes every
    // setting transaction-local so pool reuse cannot inherit request context.
    await transaction.execute(sql`select set_config(${key}, ${value ?? ''}, true)`)
  }
}

async function withIdentityUsing<T>(
  database: RuntimeDatabase,
  securityAssertion: Promise<void>,
  context: IdentityDatabaseContext,
  operation: DatabaseOperation<T>
): Promise<T> {
  validateIdentityDatabaseContext(context)
  await securityAssertion
  return database.transaction(async (transaction) => {
    await setContext(transaction, {
      'app.identity_provider': context.identityProvider,
      'app.provider_subject': context.providerSubject,
      'app.provider_session_id': context.providerSessionId,
      'app.request_id': context.requestId,
      'app.assurance_level': context.assuranceLevel,
    })
    return operation(transaction)
  })
}

async function assertActivePooledPlacement(
  transaction: DatabaseTransaction,
  tenantId: string
): Promise<void> {
  const [placement] = await transaction
    .select({
      adapter: tenantPlacements.adapter,
      placementKey: tenantPlacements.placementKey,
      status: tenantPlacements.status,
    })
    .from(tenantPlacements)
    .where(
      and(eq(tenantPlacements.tenantId, tenantId), eq(tenantPlacements.placementKey, 'primary'))
    )
    .limit(1)
  if (!placement) deny('TENANT_PLACEMENT_UNKNOWN', 'Tenant placement is not configured')
  if (placement.status !== 'active') {
    deny('TENANT_PLACEMENT_DISABLED', 'Tenant placement is not active')
  }
  if (placement.adapter !== 'pooled') {
    deny('TENANT_PLACEMENT_UNSUPPORTED', 'Tenant placement adapter is not enabled')
  }
}

async function assertCurrentTenantContext(
  transaction: DatabaseTransaction,
  context: TenantDatabaseContext
): Promise<void> {
  const now = new Date()
  const [anchor] = await transaction
    .select({ accountId: accounts.id })
    .from(accounts)
    .innerJoin(
      people,
      and(
        eq(people.tenantId, context.tenantId),
        eq(people.id, context.personId),
        eq(people.status, 'active')
      )
    )
    .innerJoin(
      accountLinks,
      and(
        eq(accountLinks.tenantId, people.tenantId),
        eq(accountLinks.personId, people.id),
        eq(accountLinks.accountId, accounts.id),
        eq(accountLinks.status, 'active'),
        lte(accountLinks.validFrom, now),
        or(isNull(accountLinks.validUntil), gt(accountLinks.validUntil, now))
      )
    )
    .innerJoin(
      accountSessions,
      and(
        eq(accountSessions.accountId, accounts.id),
        eq(accountSessions.providerSessionId, context.sessionId),
        eq(accountSessions.status, 'active'),
        eq(accountSessions.securityVersion, context.securityVersion),
        eq(accountSessions.assuranceLevel, context.assuranceLevel),
        gt(accountSessions.expiresAt, now)
      )
    )
    .where(
      and(
        eq(accounts.id, context.accountId),
        eq(accounts.status, 'active'),
        eq(accounts.membershipVersion, context.membershipVersion),
        eq(accounts.securityVersion, context.securityVersion)
      )
    )
    .limit(1)
  if (!anchor) {
    deny('DATABASE_CONTEXT_STALE', 'Canonical Account, Person, or session context is stale')
  }

  if (context.activeEducationOrganizationId) {
    const [organization] = await transaction
      .select({ id: educationOrganizations.id })
      .from(educationOrganizations)
      .where(
        and(
          eq(educationOrganizations.tenantId, context.tenantId),
          eq(educationOrganizations.id, context.activeEducationOrganizationId),
          eq(educationOrganizations.status, 'active')
        )
      )
      .limit(1)
    if (!organization) {
      deny('DATABASE_CONTEXT_STALE', 'Education Organization context is stale')
    }
  }

  if (context.activeSchoolId) {
    const [school] = await transaction
      .select({ id: schools.id })
      .from(schools)
      .where(
        and(
          eq(schools.tenantId, context.tenantId),
          eq(schools.id, context.activeSchoolId),
          eq(schools.status, 'active')
        )
      )
      .limit(1)
    if (!school) deny('DATABASE_CONTEXT_STALE', 'School context is stale')
  }
}

async function withTenantUsing<T>(
  database: RuntimeDatabase,
  securityAssertion: Promise<void>,
  context: TenantDatabaseContext,
  operation: DatabaseOperation<T>
): Promise<T> {
  validateTenantDatabaseContext(context)
  await securityAssertion
  return database.transaction(async (transaction) => {
    await assertActivePooledPlacement(transaction, context.tenantId)
    await assertCurrentTenantContext(transaction, context)
    await setContext(transaction, {
      'app.account_id': context.accountId,
      'app.person_id': context.personId,
      'app.tenant_id': context.tenantId,
      'app.session_id': context.sessionId,
      'app.request_id': context.requestId,
      'app.assurance_level': context.assuranceLevel,
      'app.membership_version': String(context.membershipVersion),
      'app.security_version': String(context.securityVersion),
      'app.context_policy_version': String(context.contextPolicyVersion),
      'app.education_organization_id': context.activeEducationOrganizationId,
      'app.school_id': context.activeSchoolId,
    })
    return operation(transaction)
  })
}

async function withWorkerUsing<T>(
  database: RuntimeDatabase,
  securityAssertion: Promise<void>,
  context: WorkerDatabaseContext,
  operation: DatabaseOperation<T>
): Promise<T> {
  validateWorkerDatabaseContext(context)
  await securityAssertion
  return database.transaction(async (transaction) => {
    await assertActivePooledPlacement(transaction, context.tenantId)
    await setContext(transaction, {
      'app.tenant_id': context.tenantId,
      'app.job_id': context.jobId,
      'app.job_type': context.jobType,
      'app.request_id': context.requestId,
    })
    return operation(transaction)
  })
}

/** Runs pre-Tenant identity bootstrap through the non-owner runtime role. */
export async function withIdentityTransaction<T>(
  context: IdentityDatabaseContext,
  operation: DatabaseOperation<T>
): Promise<T> {
  validateIdentityDatabaseContext(context)
  return withIdentityUsing(runtime(), assertRuntimeSecurity(), context, operation)
}

/**
 * Resolves the configured pooled placement, applies canonical verified context,
 * and exposes a database handle only for the lifetime of this transaction.
 */
export async function withTenantTransaction<T>(
  context: TenantDatabaseContext,
  operation: DatabaseOperation<T>
): Promise<T> {
  validateTenantDatabaseContext(context)
  return withTenantUsing(runtime(), assertRuntimeSecurity(), context, operation)
}

/** Runs a bounded background job through the separately credentialed worker role. */
export async function withWorkerTenantTransaction<T>(
  context: WorkerDatabaseContext,
  operation: DatabaseOperation<T>
): Promise<T> {
  validateWorkerDatabaseContext(context)
  return withWorkerUsing(worker(), assertWorkerSecurity(), context, operation)
}

export interface DatabaseSessionContextEvidence extends Record<string, unknown> {
  backendPid: number
  accountId: string | null
  personId: string | null
  tenantId: string | null
  sessionId: string | null
  requestId: string | null
  organizationId: string | null
  schoolId: string | null
  jobId: string | null
  jobType: string | null
  membershipVersion: string | null
  securityVersion: string | null
  contextPolicyVersion: string | null
}

/** Guarded, loopback-only harness for real pool reuse and cleanup evidence. */
export function createDatabaseExecutionProofHarness(
  kind: 'runtime' | 'worker',
  maxConnections = 1
) {
  if (process.env.ALLOW_DATABASE_EXECUTION_POC !== 'true') {
    throw new Error(
      'Database execution proof refused: ALLOW_DATABASE_EXECUTION_POC must be exactly "true".'
    )
  }
  const environment = getServerEnv()
  const connectionString =
    kind === 'runtime' ? environment.DATABASE_RUNTIME_URL : getWorkerEnv().DATABASE_WORKER_URL
  const url = new URL(connectionString)
  if (!new Set(['127.0.0.1', 'localhost', '[::1]']).has(url.hostname)) {
    throw new Error('Database execution proof refused: database host must be loopback.')
  }
  if (!Number.isInteger(maxConnections) || maxConnections < 1 || maxConnections > 4) {
    throw new Error('Database execution proof refused: pool size must be between one and four.')
  }

  const database = createRuntimeDatabase(connectionString, maxConnections)
  const securityAssertion = assertSafeExecutionRole(
    database,
    databaseUsername(connectionString),
    environment.DATABASE_MIGRATION_ROLE
  )

  return Object.freeze({
    withIdentityTransaction: <T>(
      context: IdentityDatabaseContext,
      operation: DatabaseOperation<T>
    ) => withIdentityUsing(database, securityAssertion, context, operation),
    withTenantTransaction: <T>(context: TenantDatabaseContext, operation: DatabaseOperation<T>) =>
      withTenantUsing(database, securityAssertion, context, operation),
    withWorkerTenantTransaction: <T>(
      context: WorkerDatabaseContext,
      operation: DatabaseOperation<T>
    ) => withWorkerUsing(database, securityAssertion, context, operation),
    readSessionContext: async (): Promise<DatabaseSessionContextEvidence> => {
      const result = await database.execute<DatabaseSessionContextEvidence>(sql`
        select
          pg_backend_pid() as "backendPid",
          nullif(current_setting('app.account_id', true), '') as "accountId",
          nullif(current_setting('app.person_id', true), '') as "personId",
          nullif(current_setting('app.tenant_id', true), '') as "tenantId",
          nullif(current_setting('app.session_id', true), '') as "sessionId",
          nullif(current_setting('app.request_id', true), '') as "requestId",
          nullif(current_setting('app.education_organization_id', true), '') as "organizationId",
          nullif(current_setting('app.school_id', true), '') as "schoolId",
          nullif(current_setting('app.job_id', true), '') as "jobId",
          nullif(current_setting('app.job_type', true), '') as "jobType",
          nullif(current_setting('app.membership_version', true), '') as "membershipVersion",
          nullif(current_setting('app.security_version', true), '') as "securityVersion",
          nullif(current_setting('app.context_policy_version', true), '') as "contextPolicyVersion"
      `)
      const evidence = result[0]
      if (!evidence) throw new Error('Database execution proof returned no context evidence.')
      return evidence
    },
    close: () => database.$client.end({ timeout: 5 }),
  })
}

/** Guarded proof cleanup only; application code must never close shared pools. */
export async function closeDatabaseExecutionPoolsForProof(): Promise<void> {
  await runtimeDatabase?.$client.end({ timeout: 5 })
  await workerDatabase?.$client.end({ timeout: 5 })
  runtimeDatabase = undefined
  workerDatabase = undefined
  runtimeSecurityAssertion = undefined
  workerSecurityAssertion = undefined
}
