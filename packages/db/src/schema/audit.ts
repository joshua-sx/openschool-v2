import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  inet,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { educationOrganizations } from './education-organizations'
import { accounts, people } from './identity'
import { schools } from './schools'
import { tenants } from './tenancy'
import { users } from './users'

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Who
  userId: uuid('user_id').references(() => users.id),
  userEmail: text('user_email'),
  userRole: text('user_role'),

  // What
  action: text('action').notNull(), // create, read, update, delete
  resource: text('resource').notNull(), // student, grade, class, etc.
  resourceId: uuid('resource_id'),

  // Context
  orgId: uuid('org_id'),
  schoolId: uuid('school_id'),

  // Details
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
  metadata: jsonb('metadata'),

  // When/Where
  ipAddress: inet('ip_address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert

export const AUDIT_OUTCOMES = ['attempted', 'succeeded', 'denied', 'failed'] as const
export const AUDIT_ACTOR_TYPES = ['account', 'worker', 'system', 'support'] as const
export const AUDIT_SOURCES = ['web', 'worker', 'migration', 'support', 'system'] as const
export const AUDIT_RETENTION_CLASSES = [
  'operational',
  'security',
  'financial',
  'safeguarding',
  'legal_hold',
] as const
export const AUDIT_OUTBOX_STATUSES = [
  'pending',
  'processing',
  'published',
  'failed',
  'dead_letter',
] as const

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
    eventVersion: integer('event_version').default(1).notNull(),
    eventType: text('event_type').notNull(),
    outcome: text('outcome', { enum: AUDIT_OUTCOMES }).notNull(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    educationOrganizationId: uuid('education_organization_id'),
    schoolId: uuid('school_id'),
    actorType: text('actor_type', { enum: AUDIT_ACTOR_TYPES }).notNull(),
    actorAccountId: uuid('actor_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    actorPersonId: uuid('actor_person_id'),
    capability: text('capability'),
    policyVersion: text('policy_version'),
    policyDecision: jsonb('policy_decision').$type<Record<string, unknown>>(),
    requestId: text('request_id').notNull(),
    correlationId: text('correlation_id').notNull(),
    causationId: uuid('causation_id'),
    preOperationReceiptId: uuid('pre_operation_receipt_id'),
    supportGrantId: uuid('support_grant_id'),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    dataClasses: jsonb('data_classes').$type<string[]>().notNull(),
    changeSummary: jsonb('change_summary').$type<Record<string, unknown>>().default({}).notNull(),
    purpose: text('purpose'),
    source: text('source', { enum: AUDIT_SOURCES }).notNull(),
    retentionClass: text('retention_class', { enum: AUDIT_RETENTION_CLASSES })
      .default('security')
      .notNull(),
    legalHold: boolean('legal_hold').default(false).notNull(),
    contentHash: text('content_hash').default('pending').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ name: 'audit_events_pk', columns: [table.occurredAt, table.id] }),
    foreignKey({
      name: 'audit_events_tenant_actor_person_fk',
      columns: [table.tenantId, table.actorPersonId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'audit_events_tenant_organization_fk',
      columns: [table.tenantId, table.educationOrganizationId],
      foreignColumns: [educationOrganizations.tenantId, educationOrganizations.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'audit_events_tenant_school_fk',
      columns: [table.tenantId, table.schoolId],
      foreignColumns: [schools.tenantId, schools.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('audit_events_tenant_time_idx').on(table.tenantId, table.occurredAt, table.id),
    index('audit_events_tenant_target_idx').on(
      table.tenantId,
      table.targetType,
      table.targetId,
      table.occurredAt
    ),
    index('audit_events_correlation_idx').on(table.tenantId, table.correlationId, table.occurredAt),
    check('audit_events_version_positive', sql`${table.eventVersion} > 0`),
    check('audit_events_type_format', sql`${table.eventType} ~ '^[a-z][a-z0-9_.]{2,127}$'`),
    check(
      'audit_events_reference_format',
      sql`${table.targetType} ~ '^[a-z][a-z0-9_.]{2,127}$' AND char_length(${table.requestId}) BETWEEN 1 AND 512 AND char_length(${table.correlationId}) BETWEEN 1 AND 512 AND (${table.targetId} IS NULL OR char_length(${table.targetId}) BETWEEN 1 AND 512) AND (${table.purpose} IS NULL OR ${table.purpose} ~ '^[a-z][a-z0-9_.-]{2,63}$')`
    ),
    check(
      'audit_events_outcome_check',
      sql`${table.outcome} IN ('attempted', 'succeeded', 'denied', 'failed')`
    ),
    check(
      'audit_events_actor_type_check',
      sql`${table.actorType} IN ('account', 'worker', 'system', 'support')`
    ),
    check(
      'audit_events_source_check',
      sql`${table.source} IN ('web', 'worker', 'migration', 'support', 'system')`
    ),
    check(
      'audit_events_retention_check',
      sql`${table.retentionClass} IN ('operational', 'security', 'financial', 'safeguarding', 'legal_hold')`
    ),
    check(
      'audit_events_data_classes_check',
      sql`jsonb_typeof(${table.dataClasses}) = 'array' AND jsonb_array_length(${table.dataClasses}) BETWEEN 1 AND 8 AND ${table.dataClasses} <@ '["internal", "student_personal", "financial", "health", "safeguarding", "credential"]'::jsonb`
    ),
    check(
      'audit_events_json_shape_check',
      sql`jsonb_typeof(${table.changeSummary}) = 'object' AND (${table.policyDecision} IS NULL OR jsonb_typeof(${table.policyDecision}) = 'object')`
    ),
    check(
      'audit_events_account_actor_check',
      sql`(${table.actorType} NOT IN ('account', 'support')) OR (${table.actorAccountId} IS NOT NULL AND ${table.actorPersonId} IS NOT NULL)`
    ),
    check(
      'audit_events_support_context_check',
      sql`(${table.actorType} = 'support' AND ${table.supportGrantId} IS NOT NULL AND ${table.purpose} IS NOT NULL AND ${table.source} = 'support') OR (${table.actorType} <> 'support' AND ${table.supportGrantId} IS NULL)`
    ),
    check('audit_events_content_hash_check', sql`${table.contentHash} ~ '^[0-9a-f]{64}$'`),
    pgPolicy('audit_events_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.audit.read'
        AND public.openschool_audit_scope_allows(
          ${table.tenantId}, ${table.educationOrganizationId}, ${table.schoolId}
        )
      `,
    }),
    pgPolicy('audit_events_runtime_insert', {
      for: 'insert',
      to: 'openschool_runtime',
      withCheck: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND ${table.actorType} IN ('account', 'support')
        AND ${table.actorAccountId} = nullif(current_setting('app.account_id', true), '')::uuid
        AND ${table.actorPersonId} = nullif(current_setting('app.person_id', true), '')::uuid
        AND ${table.requestId} = nullif(current_setting('app.request_id', true), '')
        AND ${table.educationOrganizationId} IS NOT DISTINCT FROM nullif(current_setting('app.education_organization_id', true), '')::uuid
        AND ${table.schoolId} IS NOT DISTINCT FROM nullif(current_setting('app.school_id', true), '')::uuid
        AND (
          (${table.actorType} = 'account' AND ${table.source} = 'web' AND ${table.supportGrantId} IS NULL)
          OR (${table.actorType} = 'support' AND ${table.source} = 'support' AND ${table.supportGrantId} IS NOT NULL AND ${table.purpose} IS NOT NULL)
        )
      `,
    }),
    pgPolicy('audit_events_runtime_update_deny', {
      for: 'update',
      to: 'openschool_runtime',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('audit_events_runtime_delete_deny', {
      for: 'delete',
      to: 'openschool_runtime',
      using: sql`false`,
    }),
    pgPolicy('audit_events_worker_select', {
      for: 'select',
      to: 'openschool_worker',
      using: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid`,
    }),
    pgPolicy('audit_events_worker_insert', {
      for: 'insert',
      to: 'openschool_worker',
      withCheck: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND ${table.actorType} = 'worker'
        AND ${table.actorAccountId} IS NULL
        AND ${table.actorPersonId} IS NULL
        AND ${table.source} = 'worker'
      `,
    }),
    pgPolicy('audit_events_worker_update_deny', {
      for: 'update',
      to: 'openschool_worker',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('audit_events_worker_delete_deny', {
      for: 'delete',
      to: 'openschool_worker',
      using: sql`false`,
    }),
  ]
).enableRLS()

export const auditOutbox = pgTable(
  'audit_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    auditEventId: uuid('audit_event_id').notNull(),
    auditEventOccurredAt: timestamp('audit_event_occurred_at', { withTimezone: true }).notNull(),
    topic: text('topic').notNull(),
    deduplicationKey: text('deduplication_key').notNull(),
    correlationId: text('correlation_id').notNull(),
    context: jsonb('context').$type<Record<string, unknown>>().notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    payloadHash: text('payload_hash').default('pending').notNull(),
    status: text('status', { enum: AUDIT_OUTBOX_STATUSES }).default('pending').notNull(),
    attemptCount: integer('attempt_count').default(0).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true }).defaultNow().notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'audit_outbox_event_fk',
      columns: [table.auditEventOccurredAt, table.auditEventId],
      foreignColumns: [auditEvents.occurredAt, auditEvents.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique('audit_outbox_tenant_dedup_unique').on(table.tenantId, table.deduplicationKey),
    index('audit_outbox_claim_idx').on(table.tenantId, table.status, table.availableAt, table.id),
    index('audit_outbox_event_idx').on(table.auditEventOccurredAt, table.auditEventId),
    check('audit_outbox_attempt_nonnegative', sql`${table.attemptCount} >= 0`),
    check('audit_outbox_topic_format', sql`${table.topic} ~ '^[a-z][a-z0-9_.]{2,127}$'`),
    check(
      'audit_outbox_reference_format',
      sql`char_length(${table.deduplicationKey}) BETWEEN 1 AND 512 AND char_length(${table.correlationId}) BETWEEN 1 AND 512`
    ),
    check(
      'audit_outbox_context_binding_check',
      sql`jsonb_typeof(${table.context}) = 'object' AND jsonb_typeof(${table.payload}) = 'object' AND ${table.context} ->> 'tenantId' = ${table.tenantId}::text AND ${table.context} ->> 'correlationId' = ${table.correlationId} AND nullif(${table.context} ->> 'requestId', '') IS NOT NULL AND ${table.payload} ->> 'auditEventId' = ${table.auditEventId}::text`
    ),
    check(
      'audit_outbox_status_check',
      sql`${table.status} IN ('pending', 'processing', 'published', 'failed', 'dead_letter')`
    ),
    check('audit_outbox_payload_hash_check', sql`${table.payloadHash} ~ '^[0-9a-f]{64}$'`),
    pgPolicy('audit_outbox_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND ${table.context} ->> 'actorAccountId' = nullif(current_setting('app.account_id', true), '')
        AND ${table.context} ->> 'actorPersonId' = nullif(current_setting('app.person_id', true), '')
      `,
    }),
    pgPolicy('audit_outbox_runtime_insert', {
      for: 'insert',
      to: 'openschool_runtime',
      withCheck: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND ${table.context} ->> 'requestId' = nullif(current_setting('app.request_id', true), '')
        AND ${table.context} ->> 'actorAccountId' = nullif(current_setting('app.account_id', true), '')
        AND ${table.context} ->> 'actorPersonId' = nullif(current_setting('app.person_id', true), '')
      `,
    }),
    pgPolicy('audit_outbox_runtime_update_deny', {
      for: 'update',
      to: 'openschool_runtime',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('audit_outbox_runtime_delete_deny', {
      for: 'delete',
      to: 'openschool_runtime',
      using: sql`false`,
    }),
    pgPolicy('audit_outbox_worker_select', {
      for: 'select',
      to: 'openschool_worker',
      using: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid`,
    }),
    pgPolicy('audit_outbox_worker_update', {
      for: 'update',
      to: 'openschool_worker',
      using: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid`,
      withCheck: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid`,
    }),
    pgPolicy('audit_outbox_worker_insert_deny', {
      for: 'insert',
      to: 'openschool_worker',
      withCheck: sql`false`,
    }),
    pgPolicy('audit_outbox_worker_delete_deny', {
      for: 'delete',
      to: 'openschool_worker',
      using: sql`false`,
    }),
  ]
).enableRLS()

export const auditArchiveManifests = pgTable(
  'audit_archive_manifests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    retentionClass: text('retention_class', { enum: AUDIT_RETENTION_CLASSES }).notNull(),
    eventCount: integer('event_count').notNull(),
    firstEventHash: text('first_event_hash').notNull(),
    lastEventHash: text('last_event_hash').notNull(),
    rootHash: text('root_hash').notNull(),
    previousManifestHash: text('previous_manifest_hash'),
    manifestHash: text('manifest_hash').notNull(),
    signingKeyId: text('signing_key_id').notNull(),
    signature: text('signature').notNull(),
    archiveLocationHash: text('archive_location_hash').notNull(),
    includesLegalHold: boolean('includes_legal_hold').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('audit_archive_manifest_period_unique').on(
      table.tenantId,
      table.periodStart,
      table.retentionClass
    ),
    index('audit_archive_manifest_chain_idx').on(
      table.tenantId,
      table.retentionClass,
      table.periodStart
    ),
    check('audit_archive_manifest_period_check', sql`${table.periodEnd} > ${table.periodStart}`),
    check('audit_archive_manifest_count_check', sql`${table.eventCount} >= 0`),
    check(
      'audit_archive_manifest_hashes_check',
      sql`${table.firstEventHash} ~ '^[0-9a-f]{64}$' AND ${table.lastEventHash} ~ '^[0-9a-f]{64}$' AND ${table.rootHash} ~ '^[0-9a-f]{64}$' AND ${table.manifestHash} ~ '^[0-9a-f]{64}$' AND ${table.archiveLocationHash} ~ '^[0-9a-f]{64}$'`
    ),
  ]
)

export type AuditEventRecord = typeof auditEvents.$inferSelect
export type NewAuditEventRecord = typeof auditEvents.$inferInsert
export type AuditOutboxRecord = typeof auditOutbox.$inferSelect
export type NewAuditOutboxRecord = typeof auditOutbox.$inferInsert
export type AuditArchiveManifest = typeof auditArchiveManifests.$inferSelect
