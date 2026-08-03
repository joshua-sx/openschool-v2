import { type SQLWrapper, sql } from 'drizzle-orm'
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { accounts } from './identity'
import { schools } from './schools'
import { tenants } from './tenancy'

const ACADEMIC_READ_CAPABILITIES = sql`
  'tenant.academic_structure.read', 'tenant.academic_structure.manage'
`

const runtimeAcademicSelect = (tenantId: SQLWrapper, schoolId: SQLWrapper) => sql`
  ${tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    IN (${ACADEMIC_READ_CAPABILITIES})
  AND public.openschool_school_scope_allows(${tenantId}, ${schoolId})
`

const configuratorAcademicAccess = (tenantId: SQLWrapper, schoolId: SQLWrapper) => sql`
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_academic_configurator'
  AND ${tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    = 'tenant.academic_structure.manage'
  AND public.openschool_school_scope_allows(${tenantId}, ${schoolId})
`

export const academicYears = pgTable(
  'academic_years',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    schoolId: uuid('school_id').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    timeZone: text('time_zone').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    status: text('status', { enum: ['draft', 'published', 'closed'] })
      .default('draft')
      .notNull(),
    source: text('source', { enum: ['native', 'legacy_backfill'] })
      .default('native')
      .notNull(),
    migrationReviewStatus: text('migration_review_status', {
      enum: ['not_required', 'needs_review', 'approved'],
    })
      .default('not_required')
      .notNull(),
    legacyAcademicYear: text('legacy_academic_year'),
    createdByAccountId: uuid('created_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    publishedByAccountId: uuid('published_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    closedByAccountId: uuid('closed_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closureReason: text('closure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('academic_years_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('academic_years_tenant_school_id_id_unique').on(
      table.tenantId,
      table.schoolId,
      table.id
    ),
    unique('academic_years_tenant_school_code_unique').on(
      table.tenantId,
      table.schoolId,
      table.code
    ),
    foreignKey({
      name: 'academic_years_tenant_school_fk',
      columns: [table.tenantId, table.schoolId],
      foreignColumns: [schools.tenantId, schools.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('academic_years_tenant_school_status_dates_idx').on(
      table.tenantId,
      table.schoolId,
      table.status,
      table.startDate,
      table.endDate,
      table.id
    ),
    check(
      'academic_years_code_check',
      sql`char_length(btrim(${table.code})) BETWEEN 1 AND 64 AND ${table.code} ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'`
    ),
    check('academic_years_name_check', sql`char_length(btrim(${table.name})) BETWEEN 1 AND 128`),
    check(
      'academic_years_timezone_check',
      sql`char_length(btrim(${table.timeZone})) BETWEEN 1 AND 128`
    ),
    check('academic_years_dates_check', sql`${table.endDate} >= ${table.startDate}`),
    check('academic_years_status_check', sql`${table.status} IN ('draft', 'published', 'closed')`),
    check('academic_years_source_check', sql`${table.source} IN ('native', 'legacy_backfill')`),
    check(
      'academic_years_review_check',
      sql`${table.migrationReviewStatus} IN ('not_required', 'needs_review', 'approved')`
    ),
    check(
      'academic_years_review_source_check',
      sql`${table.source} = 'legacy_backfill' OR ${table.migrationReviewStatus} = 'not_required'`
    ),
    check(
      'academic_years_publish_evidence_check',
      sql`${table.status} = 'draft' OR (${table.publishedAt} IS NOT NULL AND ${table.publishedByAccountId} IS NOT NULL)`
    ),
    check(
      'academic_years_close_evidence_check',
      sql`${table.status} <> 'closed' OR (${table.closedAt} IS NOT NULL AND ${table.closedByAccountId} IS NOT NULL AND char_length(btrim(${table.closureReason})) BETWEEN 3 AND 512)`
    ),
    pgPolicy('academic_years_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: runtimeAcademicSelect(table.tenantId, table.schoolId),
    }),
    pgPolicy('academic_years_runtime_insert_deny', {
      for: 'insert',
      to: 'openschool_runtime',
      withCheck: sql`false`,
    }),
    pgPolicy('academic_years_runtime_update_deny', {
      for: 'update',
      to: 'openschool_runtime',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('academic_years_runtime_delete_deny', {
      for: 'delete',
      to: 'openschool_runtime',
      using: sql`false`,
    }),
    pgPolicy('academic_years_configurator_select', {
      for: 'select',
      to: 'openschool_academic_configurator',
      using: configuratorAcademicAccess(table.tenantId, table.schoolId),
    }),
    pgPolicy('academic_years_configurator_insert', {
      for: 'insert',
      to: 'openschool_academic_configurator',
      withCheck: configuratorAcademicAccess(table.tenantId, table.schoolId),
    }),
    pgPolicy('academic_years_configurator_update', {
      for: 'update',
      to: 'openschool_academic_configurator',
      using: configuratorAcademicAccess(table.tenantId, table.schoolId),
      withCheck: configuratorAcademicAccess(table.tenantId, table.schoolId),
    }),
    pgPolicy('academic_years_configurator_delete_deny', {
      for: 'delete',
      to: 'openschool_academic_configurator',
      using: sql`false`,
    }),
  ]
).enableRLS()

export const academicTerms = pgTable(
  'academic_terms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    schoolId: uuid('school_id').notNull(),
    academicYearId: uuid('academic_year_id').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    ordinal: integer('ordinal').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('academic_terms_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('academic_terms_tenant_school_id_id_unique').on(
      table.tenantId,
      table.schoolId,
      table.id
    ),
    unique('academic_terms_year_code_unique').on(table.tenantId, table.academicYearId, table.code),
    unique('academic_terms_year_ordinal_unique').on(
      table.tenantId,
      table.academicYearId,
      table.ordinal
    ),
    foreignKey({
      name: 'academic_terms_tenant_school_year_fk',
      columns: [table.tenantId, table.schoolId, table.academicYearId],
      foreignColumns: [academicYears.tenantId, academicYears.schoolId, academicYears.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('academic_terms_year_dates_idx').on(
      table.tenantId,
      table.academicYearId,
      table.startDate,
      table.endDate,
      table.id
    ),
    check(
      'academic_terms_code_check',
      sql`char_length(btrim(${table.code})) BETWEEN 1 AND 64 AND ${table.code} ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'`
    ),
    check('academic_terms_name_check', sql`char_length(btrim(${table.name})) BETWEEN 1 AND 128`),
    check('academic_terms_ordinal_check', sql`${table.ordinal} BETWEEN 1 AND 20`),
    check('academic_terms_dates_check', sql`${table.endDate} >= ${table.startDate}`),
    pgPolicy('academic_terms_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: runtimeAcademicSelect(table.tenantId, table.schoolId),
    }),
    pgPolicy('academic_terms_runtime_insert_deny', {
      for: 'insert',
      to: 'openschool_runtime',
      withCheck: sql`false`,
    }),
    pgPolicy('academic_terms_runtime_update_deny', {
      for: 'update',
      to: 'openschool_runtime',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('academic_terms_runtime_delete_deny', {
      for: 'delete',
      to: 'openschool_runtime',
      using: sql`false`,
    }),
    pgPolicy('academic_terms_configurator_select', {
      for: 'select',
      to: 'openschool_academic_configurator',
      using: configuratorAcademicAccess(table.tenantId, table.schoolId),
    }),
    pgPolicy('academic_terms_configurator_insert', {
      for: 'insert',
      to: 'openschool_academic_configurator',
      withCheck: configuratorAcademicAccess(table.tenantId, table.schoolId),
    }),
    pgPolicy('academic_terms_configurator_update_deny', {
      for: 'update',
      to: 'openschool_academic_configurator',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('academic_terms_configurator_delete_deny', {
      for: 'delete',
      to: 'openschool_academic_configurator',
      using: sql`false`,
    }),
  ]
).enableRLS()

export const learnerLevels = pgTable(
  'learner_levels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    schoolId: uuid('school_id').notNull(),
    academicYearId: uuid('academic_year_id').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    ordinal: integer('ordinal').notNull(),
    educationStage: text('education_stage'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('learner_levels_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('learner_levels_tenant_school_id_id_unique').on(
      table.tenantId,
      table.schoolId,
      table.id
    ),
    unique('learner_levels_year_code_unique').on(table.tenantId, table.academicYearId, table.code),
    unique('learner_levels_year_ordinal_unique').on(
      table.tenantId,
      table.academicYearId,
      table.ordinal
    ),
    foreignKey({
      name: 'learner_levels_tenant_school_year_fk',
      columns: [table.tenantId, table.schoolId, table.academicYearId],
      foreignColumns: [academicYears.tenantId, academicYears.schoolId, academicYears.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('learner_levels_year_order_idx').on(
      table.tenantId,
      table.academicYearId,
      table.ordinal,
      table.id
    ),
    check(
      'learner_levels_code_check',
      sql`char_length(btrim(${table.code})) BETWEEN 1 AND 64 AND ${table.code} ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'`
    ),
    check('learner_levels_name_check', sql`char_length(btrim(${table.name})) BETWEEN 1 AND 128`),
    check('learner_levels_ordinal_check', sql`${table.ordinal} BETWEEN 1 AND 30`),
    check(
      'learner_levels_stage_check',
      sql`${table.educationStage} IS NULL OR char_length(btrim(${table.educationStage})) BETWEEN 1 AND 64`
    ),
    pgPolicy('learner_levels_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: runtimeAcademicSelect(table.tenantId, table.schoolId),
    }),
    pgPolicy('learner_levels_runtime_insert_deny', {
      for: 'insert',
      to: 'openschool_runtime',
      withCheck: sql`false`,
    }),
    pgPolicy('learner_levels_runtime_update_deny', {
      for: 'update',
      to: 'openschool_runtime',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('learner_levels_runtime_delete_deny', {
      for: 'delete',
      to: 'openschool_runtime',
      using: sql`false`,
    }),
    pgPolicy('learner_levels_configurator_select', {
      for: 'select',
      to: 'openschool_academic_configurator',
      using: configuratorAcademicAccess(table.tenantId, table.schoolId),
    }),
    pgPolicy('learner_levels_configurator_insert', {
      for: 'insert',
      to: 'openschool_academic_configurator',
      withCheck: configuratorAcademicAccess(table.tenantId, table.schoolId),
    }),
    pgPolicy('learner_levels_configurator_update_deny', {
      for: 'update',
      to: 'openschool_academic_configurator',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('learner_levels_configurator_delete_deny', {
      for: 'delete',
      to: 'openschool_academic_configurator',
      using: sql`false`,
    }),
  ]
).enableRLS()

export const academicCompatibilityEvidence = pgTable(
  'academic_compatibility_evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    schoolId: uuid('school_id').notNull(),
    sourceType: text('source_type', {
      enum: ['school_academic_year', 'school_term', 'class_academic_year'],
    }).notNull(),
    sourceKey: text('source_key').notNull(),
    legacyValue: jsonb('legacy_value').notNull(),
    mappingStatus: text('mapping_status', {
      enum: ['mapped', 'unmapped', 'review_required'],
    }).notNull(),
    reason: text('reason').notNull(),
    academicYearId: uuid('academic_year_id'),
    academicTermId: uuid('academic_term_id'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('academic_compatibility_evidence_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('academic_compatibility_evidence_source_unique').on(
      table.tenantId,
      table.sourceType,
      table.sourceKey
    ),
    foreignKey({
      name: 'academic_compatibility_evidence_tenant_school_fk',
      columns: [table.tenantId, table.schoolId],
      foreignColumns: [schools.tenantId, schools.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'academic_compatibility_evidence_tenant_year_fk',
      columns: [table.tenantId, table.academicYearId],
      foreignColumns: [academicYears.tenantId, academicYears.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'academic_compatibility_evidence_tenant_term_fk',
      columns: [table.tenantId, table.academicTermId],
      foreignColumns: [academicTerms.tenantId, academicTerms.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('academic_compatibility_evidence_tenant_school_idx').on(
      table.tenantId,
      table.schoolId,
      table.mappingStatus,
      table.sourceType,
      table.id
    ),
    check(
      'academic_compatibility_evidence_source_type_check',
      sql`${table.sourceType} IN ('school_academic_year', 'school_term', 'class_academic_year')`
    ),
    check(
      'academic_compatibility_evidence_mapping_status_check',
      sql`${table.mappingStatus} IN ('mapped', 'unmapped', 'review_required')`
    ),
    check(
      'academic_compatibility_evidence_source_key_check',
      sql`char_length(btrim(${table.sourceKey})) BETWEEN 1 AND 256`
    ),
    check(
      'academic_compatibility_evidence_reason_check',
      sql`char_length(btrim(${table.reason})) BETWEEN 3 AND 512`
    ),
    check(
      'academic_compatibility_evidence_mapping_check',
      sql`${table.mappingStatus} <> 'mapped' OR ${table.academicYearId} IS NOT NULL`
    ),
    pgPolicy('academic_compatibility_evidence_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: runtimeAcademicSelect(table.tenantId, table.schoolId),
    }),
    pgPolicy('academic_compatibility_evidence_runtime_insert_deny', {
      for: 'insert',
      to: 'openschool_runtime',
      withCheck: sql`false`,
    }),
    pgPolicy('academic_compatibility_evidence_runtime_update_deny', {
      for: 'update',
      to: 'openschool_runtime',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('academic_compatibility_evidence_runtime_delete_deny', {
      for: 'delete',
      to: 'openschool_runtime',
      using: sql`false`,
    }),
  ]
).enableRLS()

export type AcademicYear = typeof academicYears.$inferSelect
export type AcademicTerm = typeof academicTerms.$inferSelect
export type LearnerLevel = typeof learnerLevels.$inferSelect
export type AcademicCompatibilityEvidence = typeof academicCompatibilityEvidence.$inferSelect
