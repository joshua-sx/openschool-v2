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
  tenants,
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
  /** Verified provider claim; required by invitation acceptance and never client supplied. */
  identityEmail?: string
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
  /** Canonical provider-verified interactive authentication evidence. */
  reauthenticatedAt?: string
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

export type DatabasePolicyQueryConstraint =
  | Readonly<{ kind: 'tenant'; tenantId: string }>
  | Readonly<{ kind: 'organization_exact'; tenantId: string; organizationId: string }>
  | Readonly<{
      kind: 'organization_subtree'
      tenantId: string
      ancestorOrganizationId: string
    }>
  | Readonly<{ kind: 'school'; tenantId: string; schoolId: string }>
  | Readonly<{
      kind: 'class'
      tenantId: string
      actorPersonId: string
      classId?: string
      schoolId?: string
    }>
  | Readonly<{ kind: 'self'; tenantId: string; personId: string }>
  | Readonly<{
      kind: 'linked_student'
      tenantId: string
      guardianPersonId: string
      studentId?: string
      classId?: string
    }>

export interface DatabasePolicyContext {
  capability: string
  policyVersion: string
  queryConstraints: readonly DatabasePolicyQueryConstraint[]
}

export interface IdentityTenantResolutionContext {
  tenantId: string
  personId: string
  queryConstraints: readonly (
    | Extract<DatabasePolicyQueryConstraint, { kind: 'school' }>
    | Extract<DatabasePolicyQueryConstraint, { kind: 'linked_student' }>
  )[]
}

