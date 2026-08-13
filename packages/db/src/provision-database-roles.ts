import {
  getControlPlaneEnv,
  getMigrationEnv,
  getServerEnv,
  getWorkerEnv,
} from '@openschool/config/server'
import postgres from 'postgres'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])
const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/
const LOCAL_PASSWORD = /^[A-Za-z0-9_-]{16,128}$/
const RESERVED_EXECUTION_ROLES = new Set([
  'postgres',
  'openschool_backup',
  'openschool_emergency',
  'openschool_identity_revoker',
  'openschool_invitation_acceptor',
  'openschool_tenant_admission_resolver',
  'openschool_platform_access_resolver',
  'openschool_tenant_lifecycle_manager',
  'openschool_provider_security_resolver',
  'openschool_support_grant_manager',
  'openschool_support_access_resolver',
  'openschool_audit_partition_manager',
  'openschool_student_admitter',
  'openschool_academic_configurator',
  'openschool_guardian_contact_manager',
  'openschool_household_scope_resolver',
  'openschool_household_manager',
  'openschool_section_scope_resolver',
  'openschool_section_manager',
])
const PROVISIONING_PHASES = new Set(['all', 'identities', 'grants'])

function databaseIdentity(url: URL): string {
  return `${url.hostname}:${url.port || '5432'}${url.pathname}`
}

function assertGuardedLocalProvisioning(
  migration: URL,
  runtime: URL,
  worker: URL,
  controlPlane: URL
): void {
  if (process.env.ALLOW_ROLE_PROVISIONING !== 'true') {
    throw new Error('Role provisioning refused: ALLOW_ROLE_PROVISIONING must be exactly "true".')
  }
  if (!LOOPBACK_HOSTS.has(migration.hostname)) {
    throw new Error('Role provisioning refused: migration database must be loopback.')
  }
  if (
    databaseIdentity(migration) !== databaseIdentity(runtime) ||
    databaseIdentity(migration) !== databaseIdentity(worker) ||
    databaseIdentity(migration) !== databaseIdentity(controlPlane)
  ) {
    throw new Error('Role provisioning refused: all local roles must target the same database.')
  }
  if (
    new Set([runtime.username, worker.username, controlPlane.username].map(decodeURIComponent))
      .size !== 3
  ) {
    throw new Error(
      'Role provisioning refused: runtime, worker, and control-plane roles must be distinct.'
    )
  }
  for (const url of [runtime, worker, controlPlane]) {
    const username = decodeURIComponent(url.username)
    const password = decodeURIComponent(url.password)
    if (
      !ROLE_NAME.test(username) ||
      RESERVED_EXECUTION_ROLES.has(username) ||
      !LOCAL_PASSWORD.test(password)
    ) {
      throw new Error(
        'Role provisioning refused: execution roles need non-reserved safe names and 16-128 character local passwords.'
      )
    }
  }
  const databaseName = decodeURIComponent(migration.pathname.slice(1))
  if (!ROLE_NAME.test(databaseName)) {
    throw new Error('Role provisioning refused: database name must be a safe identifier.')
  }
}

async function ensureExecutionRole(
  admin: ReturnType<typeof postgres>,
  roleName: string,
  password: string
): Promise<void> {
  const [existing] = await admin<Array<{ exists: boolean }>>`
    select exists(select 1 from pg_roles where rolname = ${roleName}) as exists
  `
  if (!existing?.exists) {
    await admin.unsafe(
      `create role ${roleName} login password '${password.replaceAll("'", "''")}' nosuperuser nocreatedb nocreaterole inherit nobypassrls`
    )
  } else {
    await admin.unsafe(
      `alter role ${roleName} login password '${password.replaceAll("'", "''")}' nosuperuser nocreatedb nocreaterole inherit nobypassrls`
    )
  }
}

async function ensureNoLoginRole(
  admin: ReturnType<typeof postgres>,
  roleName: string
): Promise<void> {
  const [existing] = await admin<Array<{ exists: boolean }>>`
    select exists(select 1 from pg_roles where rolname = ${roleName}) as exists
  `
  if (!existing?.exists) {
    await admin.unsafe(
      `create role ${roleName} nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls`
    )
  } else {
    await admin.unsafe(
      `alter role ${roleName} nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls`
    )
  }
}

