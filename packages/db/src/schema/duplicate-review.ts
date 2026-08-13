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
  uuid,
} from 'drizzle-orm/pg-core'
import { accounts, people } from './identity'
import { schools } from './schools'
import { tenants } from './tenancy'

export type PersonDuplicateSignal =
  | 'same_normalized_email'
  | 'same_normalized_name'
  | 'same_date_of_birth'
  | 'same_normalized_phone'

const managerSchoolAccess = (tenantId: SQLWrapper, schoolId: SQLWrapper) => sql`
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_duplicate_review_manager'
  AND ${tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.students.create',
    'tenant.students.update',
    'tenant.guardian_contacts.manage',
    'tenant.people_duplicates.review'
  )
  AND public.openschool_school_scope_allows(${tenantId}, ${schoolId})
`

const runtimeRead = (tenantId: SQLWrapper, schoolId: SQLWrapper) => sql`
  ${tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') IN (
    'tenant.people_duplicates.read',
    'tenant.people_duplicates.review'
  )
  AND public.openschool_school_scope_allows(${tenantId}, ${schoolId})
`

export const personDuplicateCases = pgTable(
  'person_duplicate_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    reviewSchoolId: uuid('review_school_id').notNull(),
    firstPersonId: uuid('first_person_id').notNull(),
    secondPersonId: uuid('second_person_id').notNull(),
    status: text('status', {
      enum: ['open', 'distinct', 'merge_approval_requested', 'superseded'],
    })
      .default('open')
      .notNull(),
    currentVersion: integer('current_version').default(1).notNull(),
    currentScore: integer('current_score').notNull(),
    currentSignals: jsonb('current_signals').$type<readonly PersonDuplicateSignal[]>().notNull(),
    currentEvidenceHash: text('current_evidence_hash').notNull(),
    createdByAccountId: uuid('created_by_account_id')
      .references(() => accounts.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('person_duplicate_cases_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('person_duplicate_cases_school_pair_unique').on(
      table.tenantId,
      table.reviewSchoolId,
      table.firstPersonId,
      table.secondPersonId
    ),
    foreignKey({
      name: 'person_duplicate_cases_tenant_school_fk',
      columns: [table.tenantId, table.reviewSchoolId],
      foreignColumns: [schools.tenantId, schools.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'person_duplicate_cases_tenant_first_person_fk',
      columns: [table.tenantId, table.firstPersonId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'person_duplicate_cases_tenant_second_person_fk',
      columns: [table.tenantId, table.secondPersonId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('person_duplicate_cases_queue_idx').on(
      table.tenantId,
      table.reviewSchoolId,
      table.status,
      table.updatedAt,
      table.id
    ),
    index('person_duplicate_cases_first_person_idx').on(
      table.tenantId,
      table.firstPersonId,
      table.reviewSchoolId,
      table.id
    ),
    index('person_duplicate_cases_second_person_idx').on(
      table.tenantId,
      table.secondPersonId,
      table.reviewSchoolId,
      table.id
    ),
    check(
      'person_duplicate_cases_pair_order_check',
      sql`${table.firstPersonId}::text < ${table.secondPersonId}::text`
    ),
    check(
      'person_duplicate_cases_status_check',
      sql`${table.status} IN ('open', 'distinct', 'merge_approval_requested', 'superseded')`
    ),
    check('person_duplicate_cases_version_check', sql`${table.currentVersion} > 0`),
    check('person_duplicate_cases_score_check', sql`${table.currentScore} BETWEEN 0 AND 100`),
    check(
      'person_duplicate_cases_signals_check',
      sql`jsonb_typeof(${table.currentSignals}) = 'array' AND jsonb_array_length(${table.currentSignals}) <= 4`
    ),
    check(
      'person_duplicate_cases_hash_check',
      sql`${table.currentEvidenceHash} ~ '^[0-9a-f]{64}$'`
    ),
    pgPolicy('person_duplicate_cases_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: runtimeRead(table.tenantId, table.reviewSchoolId),
    }),
    pgPolicy('person_duplicate_cases_runtime_write_deny', {
      for: 'all',
      to: 'openschool_runtime',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('person_duplicate_cases_manager_all', {
      for: 'all',
      to: 'openschool_duplicate_review_manager',
      using: managerSchoolAccess(table.tenantId, table.reviewSchoolId),
      withCheck: managerSchoolAccess(table.tenantId, table.reviewSchoolId),
    }),
  ]
).enableRLS()

export const personDuplicateCaseEvents = pgTable(
  'person_duplicate_case_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    reviewSchoolId: uuid('review_school_id').notNull(),
    caseId: uuid('case_id').notNull(),
    version: integer('version').notNull(),
    eventType: text('event_type', {
      enum: [
        'candidate_detected',
        'evidence_refreshed',
        'evidence_no_longer_matches',
        'marked_distinct',
        'merge_approval_requested',
      ],
    }).notNull(),
    score: integer('score').notNull(),
    signals: jsonb('signals').$type<readonly PersonDuplicateSignal[]>().notNull(),
    evidenceHash: text('evidence_hash').notNull(),
    reason: text('reason').notNull(),
    actorAccountId: uuid('actor_account_id')
      .references(() => accounts.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('person_duplicate_case_events_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('person_duplicate_case_events_case_version_unique').on(
      table.tenantId,
      table.caseId,
      table.version
    ),
    foreignKey({
      name: 'person_duplicate_case_events_tenant_case_fk',
      columns: [table.tenantId, table.caseId],
      foreignColumns: [personDuplicateCases.tenantId, personDuplicateCases.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'person_duplicate_case_events_tenant_school_fk',
      columns: [table.tenantId, table.reviewSchoolId],
      foreignColumns: [schools.tenantId, schools.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('person_duplicate_case_events_history_idx').on(
      table.tenantId,
      table.caseId,
      table.version,
      table.id
    ),
    check('person_duplicate_case_events_version_check', sql`${table.version} > 0`),
    check(
      'person_duplicate_case_events_type_check',
      sql`${table.eventType} IN ('candidate_detected', 'evidence_refreshed', 'evidence_no_longer_matches', 'marked_distinct', 'merge_approval_requested')`
    ),
    check('person_duplicate_case_events_score_check', sql`${table.score} BETWEEN 0 AND 100`),
    check(
      'person_duplicate_case_events_signals_check',
      sql`jsonb_typeof(${table.signals}) = 'array' AND jsonb_array_length(${table.signals}) <= 4`
    ),
    check('person_duplicate_case_events_hash_check', sql`${table.evidenceHash} ~ '^[0-9a-f]{64}$'`),
    check(
      'person_duplicate_case_events_reason_check',
      sql`char_length(btrim(${table.reason})) BETWEEN 3 AND 512`
    ),
    pgPolicy('person_duplicate_case_events_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: runtimeRead(table.tenantId, table.reviewSchoolId),
    }),
    pgPolicy('person_duplicate_case_events_runtime_write_deny', {
      for: 'all',
      to: 'openschool_runtime',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('person_duplicate_case_events_manager_select', {
      for: 'select',
      to: 'openschool_duplicate_review_manager',
      using: managerSchoolAccess(table.tenantId, table.reviewSchoolId),
    }),
    pgPolicy('person_duplicate_case_events_manager_insert', {
      for: 'insert',
      to: 'openschool_duplicate_review_manager',
      withCheck: managerSchoolAccess(table.tenantId, table.reviewSchoolId),
    }),
  ]
).enableRLS()

export type PersonDuplicateCase = typeof personDuplicateCases.$inferSelect
export type PersonDuplicateCaseEvent = typeof personDuplicateCaseEvents.$inferSelect