export type TenantPlacementDenialReason =
  | 'DATABASE_CONTEXT_INVALID'
  | 'DATABASE_ROLE_UNSAFE'
  | 'DATABASE_CONTEXT_STALE'
  | 'TENANT_PLACEMENT_UNKNOWN'
  | 'TENANT_PLACEMENT_DISABLED'
  | 'TENANT_PLACEMENT_UNSUPPORTED'
  | 'TENANT_SUSPENDED'

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
  if (context.identityEmail) requireSafeValue('identityEmail', context.identityEmail)
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
  if (context.reauthenticatedAt) {
    const reauthenticatedAt = new Date(context.reauthenticatedAt)
    if (
      Number.isNaN(reauthenticatedAt.getTime()) ||
      reauthenticatedAt.toISOString() !== context.reauthenticatedAt
    ) {
      deny('DATABASE_CONTEXT_INVALID', 'reauthenticatedAt must be a canonical ISO timestamp')
    }
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

export function validateDatabasePolicyContext(
  policy: DatabasePolicyContext,
  tenant: TenantDatabaseContext
): void {
  requireSafeValue('capability', policy.capability)
  requireSafeValue('policyVersion', policy.policyVersion)
  if (!/^[a-z][a-z0-9_.:-]{0,127}$/.test(policy.capability)) {
    deny('DATABASE_CONTEXT_INVALID', 'capability contains unsupported characters')
  }
  if (policy.queryConstraints.length < 1 || policy.queryConstraints.length > 16) {
    deny('DATABASE_CONTEXT_INVALID', 'queryConstraints must contain between 1 and 16 scopes')
  }
  for (const constraint of policy.queryConstraints) {
    requireUuid('queryConstraint.tenantId', constraint.tenantId)
    if (constraint.tenantId !== tenant.tenantId) {
      deny('DATABASE_CONTEXT_INVALID', 'queryConstraint Tenant does not match request context')
    }
    switch (constraint.kind) {
      case 'tenant':
        break
      case 'organization_exact':
        requireUuid('queryConstraint.organizationId', constraint.organizationId)
        break
      case 'organization_subtree':
        requireUuid('queryConstraint.ancestorOrganizationId', constraint.ancestorOrganizationId)
        break
      case 'school':
        requireUuid('queryConstraint.schoolId', constraint.schoolId)
        break
      case 'class':
        requireUuid('queryConstraint.actorPersonId', constraint.actorPersonId)
        if (constraint.classId) requireUuid('queryConstraint.classId', constraint.classId)
        if (constraint.schoolId) requireUuid('queryConstraint.schoolId', constraint.schoolId)
        break
      case 'self':
        requireUuid('queryConstraint.personId', constraint.personId)
        break
      case 'linked_student':
        requireUuid('queryConstraint.guardianPersonId', constraint.guardianPersonId)
        if (constraint.studentId) requireUuid('queryConstraint.studentId', constraint.studentId)
        if (constraint.classId) requireUuid('queryConstraint.classId', constraint.classId)
        break
      default:
        deny('DATABASE_CONTEXT_INVALID', 'queryConstraint kind is unsupported')
    }
  }
}

function createRuntimeDatabase(connectionString: string, max: number) {
  const client = postgres(connectionString, {
    max,
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

interface RuntimeRoleEvidence extends Record<string, unknown> {
  currentUser: string
  bypassesRls: boolean
  canCreateDatabase: boolean
  canCreateRole: boolean
  isSuperuser: boolean
  ownsProductTables: boolean
  canCreateInPublic: boolean
  canTruncateStudents: boolean
  canUpdateAuditEvents: boolean
  canDeleteAuditEvents: boolean
  canInsertAuditEvents: boolean
  canInsertAuditOutbox: boolean
  canUpdateAuditOutbox: boolean
  canDeleteAuditOutbox: boolean
  canAccessAuditArchiveManifests: boolean
  canSelectInvitations: boolean
  canInsertInvitations: boolean
  canUpdateInvitations: boolean
  canDeleteInvitations: boolean
  canSelectInvitationDelivery: boolean
  canInsertInvitationDelivery: boolean
  canUpdateInvitationDelivery: boolean
  canDeleteInvitationDelivery: boolean
  canUseInvitationSchema: boolean
  canCreateInInvitationSchema: boolean
  canExecuteInvitationAcceptance: boolean
  canExecuteIdentityRevocation: boolean
  canAssumeMigrationRole: boolean
  canAssumeOtherExecutionRole: boolean
  canAssumeBackupRole: boolean
  canAssumeEmergencyRole: boolean
  canAssumeInvitationAcceptor: boolean
  canAssumeIdentityRevoker: boolean
  operationalRolesExist: boolean
  hasUnsafeMembership: boolean
}

async function assertSafeExecutionRole(
  database: RuntimeDatabase,
  expectedUsername: string,
  migrationUsername: string,
  otherExecutionUsername: string,
  canProcessAuditOutbox: boolean
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
      has_table_privilege(current_user, 'public.audit_events', 'UPDATE') as "canUpdateAuditEvents",
      has_table_privilege(current_user, 'public.audit_events', 'DELETE') as "canDeleteAuditEvents",
      has_table_privilege(current_user, 'public.audit_events', 'INSERT') as "canInsertAuditEvents",
      has_table_privilege(current_user, 'public.audit_outbox', 'INSERT') as "canInsertAuditOutbox",
      has_table_privilege(current_user, 'public.audit_outbox', 'UPDATE') as "canUpdateAuditOutbox",
      has_table_privilege(current_user, 'public.audit_outbox', 'DELETE') as "canDeleteAuditOutbox",
      has_table_privilege(
        current_user,
        'public.audit_archive_manifests',
        'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
      ) as "canAccessAuditArchiveManifests",
      has_table_privilege(current_user, 'public.account_invitations', 'SELECT')
        as "canSelectInvitations",
      has_table_privilege(current_user, 'public.account_invitations', 'INSERT')
        as "canInsertInvitations",
      has_table_privilege(current_user, 'public.account_invitations', 'UPDATE')
        as "canUpdateInvitations",
      has_table_privilege(current_user, 'public.account_invitations', 'DELETE')
        as "canDeleteInvitations",
      has_table_privilege(current_user, 'public.invitation_delivery_outbox', 'SELECT')
        as "canSelectInvitationDelivery",
      has_table_privilege(current_user, 'public.invitation_delivery_outbox', 'INSERT')
        as "canInsertInvitationDelivery",
      has_table_privilege(current_user, 'public.invitation_delivery_outbox', 'UPDATE')
        as "canUpdateInvitationDelivery",
      has_table_privilege(current_user, 'public.invitation_delivery_outbox', 'DELETE')
        as "canDeleteInvitationDelivery",
      has_schema_privilege(current_user, 'openschool_private', 'USAGE')
        as "canUseInvitationSchema",
      has_schema_privilege(current_user, 'openschool_private', 'CREATE')
        as "canCreateInInvitationSchema",
      -- Resolve by catalog OID so the worker can prove denial without private-schema USAGE.
      coalesce((
        select has_function_privilege(current_user, procedure.oid, 'EXECUTE')
        from pg_proc procedure
        inner join pg_namespace namespace on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'openschool_private'
          and procedure.proname = 'accept_account_invitation'
          and procedure.proargtypes = '25 1184 1184'::oidvector
      ), false) as "canExecuteInvitationAcceptance",
      coalesce((
        select has_function_privilege(current_user, procedure.oid, 'EXECUTE')
        from pg_proc procedure
        inner join pg_namespace namespace on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'openschool_private'
          and procedure.proname = 'apply_identity_revocation'
          and procedure.proargtypes = '25 2950 25'::oidvector
      ), false) as "canExecuteIdentityRevocation",
      exists (
        select 1 from pg_roles candidate
        where candidate.rolname = ${migrationUsername}
          and pg_has_role(current_user, candidate.oid, 'member')
      ) as "canAssumeMigrationRole",
      exists (
        select 1 from pg_roles candidate
        where candidate.rolname = ${otherExecutionUsername}
          and pg_has_role(current_user, candidate.oid, 'member')
      ) as "canAssumeOtherExecutionRole",
      exists (
        select 1 from pg_roles candidate
        where candidate.rolname = 'openschool_backup'
          and pg_has_role(current_user, candidate.oid, 'member')
      ) as "canAssumeBackupRole",
      exists (
        select 1 from pg_roles candidate
        where candidate.rolname = 'openschool_emergency'
          and pg_has_role(current_user, candidate.oid, 'member')
      ) as "canAssumeEmergencyRole",
      exists (
        select 1 from pg_roles candidate
        where candidate.rolname = 'openschool_invitation_acceptor'
          and pg_has_role(current_user, candidate.oid, 'member')
      ) as "canAssumeInvitationAcceptor",
      exists (
        select 1 from pg_roles candidate
        where candidate.rolname = 'openschool_identity_revoker'
          and pg_has_role(current_user, candidate.oid, 'member')
      ) as "canAssumeIdentityRevoker",
      (
        select count(*) = 2
        from pg_roles candidate
        where candidate.rolname in ('openschool_backup', 'openschool_emergency')
      ) as "operationalRolesExist",
      exists (
        select 1 from pg_roles granted_role
        where granted_role.rolname <> current_user
          and pg_has_role(current_user, granted_role.oid, 'member')
          and (
            granted_role.rolsuper or granted_role.rolbypassrls
            or granted_role.rolcreatedb or granted_role.rolcreaterole
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
    evidence.canUpdateAuditEvents ||
    evidence.canDeleteAuditEvents ||
    !evidence.canInsertAuditEvents ||
    evidence.canInsertAuditOutbox !== !canProcessAuditOutbox ||
    evidence.canUpdateAuditOutbox !== canProcessAuditOutbox ||
    evidence.canDeleteAuditOutbox ||
    evidence.canAccessAuditArchiveManifests ||
    !evidence.canSelectInvitations ||
    evidence.canInsertInvitations !== !canProcessAuditOutbox ||
    evidence.canUpdateInvitations !== !canProcessAuditOutbox ||
    evidence.canDeleteInvitations ||
    evidence.canSelectInvitationDelivery !== canProcessAuditOutbox ||
    evidence.canInsertInvitationDelivery !== !canProcessAuditOutbox ||
    evidence.canUpdateInvitationDelivery !== canProcessAuditOutbox ||
    evidence.canDeleteInvitationDelivery ||
    evidence.canUseInvitationSchema !== !canProcessAuditOutbox ||
    evidence.canCreateInInvitationSchema ||
    evidence.canExecuteInvitationAcceptance !== !canProcessAuditOutbox ||
    evidence.canExecuteIdentityRevocation !== !canProcessAuditOutbox ||
    evidence.canAssumeMigrationRole ||
    evidence.canAssumeOtherExecutionRole ||
    evidence.canAssumeBackupRole ||
    evidence.canAssumeEmergencyRole ||
    evidence.canAssumeInvitationAcceptor ||
    evidence.canAssumeIdentityRevoker ||
    !evidence.operationalRolesExist ||
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
      environment.DATABASE_MIGRATION_ROLE,
      environment.DATABASE_WORKER_ROLE,
      false
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
      environment.DATABASE_MIGRATION_ROLE,
      environment.DATABASE_RUNTIME_ROLE,
      true
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
  const setters = Object.entries(settings).map(
    ([key, value]) => sql`set_config(${key}, ${value ?? ''}, true)`
  )
  if (setters.length === 0) return
  // Reviewed raw-SQL allowlist: every key/value is bound and `true` makes all
  // settings transaction-local so pooled sessions cannot inherit context.
  await transaction.execute(sql`select ${sql.join(setters, sql`, `)}`)
}

/**
 * Narrows a verified identity-bootstrap transaction to context-resolution rows.
 * Callers must derive every scope from current Account Link and Affiliation data.
 */
export async function bindIdentityTenantResolutionContext(
  transaction: DatabaseTransaction,
  context: IdentityTenantResolutionContext
): Promise<void> {
  requireUuid('tenantId', context.tenantId)
  requireUuid('personId', context.personId)
  if (context.queryConstraints.length < 1 || context.queryConstraints.length > 16) {
    deny('DATABASE_CONTEXT_INVALID', 'Identity resolution needs between 1 and 16 scopes')
  }
  for (const constraint of context.queryConstraints) {
    requireUuid('queryConstraint.tenantId', constraint.tenantId)
    if (constraint.tenantId !== context.tenantId) {
      deny('DATABASE_CONTEXT_INVALID', 'Identity resolution scope has a different Tenant')
    }
    if (constraint.kind === 'school') {
      requireUuid('queryConstraint.schoolId', constraint.schoolId)
    } else {
      requireUuid('queryConstraint.guardianPersonId', constraint.guardianPersonId)
      if (constraint.guardianPersonId !== context.personId) {
        deny('DATABASE_CONTEXT_INVALID', 'Guardian resolution scope has a different Person')
      }
      if (constraint.studentId) requireUuid('queryConstraint.studentId', constraint.studentId)
      if (constraint.classId) requireUuid('queryConstraint.classId', constraint.classId)
    }
  }
  await setContext(transaction, {
    'app.person_id': context.personId,
    'app.tenant_id': context.tenantId,
    'app.education_organization_id': undefined,
    'app.school_id': undefined,
    'app.policy_capability': 'identity.context.resolve',
    'app.policy_version': 'identity-context.v1',
    'app.policy_constraints': JSON.stringify(context.queryConstraints),
  })
}

async function withIdentityUsing<T>(
  database: RuntimeDatabase,
  securityAssertion: () => Promise<void>,
  context: IdentityDatabaseContext,
  operation: DatabaseOperation<T>
): Promise<T> {
  validateIdentityDatabaseContext(context)
  await securityAssertion()
  return database.transaction(async (transaction) => {
    await setContext(transaction, {
      'app.identity_provider': context.identityProvider,
      'app.provider_subject': context.providerSubject,
      'app.provider_session_id': context.providerSessionId,
      'app.identity_email': context.identityEmail,
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
      tenantStatus: tenants.status,
    })
    .from(tenantPlacements)
    .innerJoin(tenants, eq(tenants.id, tenantPlacements.tenantId))
    .where(
      and(eq(tenantPlacements.tenantId, tenantId), eq(tenantPlacements.placementKey, 'primary'))
    )
    // This lock is the revocation linearization point. Tenant suspension takes
    // FOR UPDATE on the same row, waits for already-running work, and blocks
    // every later runtime/worker transaction before product data is exposed.
    .for('share', { of: tenants })
    .limit(1)
  if (!placement) deny('TENANT_PLACEMENT_UNKNOWN', 'Tenant placement is not configured')
  if (placement.tenantStatus !== 'active') {
    deny('TENANT_SUSPENDED', 'Tenant is not active')
  }
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
  const databaseNow = sql`now()`
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
        lte(accountLinks.validFrom, databaseNow),
        or(isNull(accountLinks.validUntil), gt(accountLinks.validUntil, databaseNow))
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
        context.reauthenticatedAt
          ? eq(accountSessions.reauthenticatedAt, new Date(context.reauthenticatedAt))
          : undefined,
        gt(accountSessions.expiresAt, databaseNow)
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
  securityAssertion: () => Promise<void>,
  context: TenantDatabaseContext,
  operation: DatabaseOperation<T>,
  policyContext?: DatabasePolicyContext
): Promise<T> {
  validateTenantDatabaseContext(context)
  if (policyContext) validateDatabasePolicyContext(policyContext, context)
  await securityAssertion()
  return database.transaction(async (transaction) => {
    await setContext(transaction, {
      'app.account_id': context.accountId,
      'app.person_id': context.personId,
      'app.tenant_id': context.tenantId,
      'app.session_id': context.sessionId,
      'app.request_id': context.requestId,
      'app.assurance_level': context.assuranceLevel,
      'app.reauthenticated_at': context.reauthenticatedAt,
      'app.membership_version': String(context.membershipVersion),
      'app.security_version': String(context.securityVersion),
      'app.context_policy_version': String(context.contextPolicyVersion),
      'app.education_organization_id': context.activeEducationOrganizationId,
      'app.school_id': context.activeSchoolId,
      'app.policy_capability': policyContext?.capability,
      'app.policy_version': policyContext?.policyVersion,
      'app.policy_constraints': policyContext
        ? JSON.stringify(policyContext.queryConstraints)
        : undefined,
    })
    await assertActivePooledPlacement(transaction, context.tenantId)
    await assertCurrentTenantContext(transaction, context)
    return operation(transaction)
  })
}

async function withWorkerUsing<T>(
  database: RuntimeDatabase,
  securityAssertion: () => Promise<void>,
  context: WorkerDatabaseContext,
  operation: DatabaseOperation<T>
): Promise<T> {
  validateWorkerDatabaseContext(context)
  await securityAssertion()
  return database.transaction(async (transaction) => {
    await setContext(transaction, { 'app.tenant_id': context.tenantId })
    await assertActivePooledPlacement(transaction, context.tenantId)
    await setContext(transaction, {
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
  return withIdentityUsing(runtime(), assertRuntimeSecurity, context, operation)
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
  return withTenantUsing(runtime(), assertRuntimeSecurity, context, operation)
}

/** Runs product work under both canonical Tenant and approved Policy Decision scope. */
export async function withPolicyTenantTransaction<T>(
  context: TenantDatabaseContext,
  policyContext: DatabasePolicyContext,
  operation: DatabaseOperation<T>
): Promise<T> {
  validateTenantDatabaseContext(context)
  validateDatabasePolicyContext(policyContext, context)
  return withTenantUsing(runtime(), assertRuntimeSecurity, context, operation, policyContext)
}

/** Runs a bounded background job through the separately credentialed worker role. */
export async function withWorkerTenantTransaction<T>(
  context: WorkerDatabaseContext,
  operation: DatabaseOperation<T>
): Promise<T> {
  validateWorkerDatabaseContext(context)
  return withWorkerUsing(worker(), assertWorkerSecurity, context, operation)
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
  reauthenticatedAt: string | null
  contextPolicyVersion: string | null
  policyCapability: string | null
  policyVersion: string | null
  policyConstraints: string | null
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
  let securityAssertion: Promise<void> | undefined
  const assertHarnessSecurity = (): Promise<void> => {
    securityAssertion ??= assertSafeExecutionRole(
      database,
      databaseUsername(connectionString),
      environment.DATABASE_MIGRATION_ROLE,
      kind === 'runtime' ? environment.DATABASE_WORKER_ROLE : environment.DATABASE_RUNTIME_ROLE,
      kind === 'worker'
    ).catch((error) => {
      securityAssertion = undefined
      throw error
    })
    return securityAssertion
  }

  return Object.freeze({
    withIdentityTransaction: <T>(
      context: IdentityDatabaseContext,
      operation: DatabaseOperation<T>
    ) => withIdentityUsing(database, assertHarnessSecurity, context, operation),
    withTenantTransaction: <T>(context: TenantDatabaseContext, operation: DatabaseOperation<T>) =>
      withTenantUsing(database, assertHarnessSecurity, context, operation),
    withPolicyTenantTransaction: <T>(
      context: TenantDatabaseContext,
      policyContext: DatabasePolicyContext,
      operation: DatabaseOperation<T>
    ) => withTenantUsing(database, assertHarnessSecurity, context, operation, policyContext),
    withWorkerTenantTransaction: <T>(
      context: WorkerDatabaseContext,
      operation: DatabaseOperation<T>
    ) => withWorkerUsing(database, assertHarnessSecurity, context, operation),
    readSessionContext: async (): Promise<DatabaseSessionContextEvidence> => {
      await assertHarnessSecurity()
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
          nullif(current_setting('app.reauthenticated_at', true), '') as "reauthenticatedAt",
          nullif(current_setting('app.context_policy_version', true), '') as "contextPolicyVersion"
          ,nullif(current_setting('app.policy_capability', true), '') as "policyCapability"
          ,nullif(current_setting('app.policy_version', true), '') as "policyVersion"
          ,nullif(current_setting('app.policy_constraints', true), '') as "policyConstraints"
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
  const pools = [runtimeDatabase, workerDatabase]
  let results: PromiseSettledResult<void>[] = []
  try {
    results = await Promise.allSettled(
      pools.map((pool) => pool?.$client.end({ timeout: 5 }) ?? Promise.resolve())
    )
  } finally {
    runtimeDatabase = undefined
    workerDatabase = undefined
    runtimeSecurityAssertion = undefined
    workerSecurityAssertion = undefined
  }
  const failed = results.find((result) => result.status === 'rejected')
  if (failed?.status === 'rejected') throw failed.reason
}