async function run(): Promise<void> {
  const environment = getServerEnv()
  const migration = new URL(getMigrationEnv().DATABASE_MIGRATION_URL)
  const runtime = new URL(environment.DATABASE_RUNTIME_URL)
  const worker = new URL(getWorkerEnv().DATABASE_WORKER_URL)
  const controlPlane = new URL(getControlPlaneEnv().DATABASE_CONTROL_PLANE_URL)
  assertGuardedLocalProvisioning(migration, runtime, worker, controlPlane)

  const runtimeRole = decodeURIComponent(runtime.username)
  const workerRole = decodeURIComponent(worker.username)
  const controlPlaneRole = decodeURIComponent(controlPlane.username)
  const migrationRole = decodeURIComponent(migration.username)
  if (migrationRole !== environment.DATABASE_MIGRATION_ROLE) {
    throw new Error(
      'Role provisioning refused: migration URL username does not match DATABASE_MIGRATION_ROLE.'
    )
  }
  if (migrationRole !== 'postgres' && !ROLE_NAME.test(migrationRole)) {
    throw new Error('Role provisioning refused: migration role name must be safe.')
  }
  const databaseName = decodeURIComponent(migration.pathname.slice(1))
  const admin = postgres(migration.toString(), { max: 1, prepare: false })
  const phase = process.env.ROLE_PROVISIONING_PHASE ?? 'all'
  if (!PROVISIONING_PHASES.has(phase)) {
    throw new Error('Role provisioning refused: phase must be all, identities, or grants.')
  }

  try {
    await ensureExecutionRole(admin, runtimeRole, decodeURIComponent(runtime.password))
    await ensureExecutionRole(admin, workerRole, decodeURIComponent(worker.password))
    await ensureExecutionRole(admin, controlPlaneRole, decodeURIComponent(controlPlane.password))
    await ensureNoLoginRole(admin, 'openschool_backup')
    await ensureNoLoginRole(admin, 'openschool_emergency')
    await ensureNoLoginRole(admin, 'openschool_identity_revoker')
    await ensureNoLoginRole(admin, 'openschool_invitation_acceptor')
    await ensureNoLoginRole(admin, 'openschool_tenant_admission_resolver')
    await ensureNoLoginRole(admin, 'openschool_platform_access_resolver')
    await ensureNoLoginRole(admin, 'openschool_tenant_lifecycle_manager')
    await ensureNoLoginRole(admin, 'openschool_provider_security_resolver')
    await ensureNoLoginRole(admin, 'openschool_support_grant_manager')
    await ensureNoLoginRole(admin, 'openschool_support_access_resolver')
    await ensureNoLoginRole(admin, 'openschool_audit_partition_manager')
    await ensureNoLoginRole(admin, 'openschool_student_admitter')
    await ensureNoLoginRole(admin, 'openschool_academic_configurator')
    await ensureNoLoginRole(admin, 'openschool_guardian_contact_manager')
    await ensureNoLoginRole(admin, 'openschool_household_scope_resolver')
    await ensureNoLoginRole(admin, 'openschool_household_manager')
    await ensureNoLoginRole(admin, 'openschool_section_scope_resolver')
    await ensureNoLoginRole(admin, 'openschool_section_manager')
    if (migrationRole !== 'postgres') {
      await admin.unsafe(
        `grant openschool_identity_revoker, openschool_invitation_acceptor, openschool_tenant_admission_resolver, openschool_platform_access_resolver, openschool_tenant_lifecycle_manager, openschool_provider_security_resolver, openschool_support_grant_manager, openschool_support_access_resolver, openschool_audit_partition_manager, openschool_student_admitter, openschool_academic_configurator, openschool_guardian_contact_manager, openschool_household_scope_resolver, openschool_household_manager, openschool_section_scope_resolver, openschool_section_manager to ${migrationRole}`
      )
    }

    if (phase === 'identities') {
      console.log(
        `Provisioned PostgreSQL role identities before migration: runtime=${runtimeRole}, worker=${workerRole}, control-plane=${controlPlaneRole}.`
      )
      return
    }

    await admin.unsafe('revoke create on schema public from public')
    for (const executionRole of [runtimeRole, workerRole, controlPlaneRole]) {
      await admin.unsafe(`revoke all privileges on database ${databaseName} from ${executionRole}`)
      await admin.unsafe(`revoke all privileges on schema public from ${executionRole}`)
      await admin.unsafe(
        `revoke all privileges on all tables in schema public from ${executionRole}`
      )
      await admin.unsafe(
        `revoke all privileges on all sequences in schema public from ${executionRole}`
      )
    }
    await admin.unsafe(
      `grant connect on database ${databaseName} to ${runtimeRole}, ${workerRole}, ${controlPlaneRole}`
    )
    await admin.unsafe(`grant usage on schema public to ${runtimeRole}, ${workerRole}`)

    // Reviewed infrastructure allowlist: every interpolated identifier passed
    // ROLE_NAME validation; PostgreSQL role identifiers cannot be value-bound.
    await admin.unsafe(`
      grant select on
        tenants, tenant_placements, accounts, people, account_links,
        affiliations, role_template_assignments, person_relationships,
        contact_profiles, student_profiles, education_organizations, organization_tree_versions,
        organization_tree_closure, school_governance_assignments, schools,
        classes, students, enrollments, users_on_org, users_on_school,
        parent_student, school_enrollments, student_compatibility_evidence,
        school_enrollment_transition_events,
        academic_years, academic_terms, learner_levels, academic_compatibility_evidence,
        households, household_addresses, household_memberships,
        courses, sections, section_staff_assignments, section_roster_memberships,
        section_compatibility_evidence,
        support_access_notifications
      to ${runtimeRole}
    `)
    await admin.unsafe(`grant select, insert, update on account_sessions to ${runtimeRole}`)
    await admin.unsafe(`grant select, insert, update on account_invitations to ${runtimeRole}`)
    await admin.unsafe(`grant insert on invitation_delivery_outbox to ${runtimeRole}`)
    await admin.unsafe(`grant select, insert on audit_events, audit_outbox to ${runtimeRole}`)

    await admin.unsafe(
      `grant select on tenants, tenant_placements, students, audit_outbox, account_invitations, invitation_delivery_outbox, provider_security_reconciliation_outbox, support_access_grants, support_access_notifications, support_notification_outbox to ${workerRole}`
    )
    await admin.unsafe(`grant select, insert on audit_events to ${workerRole}`)
    await admin.unsafe(`grant update on audit_outbox to ${workerRole}`)
    await admin.unsafe(`grant update on invitation_delivery_outbox to ${workerRole}`)
    await admin.unsafe(`grant update on provider_security_reconciliation_outbox to ${workerRole}`)
    await admin.unsafe(`grant update on support_access_grants to ${workerRole}`)
    await admin.unsafe(`grant update on support_notification_outbox to ${workerRole}`)
    await admin.unsafe(
      `grant insert on support_access_notifications, support_notification_outbox to ${workerRole}`
    )

    for (const executionRole of [runtimeRole, workerRole, controlPlaneRole]) {
      await admin.unsafe(
        `revoke openschool_backup, openschool_emergency, openschool_identity_revoker, openschool_invitation_acceptor, openschool_tenant_admission_resolver, openschool_platform_access_resolver, openschool_tenant_lifecycle_manager, openschool_provider_security_resolver, openschool_support_grant_manager, openschool_support_access_resolver, openschool_audit_partition_manager, openschool_student_admitter, openschool_academic_configurator, openschool_guardian_contact_manager, openschool_household_scope_resolver, openschool_household_manager, openschool_section_scope_resolver, openschool_section_manager from ${executionRole}`
      )
      if (migrationRole !== 'postgres') {
        await admin.unsafe(`revoke ${migrationRole} from ${executionRole}`)
      }
    }

    console.log(
      `Provisioned local PostgreSQL ${phase} phase: migration=${migrationRole}, runtime=${runtimeRole}, worker=${workerRole}, control-plane=${controlPlaneRole}.`
    )
  } finally {
    await admin.end()
  }
}

await run()
