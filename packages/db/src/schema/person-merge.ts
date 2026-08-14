import { type SQLWrapper, sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { personDuplicateCases } from './duplicate-review'
import { accounts, people } from './identity'
import { schools } from './schools'
import { tenants } from './tenancy'

export const PERSON_MERGE_OPERATION_STATUSES = [
  'blocked',
  'pending_approval',
  'approved',
  'executed',
  'reversed',
  'manual_recovery',
] as const

export const PERSON_MERGE_PREVIEW_CATEGORIES = [
  'account_link',
  'profile',
  'affiliation',
  'relationship',
  'household_membership',
  'school_enrollment',
  'section_staff',
  'section_roster',
  'invitation',
  'authorization_history',
  'academic_history',
  'duplicate_case',
  'audit_history',
  'compatibility_evidence',
] as const

export const PERSON_MERGE_PREVIEW_DISPOSITIONS = [
  'move',
  'end_and_recreate',
  'preserve_history',
  'block',
] as const

export const PERSON_MERGE_EVENT_TYPES = [
  'preview_created',
  'approval_granted',
  'executed',
  'reversal_requested',
  'reversed',
  'manual_recovery_required',
] as const

export const PERSON_MERGE_ALIAS_STATUSES = ['active', 'reversed'] as const

export const PERSON_MERGE_MOVE_ACTIONS = [
  'repoint',
  'end_and_recreate',
  'preserve_history',
  'invalidate',
  'archive_source',
] as const

export type PersonMergeOperationStatus = (typeof PERSON_MERGE_OPERATION_STATUSES)[number]
export type PersonMergePreviewCategory = (typeof PERSON_MERGE_PREVIEW_CATEGORIES)[number]
export type PersonMergePreviewDisposition = (typeof PERSON_MERGE_PREVIEW_DISPOSITIONS)[number]
export type PersonMergeEventType = (typeof PERSON_MERGE_EVENT_TYPES)[number]
export type PersonMergeAliasStatus = (typeof PERSON_MERGE_ALIAS_STATUSES)[number]
export type PersonMergeMoveAction = (typeof PERSON_MERGE_MOVE_ACTIONS)[number]

const mergeCapabilities = sql`
  nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_merges.read',
    'tenant.people_merges.preview',
    'tenant.people_merges.approve',
    'tenant.people_merges.execute'
  )
`

const runtimeRead = (tenantId: SQLWrapper, schoolId: SQLWrapper) => sql`
  ${tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND ${mergeCapabilities}
  AND public.openschool_school_scope_allows(${tenantId}, ${schoolId})
`

const managerAccess = (tenantId: SQLWrapper, schoolId: SQLWrapper) => sql`
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_person_merge_manager'
  AND ${tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND ${mergeCapabilities}
  AND public.openschool_school_scope_allows(${tenantId}, ${schoolId})
`

export const personMergeOperations = pgTable(
  'person_merge_operations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    reviewSchoolId: uuid('review_school_id').notNull(),
    duplicateCaseId: uuid('duplicate_case_id').notNull(),
    duplicateCaseVersion: integer('duplicate_case_version').notNull(),
    duplicateEvidenceHash: text('duplicate_evidence_hash').notNull(),
    sourcePersonId: uuid('source_person_id').notNull(),
    targetPersonId: uuid('target_person_id').notNull(),
    status: text('status', { enum: PERSON_MERGE_OPERATION_STATUSES }).notNull(),
    currentVersion: integer('current_version').default(1).notNull(),
    planVersion: integer('plan_version').default(1).notNull(),
    previewDigest: text('preview_digest').notNull(),
    executionDigest: text('execution_digest'),
    dependencyCount: integer('dependency_count').default(0).notNull(),
    conflictCount: integer('conflict_count').default(0).notNull(),
    invalidationCount: integer('invalidation_count').default(0).notNull(),
    initiatedByAccountId: uuid('initiated_by_account_id')
      .references(() => accounts.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    initiationReason: text('initiation_reason').notNull(),
    approvedByAccountId: uuid('approved_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    approvalReason: text('approval_reason'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    executedByAccountId: uuid('executed_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    reversedByAccountId: uuid('reversed_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('person_merge_operations_tenant_id_id_unique').on(table.tenantId, table.id),
    foreignKey({
      name: 'person_merge_operations_tenant_school_fk',
      columns: [table.tenantId, table.reviewSchoolId],
      foreignColumns: [schools.tenantId, schools.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'person_merge_operations_tenant_case_fk',
      columns: [table.tenantId, table.duplicateCaseId],
      foreignColumns: [personDuplicateCases.tenantId, personDuplicateCases.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'person_merge_operations_tenant_source_fk',
      columns: [table.tenantId, table.sourcePersonId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'person_merge_operations_tenant_target_fk',
      columns: [table.tenantId, table.targetPersonId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    uniqueIndex('person_merge_operations_active_source_unique')
      .on(table.tenantId, table.sourcePersonId)
      .where(sql`${table.status} IN ('pending_approval', 'approved', 'executed')`),
    index('person_merge_operations_school_status_idx').on(
      table.tenantId,
      table.reviewSchoolId,
      table.status,
      table.updatedAt,
      table.id
    ),
    index('person_merge_operations_case_idx').on(
      table.tenantId,
      table.duplicateCaseId,
      table.createdAt,
      table.id
    ),
    check(
      'person_merge_operations_status_check',
      sql`${table.status} IN ('blocked', 'pending_approval', 'approved', 'executed', 'reversed', 'manual_recovery')`
    ),
    check(
      'person_merge_operations_people_check',
      sql`${table.sourcePersonId} <> ${table.targetPersonId}`
    ),
    check(
      'person_merge_operations_version_check',
      sql`${table.currentVersion} > 0 AND ${table.planVersion} > 0`
    ),
    check(
      'person_merge_operations_hash_check',
      sql`${table.duplicateEvidenceHash} ~ '^[0-9a-f]{64}$'
        AND ${table.previewDigest} ~ '^[0-9a-f]{64}$'
        AND (${table.executionDigest} IS NULL OR ${table.executionDigest} ~ '^[0-9a-f]{64}$')`
    ),
    check(
      'person_merge_operations_count_check',
      sql`${table.dependencyCount} >= 0 AND ${table.conflictCount} >= 0
        AND ${table.conflictCount} <= ${table.dependencyCount}
        AND ${table.invalidationCount} >= 0`
    ),
    check(
      'person_merge_operations_reason_check',
      sql`char_length(btrim(${table.initiationReason})) BETWEEN 3 AND 512
        AND (${table.approvalReason} IS NULL OR char_length(btrim(${table.approvalReason})) BETWEEN 3 AND 512)`
    ),
    check(
      'person_merge_operations_approval_check',
      sql`(${table.status} NOT IN ('approved', 'executed', 'reversed', 'manual_recovery'))
        OR (${table.approvedByAccountId} IS NOT NULL AND ${table.approvalReason} IS NOT NULL
          AND ${table.approvedAt} IS NOT NULL AND ${table.approvedByAccountId} <> ${table.initiatedByAccountId})`
    ),
    check(
      'person_merge_operations_execution_check',
      sql`${table.status} NOT IN ('executed', 'reversed', 'manual_recovery')
        OR (${table.executedByAccountId} IS NOT NULL AND ${table.executedAt} IS NOT NULL
          AND ${table.executionDigest} IS NOT NULL)`
    ),
    check(
      'person_merge_operations_reversal_check',
      sql`${table.status} <> 'reversed'
        OR (${table.reversedByAccountId} IS NOT NULL AND ${table.reversedAt} IS NOT NULL)`
    ),
    pgPolicy('person_merge_operations_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: runtimeRead(table.tenantId, table.reviewSchoolId),
    }),
    pgPolicy('person_merge_operations_runtime_write_deny', {
      for: 'all',
      to: 'openschool_runtime',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('person_merge_operations_manager_all', {
      for: 'all',
      to: 'openschool_person_merge_manager',
      using: managerAccess(table.tenantId, table.reviewSchoolId),
      withCheck: managerAccess(table.tenantId, table.reviewSchoolId),
    }),
  ]
).enableRLS()

export const personMergeAliases = pgTable(
  'person_merge_aliases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    reviewSchoolId: uuid('review_school_id').notNull(),
    operationId: uuid('operation_id').notNull(),
    sourcePersonId: uuid('source_person_id').notNull(),
    targetPersonId: uuid('target_person_id').notNull(),
    status: text('status', { enum: PERSON_MERGE_ALIAS_STATUSES }).default('active').notNull(),
    version: integer('version').default(1).notNull(),
    mergedAt: timestamp('merged_at', { withTimezone: true }).notNull(),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    reversedByAccountId: uuid('reversed_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('person_merge_aliases_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('person_merge_aliases_tenant_source_unique').on(table.tenantId, table.sourcePersonId),
    unique('person_merge_aliases_tenant_operation_unique').on(table.tenantId, table.operationId),
    foreignKey({
      name: 'person_merge_aliases_tenant_operation_fk',
      columns: [table.tenantId, table.operationId],
      foreignColumns: [personMergeOperations.tenantId, personMergeOperations.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'person_merge_aliases_tenant_school_fk',
      columns: [table.tenantId, table.reviewSchoolId],
      foreignColumns: [schools.tenantId, schools.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'person_merge_aliases_tenant_source_fk',
      columns: [table.tenantId, table.sourcePersonId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'person_merge_aliases_tenant_target_fk',
      columns: [table.tenantId, table.targetPersonId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('person_merge_aliases_target_idx').on(table.tenantId, table.targetPersonId, table.status),
    check(
      'person_merge_aliases_people_check',
      sql`${table.sourcePersonId} <> ${table.targetPersonId}`
    ),
    check('person_merge_aliases_status_check', sql`${table.status} IN ('active', 'reversed')`),
    check('person_merge_aliases_version_check', sql`${table.version} > 0`),
    check(
      'person_merge_aliases_reversal_check',
      sql`${table.status} <> 'reversed'
        OR (${table.reversedAt} IS NOT NULL AND ${table.reversedByAccountId} IS NOT NULL)`
    ),
    pgPolicy('person_merge_aliases_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: runtimeRead(table.tenantId, table.reviewSchoolId),
    }),
    pgPolicy('person_merge_aliases_runtime_write_deny', {
      for: 'all',
      to: 'openschool_runtime',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('person_merge_aliases_manager_all', {
      for: 'all',
      to: 'openschool_person_merge_manager',
      using: managerAccess(table.tenantId, table.reviewSchoolId),
      withCheck: managerAccess(table.tenantId, table.reviewSchoolId),
    }),
  ]
).enableRLS()

export const personMergeMoves = pgTable(
  'person_merge_moves',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    reviewSchoolId: uuid('review_school_id').notNull(),
    operationId: uuid('operation_id').notNull(),
    sequence: integer('sequence').notNull(),
    relationName: text('relation_name').notNull(),
    sourceRecordKey: text('source_record_key').notNull(),
    replacementRecordKey: text('replacement_record_key'),
    action: text('action', { enum: PERSON_MERGE_MOVE_ACTIONS }).notNull(),
    beforeFingerprint: text('before_fingerprint').notNull(),
    afterFingerprint: text('after_fingerprint').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('person_merge_moves_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('person_merge_moves_operation_sequence_unique').on(
      table.tenantId,
      table.operationId,
      table.sequence
    ),
    unique('person_merge_moves_operation_record_unique').on(
      table.tenantId,
      table.operationId,
      table.relationName,
      table.sourceRecordKey
    ),
    foreignKey({
      name: 'person_merge_moves_tenant_operation_fk',
      columns: [table.tenantId, table.operationId],
      foreignColumns: [personMergeOperations.tenantId, personMergeOperations.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'person_merge_moves_tenant_school_fk',
      columns: [table.tenantId, table.reviewSchoolId],
      foreignColumns: [schools.tenantId, schools.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('person_merge_moves_operation_idx').on(
      table.tenantId,
      table.operationId,
      table.sequence,
      table.id
    ),
    check('person_merge_moves_sequence_check', sql`${table.sequence} > 0`),
    check(
      'person_merge_moves_action_check',
      sql`${table.action} IN ('repoint', 'end_and_recreate', 'preserve_history', 'invalidate', 'archive_source')`
    ),
    check(
      'person_merge_moves_text_check',
      sql`char_length(${table.relationName}) BETWEEN 3 AND 128
        AND char_length(${table.sourceRecordKey}) BETWEEN 1 AND 512
        AND (${table.replacementRecordKey} IS NULL
          OR char_length(${table.replacementRecordKey}) BETWEEN 1 AND 512)`
    ),
    check(
      'person_merge_moves_hash_check',
      sql`${table.beforeFingerprint} ~ '^[0-9a-f]{64}$'
        AND ${table.afterFingerprint} ~ '^[0-9a-f]{64}$'`
    ),
    pgPolicy('person_merge_moves_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: runtimeRead(table.tenantId, table.reviewSchoolId),
    }),
    pgPolicy('person_merge_moves_runtime_write_deny', {
      for: 'all',
      to: 'openschool_runtime',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('person_merge_moves_manager_all', {
      for: 'all',
      to: 'openschool_person_merge_manager',
      using: managerAccess(table.tenantId, table.reviewSchoolId),
      withCheck: managerAccess(table.tenantId, table.reviewSchoolId),
    }),
  ]
).enableRLS()

export const personMergePreviewItems = pgTable(
  'person_merge_preview_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    reviewSchoolId: uuid('review_school_id').notNull(),
    operationId: uuid('operation_id').notNull(),
    category: text('category', { enum: PERSON_MERGE_PREVIEW_CATEGORIES }).notNull(),
    relationName: text('relation_name').notNull(),
    recordKey: text('record_key').notNull(),
    direction: text('direction', { enum: ['source', 'subject', 'related', 'actor', 'none'] })
      .default('none')
      .notNull(),
    disposition: text('disposition', { enum: PERSON_MERGE_PREVIEW_DISPOSITIONS }).notNull(),
    conflictCode: text('conflict_code'),
    rowFingerprint: text('row_fingerprint').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('person_merge_preview_items_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('person_merge_preview_items_operation_record_unique').on(
      table.tenantId,
      table.operationId,
      table.relationName,
      table.recordKey,
      table.direction
    ),
    foreignKey({
      name: 'person_merge_preview_items_tenant_operation_fk',
      columns: [table.tenantId, table.operationId],
      foreignColumns: [personMergeOperations.tenantId, personMergeOperations.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'person_merge_preview_items_tenant_school_fk',
      columns: [table.tenantId, table.reviewSchoolId],
      foreignColumns: [schools.tenantId, schools.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('person_merge_preview_items_operation_idx').on(
      table.tenantId,
      table.operationId,
      table.category,
      table.id
    ),
    check(
      'person_merge_preview_items_category_check',
      sql`${table.category} IN ('account_link', 'profile', 'affiliation', 'relationship', 'household_membership', 'school_enrollment', 'section_staff', 'section_roster', 'invitation', 'authorization_history', 'academic_history', 'duplicate_case', 'audit_history', 'compatibility_evidence')`
    ),
    check(
      'person_merge_preview_items_direction_check',
      sql`${table.direction} IN ('source', 'subject', 'related', 'actor', 'none')`
    ),
    check(
      'person_merge_preview_items_disposition_check',
      sql`${table.disposition} IN ('move', 'end_and_recreate', 'preserve_history', 'block')`
    ),
    check(
      'person_merge_preview_items_text_check',
      sql`char_length(${table.relationName}) BETWEEN 3 AND 128
        AND char_length(${table.recordKey}) BETWEEN 1 AND 512
        AND (${table.conflictCode} IS NULL OR ${table.conflictCode} ~ '^[A-Z][A-Z0-9_]{2,127}$')`
    ),
    check('person_merge_preview_items_hash_check', sql`${table.rowFingerprint} ~ '^[0-9a-f]{64}$'`),
    check(
      'person_merge_preview_items_conflict_check',
      sql`(${table.disposition} = 'block') = (${table.conflictCode} IS NOT NULL)`
    ),
    check(
      'person_merge_preview_items_metadata_check',
      sql`jsonb_typeof(${table.metadata}) = 'object'`
    ),
    pgPolicy('person_merge_preview_items_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: runtimeRead(table.tenantId, table.reviewSchoolId),
    }),
    pgPolicy('person_merge_preview_items_runtime_write_deny', {
      for: 'all',
      to: 'openschool_runtime',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('person_merge_preview_items_manager_all', {
      for: 'all',
      to: 'openschool_person_merge_manager',
      using: managerAccess(table.tenantId, table.reviewSchoolId),
      withCheck: managerAccess(table.tenantId, table.reviewSchoolId),
    }),
  ]
).enableRLS()

export const personMergeEvents = pgTable(
  'person_merge_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    reviewSchoolId: uuid('review_school_id').notNull(),
    operationId: uuid('operation_id').notNull(),
    version: integer('version').notNull(),
    eventType: text('event_type', { enum: PERSON_MERGE_EVENT_TYPES }).notNull(),
    operationStatus: text('operation_status', { enum: PERSON_MERGE_OPERATION_STATUSES }).notNull(),
    previewDigest: text('preview_digest').notNull(),
    reason: text('reason').notNull(),
    actorAccountId: uuid('actor_account_id')
      .references(() => accounts.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('person_merge_events_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('person_merge_events_operation_version_unique').on(
      table.tenantId,
      table.operationId,
      table.version
    ),
    foreignKey({
      name: 'person_merge_events_tenant_operation_fk',
      columns: [table.tenantId, table.operationId],
      foreignColumns: [personMergeOperations.tenantId, personMergeOperations.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'person_merge_events_tenant_school_fk',
      columns: [table.tenantId, table.reviewSchoolId],
      foreignColumns: [schools.tenantId, schools.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('person_merge_events_operation_idx').on(
      table.tenantId,
      table.operationId,
      table.version,
      table.id
    ),
    check('person_merge_events_version_check', sql`${table.version} > 0`),
    check(
      'person_merge_events_type_check',
      sql`${table.eventType} IN ('preview_created', 'approval_granted', 'executed', 'reversal_requested', 'reversed', 'manual_recovery_required')`
    ),
    check(
      'person_merge_events_status_check',
      sql`${table.operationStatus} IN ('blocked', 'pending_approval', 'approved', 'executed', 'reversed', 'manual_recovery')`
    ),
    check('person_merge_events_hash_check', sql`${table.previewDigest} ~ '^[0-9a-f]{64}$'`),
    check(
      'person_merge_events_reason_check',
      sql`char_length(btrim(${table.reason})) BETWEEN 3 AND 512`
    ),
    pgPolicy('person_merge_events_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: runtimeRead(table.tenantId, table.reviewSchoolId),
    }),
    pgPolicy('person_merge_events_runtime_write_deny', {
      for: 'all',
      to: 'openschool_runtime',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('person_merge_events_manager_all', {
      for: 'all',
      to: 'openschool_person_merge_manager',
      using: managerAccess(table.tenantId, table.reviewSchoolId),
      withCheck: managerAccess(table.tenantId, table.reviewSchoolId),
    }),
  ]
).enableRLS()

export type PersonMergeOperation = typeof personMergeOperations.$inferSelect
export type PersonMergePreviewItem = typeof personMergePreviewItems.$inferSelect
export type PersonMergeEvent = typeof personMergeEvents.$inferSelect
export type PersonMergeAlias = typeof personMergeAliases.$inferSelect
export type PersonMergeMove = typeof personMergeMoves.$inferSelect
