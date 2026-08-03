import { getMigrationEnv, getServerEnv, getWorkerEnv } from '@openschool/config/server'
import postgres from 'postgres'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])
const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/
const LOCAL_PASSWORD = /^[A-Za-z0-9_-]{16,128}$/
const RESERVED_EXECUTION_ROLES = new Set([
  'postgres',
  'openschool_backup',
  'openschool_emergency',
  'openschool_invitation_acceptor',
])
const PROVISIONING_PHASES = new Set(['all', 'identities', 'grants'])

function databaseIdentity(url: URL): string {
  return `${url.hostname}:${url.port || '5432'}${url.pathname}`
}

function assertGuardedLocalProvisioning(migration: URL, runtime: URL, worker: URL): void {
  if (process.env.ALLOW_ROLE_PROVISIONING !== 'true') {
    throw new Error('Role provisioning refused: ALLOW_ROLE_PROVISIONING must be exactly "true".')
  }
  if (!LOOPBACK_HOSTS.has(migration.hostname)) {
    throw new Error('Role provisioning refused: migration database must be loopback.')
  }
  if (
    databaseIdentity(migration) !== databaseIdentity(runtime) ||
    databaseIdentity(migration) !== databaseIdentity(worker)
  ) {
    throw new Error('Role provisioning refused: all local roles must target the same database.')
  }
  if (decodeURIComponent(runtime.username) === decodeURIComponent(worker.username)) {
    throw new Error('Role provisioning refused: runtime and worker roles must be distinct.')
  }
  for (const url of [runtime, worker]) {
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
  assertGuardedLocalProvisioning(migration, runtime, worker)

  const runtimeRole = decodeURIComponent(runtime.username)
  const workerRole = decodeURIComponent(worker.username)
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
    await ensureNoLoginRole(admin, 'openschool_backup')
    await ensureNoLoginRole(admin, 'openschool_emergency')
    await ensureNoLoginRole(admin, 'openschool_invitation_acceptor')
    if (migrationRole !== 'postgres') {
      await admin.unsafe(`grant openschool_invitation_acceptor to ${migrationRole}`)
    }

    if (phase === 'identities') {
      console.log(
        `Provisioned PostgreSQL role identities before migration: runtime=${runtimeRole}, worker=${workerRole}.`
      )
      return
    }

    await admin.unsafe('revoke create on schema public from public')
    for (const executionRole of [runtimeRole, workerRole]) {
      await admin.unsafe(`revoke all privileges on database ${databaseName} from ${executionRole}`)
      await admin.unsafe(`revoke all privileges on schema public from ${executionRole}`)
      await admin.unsafe(
        `revoke all privileges on all tables in schema public from ${executionRole}`
      )
      await admin.unsafe(
        `revoke all privileges on all sequences in schema public from ${executionRole}`
      )
    }
    await admin.unsafe(`grant connect on database ${databaseName} to ${runtimeRole}, ${workerRole}`)
    await admin.unsafe(`grant usage on schema public to ${runtimeRole}, ${workerRole}`)

    // Reviewed infrastructure allowlist: every interpolated identifier passed
    // ROLE_NAME validation; PostgreSQL role identifiers cannot be value-bound.
    await admin.unsafe(`
      grant select on
        tenants, tenant_placements, accounts, people, account_links,
        affiliations, role_template_assignments, person_relationships,
        student_profiles, education_organizations, organization_tree_versions,
        organization_tree_closure, school_governance_assignments, schools,
        classes, students, enrollments, users_on_org, users_on_school,
        parent_student
      to ${runtimeRole}
    `)
    await admin.unsafe(`grant select, insert, update on account_sessions to ${runtimeRole}`)
    await admin.unsafe(`grant select, insert, update on account_invitations to ${runtimeRole}`)
    await admin.unsafe(`grant insert on invitation_delivery_outbox to ${runtimeRole}`)
    await admin.unsafe(`grant insert, update, delete on students to ${runtimeRole}`)
    await admin.unsafe(`grant select, insert on audit_events, audit_outbox to ${runtimeRole}`)

    await admin.unsafe(
      `grant select on tenant_placements, students, audit_outbox, account_invitations, invitation_delivery_outbox to ${workerRole}`
    )
    await admin.unsafe(`grant select, insert on audit_events to ${workerRole}`)
    await admin.unsafe(`grant update on audit_outbox to ${workerRole}`)
    await admin.unsafe(`grant update on invitation_delivery_outbox to ${workerRole}`)

    for (const executionRole of [runtimeRole, workerRole]) {
      await admin.unsafe(
        `revoke openschool_backup, openschool_emergency, openschool_invitation_acceptor from ${executionRole}`
      )
      if (migrationRole !== 'postgres') {
        await admin.unsafe(`revoke ${migrationRole} from ${executionRole}`)
      }
    }

    console.log(
      `Provisioned local PostgreSQL ${phase} phase: migration=${migrationRole}, runtime=${runtimeRole}, worker=${workerRole}.`
    )
  } finally {
    await admin.end()
  }
}

await run()
