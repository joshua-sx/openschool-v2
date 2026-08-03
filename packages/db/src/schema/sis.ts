import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { accounts, affiliations, people } from './identity'
import { schools } from './schools'
import { students } from './student'
import { STUDENT_ADMITTER_CAPABILITIES } from './student-policy-capabilities'
import { tenants } from './tenancy'

const STUDENT_READ_CAPABILITIES = sql`
  'tenant.students.read', 'tenant.students.update',
  'tenant.students.delete', 'support.students.read'
`

export const schoolEnrollments = pgTable(
  'school_enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    personId: uuid('person_id').notNull(),
    schoolId: uuid('school_id').notNull(),
    studentAffiliationId: uuid('student_affiliation_id').notNull(),
    legacyStudentId: uuid('legacy_student_id'),
    enrollmentType: text('enrollment_type', { enum: ['primary', 'secondary'] })
      .default('primary')
      .notNull(),
    status: text('status', { enum: ['enrolled', 'withdrawn', 'graduated', 'cancelled'] })
      .default('enrolled')
      .notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    admissionReason: text('admission_reason').notNull(),
    source: text('source', { enum: ['legacy_backfill', 'native'] })
      .default('native')
      .notNull(),
    createdByAccountId: uuid('created_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('school_enrollments_tenant_id_id_unique').on(table.tenantId, table.id),
    foreignKey({
      name: 'school_enrollments_tenant_person_fk',
      columns: [table.tenantId, table.personId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'school_enrollments_tenant_school_fk',
      columns: [table.tenantId, table.schoolId],
      foreignColumns: [schools.tenantId, schools.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'school_enrollments_tenant_affiliation_fk',
      columns: [table.tenantId, table.studentAffiliationId],
      foreignColumns: [affiliations.tenantId, affiliations.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'school_enrollments_tenant_legacy_student_fk',
      columns: [table.tenantId, table.legacyStudentId],
      foreignColumns: [students.tenantId, students.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('school_enrollments_tenant_school_current_idx').on(
      table.tenantId,
      table.schoolId,
      table.status,
      table.validFrom,
      table.validUntil,
      table.personId
    ),
    index('school_enrollments_tenant_person_history_idx').on(
      table.tenantId,
      table.personId,
      table.validFrom,
      table.id
    ),
    check(
      'school_enrollments_type_check',
      sql`${table.enrollmentType} IN ('primary', 'secondary')`
    ),
    check(
      'school_enrollments_status_check',
      sql`${table.status} IN ('enrolled', 'withdrawn', 'graduated', 'cancelled')`
    ),
    check('school_enrollments_source_check', sql`${table.source} IN ('legacy_backfill', 'native')`),
    check(
      'school_enrollments_valid_period_check',
      sql`${table.validUntil} IS NULL OR ${table.validUntil} > ${table.validFrom}`
    ),
    check(
      'school_enrollments_closed_status_check',
      sql`${table.status} = 'enrolled' OR ${table.validUntil} IS NOT NULL`
    ),
    check(
      'school_enrollments_legacy_source_check',
      sql`${table.source} <> 'legacy_backfill' OR ${table.legacyStudentId} IS NOT NULL`
    ),
    pgPolicy('school_enrollments_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') IN (
          ${STUDENT_READ_CAPABILITIES}
        )
        AND public.openschool_canonical_student_scope_allows(
          ${table.tenantId}, ${table.schoolId}, ${table.personId}
        )
      `,
    }),
    pgPolicy('school_enrollments_runtime_insert_deny', {
      for: 'insert',
      to: 'openschool_runtime',
      withCheck: sql`false`,
    }),
    pgPolicy('school_enrollments_runtime_update_deny', {
      for: 'update',
      to: 'openschool_runtime',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('school_enrollments_runtime_delete_deny', {
      for: 'delete',
      to: 'openschool_runtime',
      using: sql`false`,
    }),
    pgPolicy('school_enrollments_admitter_select', {
      for: 'select',
      to: 'openschool_student_admitter',
      using: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN (${STUDENT_ADMITTER_CAPABILITIES})
        AND public.openschool_canonical_student_scope_allows(
          ${table.tenantId}, ${table.schoolId}, ${table.personId}
        )
      `,
    }),
    pgPolicy('school_enrollments_admitter_insert', {
      for: 'insert',
      to: 'openschool_student_admitter',
      withCheck: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.students.create'
        AND public.openschool_school_scope_allows(${table.tenantId}, ${table.schoolId})
      `,
    }),
    pgPolicy('school_enrollments_admitter_update', {
      for: 'update',
      to: 'openschool_student_admitter',
      using: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.students.update'
        AND public.openschool_canonical_student_scope_allows(
          ${table.tenantId}, ${table.schoolId}, ${table.personId}
        )
      `,
      withCheck: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.students.update'
        AND public.openschool_canonical_student_scope_allows(
          ${table.tenantId}, ${table.schoolId}, ${table.personId}
        )
      `,
    }),
    pgPolicy('school_enrollments_admitter_delete_deny', {
      for: 'delete',
      to: 'openschool_student_admitter',
      using: sql`false`,
    }),
  ]
).enableRLS()

export const studentCompatibilityEvidence = pgTable(
  'student_compatibility_evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    personId: uuid('person_id').notNull(),
    schoolId: uuid('school_id').notNull(),
    schoolEnrollmentId: uuid('school_enrollment_id').notNull(),
    studentAffiliationId: uuid('student_affiliation_id').notNull(),
    legacyStudentId: uuid('legacy_student_id').notNull(),
    operation: text('operation', { enum: ['backfill', 'create', 'update'] }).notNull(),
    parityStatus: text('parity_status', { enum: ['matched', 'mismatch'] }).notNull(),
    canonicalSnapshot: jsonb('canonical_snapshot').default({}).notNull(),
    legacySnapshot: jsonb('legacy_snapshot').default({}).notNull(),
    requestId: text('request_id').notNull(),
    recordedByAccountId: uuid('recorded_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('student_compatibility_evidence_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('student_compatibility_evidence_request_unique').on(
      table.tenantId,
      table.personId,
      table.requestId,
      table.operation
    ),
    foreignKey({
      name: 'student_compatibility_evidence_tenant_person_fk',
      columns: [table.tenantId, table.personId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'student_compatibility_evidence_tenant_school_fk',
      columns: [table.tenantId, table.schoolId],
      foreignColumns: [schools.tenantId, schools.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'student_compatibility_evidence_tenant_enrollment_fk',
      columns: [table.tenantId, table.schoolEnrollmentId],
      foreignColumns: [schoolEnrollments.tenantId, schoolEnrollments.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'student_compatibility_evidence_tenant_affiliation_fk',
      columns: [table.tenantId, table.studentAffiliationId],
      foreignColumns: [affiliations.tenantId, affiliations.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'student_compatibility_evidence_tenant_legacy_student_fk',
      columns: [table.tenantId, table.legacyStudentId],
      foreignColumns: [students.tenantId, students.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('student_compatibility_evidence_tenant_person_idx').on(
      table.tenantId,
      table.personId,
      table.recordedAt,
      table.id
    ),
    check(
      'student_compatibility_evidence_operation_check',
      sql`${table.operation} IN ('backfill', 'create', 'update')`
    ),
    check(
      'student_compatibility_evidence_parity_check',
      sql`${table.parityStatus} IN ('matched', 'mismatch')`
    ),
    check('student_compatibility_evidence_request_check', sql`btrim(${table.requestId}) <> ''`),
    pgPolicy('student_compatibility_evidence_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') IN (
          ${STUDENT_READ_CAPABILITIES}
        )
        AND public.openschool_canonical_student_scope_allows(
          ${table.tenantId}, ${table.schoolId}, ${table.personId}
        )
      `,
    }),
    pgPolicy('student_compatibility_evidence_runtime_insert_deny', {
      for: 'insert',
      to: 'openschool_runtime',
      withCheck: sql`false`,
    }),
    pgPolicy('student_compatibility_evidence_runtime_update_deny', {
      for: 'update',
      to: 'openschool_runtime',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('student_compatibility_evidence_runtime_delete_deny', {
      for: 'delete',
      to: 'openschool_runtime',
      using: sql`false`,
    }),
    pgPolicy('student_compatibility_evidence_admitter_select', {
      for: 'select',
      to: 'openschool_student_admitter',
      using: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN (${STUDENT_ADMITTER_CAPABILITIES})
        AND public.openschool_canonical_student_scope_allows(
          ${table.tenantId}, ${table.schoolId}, ${table.personId}
        )
      `,
    }),
    pgPolicy('student_compatibility_evidence_admitter_insert', {
      for: 'insert',
      to: 'openschool_student_admitter',
      withCheck: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN (${STUDENT_ADMITTER_CAPABILITIES})
        AND public.openschool_canonical_student_scope_allows(
          ${table.tenantId}, ${table.schoolId}, ${table.personId}
        )
      `,
    }),
    pgPolicy('student_compatibility_evidence_admitter_update_deny', {
      for: 'update',
      to: 'openschool_student_admitter',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('student_compatibility_evidence_admitter_delete_deny', {
      for: 'delete',
      to: 'openschool_student_admitter',
      using: sql`false`,
    }),
  ]
).enableRLS()

export type SchoolEnrollment = typeof schoolEnrollments.$inferSelect
export type NewSchoolEnrollment = typeof schoolEnrollments.$inferInsert
export type StudentCompatibilityEvidence = typeof studentCompatibilityEvidence.$inferSelect
