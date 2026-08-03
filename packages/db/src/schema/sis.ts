import { sql } from 'drizzle-orm'
import {
  bigint,
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
import { organizationTreeVersions } from './education-organizations'
import { accounts, affiliations, people } from './identity'
import { schools } from './schools'
import { students } from './student'
import { STUDENT_ADMITTER_CAPABILITIES } from './student-policy-capabilities'
import { tenants } from './tenancy'

const STUDENT_READ_CAPABILITIES = sql`
  'tenant.students.read', 'tenant.students.update',
  'tenant.students.delete', 'support.students.read',
  'tenant.student_enrollments.read', 'tenant.student_enrollments.manage'
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
    endReason: text('end_reason', {
      enum: ['withdrawal', 'transfer', 'graduation', 'secondary_ended', 'correction'],
    }),
    endEvidenceReference: text('end_evidence_reference'),
    endedByAccountId: uuid('ended_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    supersedesEnrollmentId: uuid('supersedes_enrollment_id'),
    organizationTreeVersionId: uuid('organization_tree_version_id'),
    version: bigint('version', { mode: 'number' }).default(1).notNull(),
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
    unique('school_enrollments_transition_reference_unique').on(
      table.tenantId,
      table.id,
      table.personId,
      table.schoolId
    ),
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
    foreignKey({
      name: 'school_enrollments_tenant_supersedes_fk',
      columns: [table.tenantId, table.supersedesEnrollmentId],
      foreignColumns: [table.tenantId, table.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'school_enrollments_tenant_tree_version_fk',
      columns: [table.tenantId, table.organizationTreeVersionId],
      foreignColumns: [organizationTreeVersions.tenantId, organizationTreeVersions.id],
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
    check(
      'school_enrollments_native_tree_version_check',
      sql`${table.source} = 'legacy_backfill' OR ${table.organizationTreeVersionId} IS NOT NULL`
    ),
    check('school_enrollments_version_positive', sql`${table.version} > 0`),
    check(
      'school_enrollments_end_evidence_check',
      sql`(${table.validUntil} IS NULL AND ${table.endReason} IS NULL AND ${table.endedByAccountId} IS NULL AND ${table.endedAt} IS NULL)
        OR (${table.validUntil} IS NOT NULL AND ${table.endReason} IS NOT NULL AND ${table.endedAt} IS NOT NULL)`
    ),
    check(
      'school_enrollments_end_reason_check',
      sql`${table.endReason} IS NULL OR ${table.endReason} IN ('withdrawal', 'transfer', 'graduation', 'secondary_ended', 'correction')`
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
          IN ('tenant.students.create', 'tenant.student_enrollments.manage')
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
          = 'tenant.student_enrollments.manage'
        AND public.openschool_canonical_student_scope_allows(
          ${table.tenantId}, ${table.schoolId}, ${table.personId}
        )
      `,
      withCheck: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.student_enrollments.manage'
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

export const schoolEnrollmentTransitionEvents = pgTable(
  'school_enrollment_transition_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    transitionId: uuid('transition_id').notNull(),
    personId: uuid('person_id').notNull(),
    fromEnrollmentId: uuid('from_enrollment_id'),
    toEnrollmentId: uuid('to_enrollment_id'),
    sourceSchoolId: uuid('source_school_id'),
    destinationSchoolId: uuid('destination_school_id'),
    eventType: text('event_type', { enum: ['scheduled', 'applied', 'cancelled'] }).notNull(),
    transitionType: text('transition_type', {
      enum: ['withdraw', 'transfer', 'graduate', 'reenroll', 'add_secondary', 'end_secondary'],
    }).notNull(),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
    reason: text('reason').notNull(),
    evidenceReference: text('evidence_reference'),
    expectedEnrollmentVersion: bigint('expected_enrollment_version', { mode: 'number' }),
    organizationTreeVersionId: uuid('organization_tree_version_id').notNull(),
    authorizationVersionEvidence: jsonb('authorization_version_evidence').default([]).notNull(),
    actorAccountId: uuid('actor_account_id')
      .references(() => accounts.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    requestId: text('request_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('school_enrollment_transition_events_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('school_enrollment_transition_events_kind_unique').on(
      table.tenantId,
      table.transitionId,
      table.eventType
    ),
    unique('school_enrollment_transition_events_request_unique').on(
      table.tenantId,
      table.requestId,
      table.eventType
    ),
    foreignKey({
      name: 'school_enrollment_transition_events_tenant_person_fk',
      columns: [table.tenantId, table.personId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'school_enrollment_transition_events_tenant_from_fk',
      columns: [table.tenantId, table.fromEnrollmentId, table.personId, table.sourceSchoolId],
      foreignColumns: [
        schoolEnrollments.tenantId,
        schoolEnrollments.id,
        schoolEnrollments.personId,
        schoolEnrollments.schoolId,
      ],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'school_enrollment_transition_events_tenant_to_fk',
      columns: [table.tenantId, table.toEnrollmentId, table.personId, table.destinationSchoolId],
      foreignColumns: [
        schoolEnrollments.tenantId,
        schoolEnrollments.id,
        schoolEnrollments.personId,
        schoolEnrollments.schoolId,
      ],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'school_enrollment_transition_events_tenant_source_school_fk',
      columns: [table.tenantId, table.sourceSchoolId],
      foreignColumns: [schools.tenantId, schools.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'school_enrollment_transition_events_tenant_destination_school_fk',
      columns: [table.tenantId, table.destinationSchoolId],
      foreignColumns: [schools.tenantId, schools.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'school_enrollment_transition_events_tenant_tree_version_fk',
      columns: [table.tenantId, table.organizationTreeVersionId],
      foreignColumns: [organizationTreeVersions.tenantId, organizationTreeVersions.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('school_enrollment_transition_events_timeline_idx').on(
      table.tenantId,
      table.personId,
      table.effectiveAt,
      table.occurredAt,
      table.id
    ),
    index('school_enrollment_transition_events_due_idx').on(
      table.tenantId,
      table.eventType,
      table.effectiveAt,
      table.transitionId
    ),
    check(
      'school_enrollment_transition_events_event_check',
      sql`${table.eventType} IN ('scheduled', 'applied', 'cancelled')`
    ),
    check(
      'school_enrollment_transition_events_transition_check',
      sql`${table.transitionType} IN ('withdraw', 'transfer', 'graduate', 'reenroll', 'add_secondary', 'end_secondary')`
    ),
    check(
      'school_enrollment_transition_events_reason_check',
      sql`char_length(btrim(${table.reason})) BETWEEN 3 AND 512`
    ),
    check(
      'school_enrollment_transition_events_evidence_check',
      sql`${table.evidenceReference} IS NULL OR char_length(btrim(${table.evidenceReference})) BETWEEN 3 AND 512`
    ),
    check(
      'school_enrollment_transition_events_expected_version_check',
      sql`${table.expectedEnrollmentVersion} IS NULL OR ${table.expectedEnrollmentVersion} > 0`
    ),
    check(
      'school_enrollment_transition_events_shape_check',
      sql`(
          ${table.transitionType} IN ('withdraw', 'graduate', 'end_secondary')
          AND ${table.fromEnrollmentId} IS NOT NULL
          AND ${table.sourceSchoolId} IS NOT NULL
          AND ${table.destinationSchoolId} IS NULL
          AND ${table.toEnrollmentId} IS NULL
        ) OR (
          ${table.transitionType} = 'transfer'
          AND ${table.fromEnrollmentId} IS NOT NULL
          AND ${table.sourceSchoolId} IS NOT NULL
          AND ${table.destinationSchoolId} IS NOT NULL
          AND (
            (${table.eventType} = 'applied' AND ${table.toEnrollmentId} IS NOT NULL)
            OR (${table.eventType} IN ('scheduled', 'cancelled') AND ${table.toEnrollmentId} IS NULL)
          )
        ) OR (
          ${table.transitionType} IN ('reenroll', 'add_secondary')
          AND ${table.fromEnrollmentId} IS NULL
          AND ${table.sourceSchoolId} IS NULL
          AND ${table.destinationSchoolId} IS NOT NULL
          AND (
            (${table.eventType} = 'applied' AND ${table.toEnrollmentId} IS NOT NULL)
            OR (${table.eventType} IN ('scheduled', 'cancelled') AND ${table.toEnrollmentId} IS NULL)
          )
        )`
    ),
    pgPolicy('school_enrollment_transition_events_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN ('tenant.student_enrollments.read', 'tenant.student_enrollments.manage')
        AND public.openschool_enrollment_transition_scope_allows(
          ${table.tenantId}, ${table.personId}, ${table.sourceSchoolId}, ${table.destinationSchoolId}
        )
      `,
    }),
    pgPolicy('school_enrollment_transition_events_runtime_insert_deny', {
      for: 'insert',
      to: 'openschool_runtime',
      withCheck: sql`false`,
    }),
    pgPolicy('school_enrollment_transition_events_runtime_update_deny', {
      for: 'update',
      to: 'openschool_runtime',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('school_enrollment_transition_events_runtime_delete_deny', {
      for: 'delete',
      to: 'openschool_runtime',
      using: sql`false`,
    }),
    pgPolicy('school_enrollment_transition_events_admitter_select', {
      for: 'select',
      to: 'openschool_student_admitter',
      using: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.student_enrollments.manage'
        AND public.openschool_enrollment_transition_scope_allows(
          ${table.tenantId}, ${table.personId}, ${table.sourceSchoolId}, ${table.destinationSchoolId}
        )
      `,
    }),
    pgPolicy('school_enrollment_transition_events_admitter_insert', {
      for: 'insert',
      to: 'openschool_student_admitter',
      withCheck: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.student_enrollments.manage'
        AND public.openschool_enrollment_transition_scope_allows(
          ${table.tenantId}, ${table.personId}, ${table.sourceSchoolId}, ${table.destinationSchoolId}
        )
      `,
    }),
    pgPolicy('school_enrollment_transition_events_admitter_update_deny', {
      for: 'update',
      to: 'openschool_student_admitter',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('school_enrollment_transition_events_admitter_delete_deny', {
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
    operation: text('operation', {
      enum: ['backfill', 'create', 'update', 'transition'],
    }).notNull(),
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
      sql`${table.operation} IN ('backfill', 'create', 'update', 'transition')`
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
export type SchoolEnrollmentTransitionEvent = typeof schoolEnrollmentTransitionEvents.$inferSelect
export type NewSchoolEnrollmentTransitionEvent =
  typeof schoolEnrollmentTransitionEvents.$inferInsert
export type StudentCompatibilityEvidence = typeof studentCompatibilityEvidence.$inferSelect
