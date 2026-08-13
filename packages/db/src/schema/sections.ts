import { type SQLWrapper, sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { academicTerms, academicYears, learnerLevels } from './academic'
import { classes } from './classes'
import { enrollments } from './enrollments'
import { accounts, people } from './identity'
import { teachersOnClass } from './memberships'
import { schools } from './schools'
import { schoolEnrollments } from './sis'
import { tenants } from './tenancy'

const runtimeSectionRead = (
  tenantId: SQLWrapper,
  schoolId: SQLWrapper,
  sectionId: SQLWrapper
) => sql`
  ${tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    IN ('tenant.sections.read', 'tenant.sections.manage')
  AND public.openschool_section_scope_allows(${tenantId}, ${schoolId}, ${sectionId})
`

const managerSchoolAccess = (tenantId: SQLWrapper, schoolId: SQLWrapper) => sql`
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_section_manager'
  AND ${tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.sections.manage'
  AND public.openschool_school_scope_allows(${tenantId}, ${schoolId})
`

const runtimeWriteDeny = (name: string) =>
  pgPolicy(name, {
    for: 'all' as const,
    to: 'openschool_runtime',
    using: sql`false`,
    withCheck: sql`false`,
  })

export const courses = pgTable(
  'courses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    schoolId: uuid('school_id').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    courseType: text('course_type', {
      enum: ['general', 'subject', 'elective', 'support'],
    }).notNull(),
    subjectArea: text('subject_area'),
    description: text('description'),
    creditValue: numeric('credit_value', { precision: 8, scale: 3 }),
    status: text('status', { enum: ['active', 'archived'] })
      .default('active')
      .notNull(),
    createdByAccountId: uuid('created_by_account_id')
      .references(() => accounts.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    creationReason: text('creation_reason').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedByAccountId: uuid('archived_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    archiveReason: text('archive_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('courses_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('courses_tenant_school_id_id_unique').on(table.tenantId, table.schoolId, table.id),
    unique('courses_tenant_school_code_unique').on(table.tenantId, table.schoolId, table.code),
    foreignKey({
      name: 'courses_tenant_school_fk',
      columns: [table.tenantId, table.schoolId],
      foreignColumns: [schools.tenantId, schools.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('courses_tenant_school_status_name_idx').on(
      table.tenantId,
      table.schoolId,
      table.status,
      table.name,
      table.id
    ),
    check(
      'courses_code_check',
      sql`char_length(btrim(${table.code})) BETWEEN 1 AND 64 AND ${table.code} ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'`
    ),
    check('courses_name_check', sql`char_length(btrim(${table.name})) BETWEEN 1 AND 160`),
    check(
      'courses_type_check',
      sql`${table.courseType} IN ('general', 'subject', 'elective', 'support')`
    ),
    check('courses_status_check', sql`${table.status} IN ('active', 'archived')`),
    check(
      'courses_credit_check',
      sql`${table.creditValue} IS NULL OR (${table.creditValue} >= 0 AND ${table.creditValue} <= 100)`
    ),
    check(
      'courses_creation_reason_check',
      sql`char_length(btrim(${table.creationReason})) BETWEEN 3 AND 512`
    ),
    check(
      'courses_archive_evidence_check',
      sql`${table.status} <> 'archived' OR (${table.archivedAt} IS NOT NULL AND ${table.archivedByAccountId} IS NOT NULL AND char_length(btrim(${table.archiveReason})) BETWEEN 3 AND 512)`
    ),
    pgPolicy('courses_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN ('tenant.sections.read', 'tenant.sections.manage')
        AND public.openschool_course_scope_allows(${table.tenantId}, ${table.schoolId}, ${table.id})
      `,
    }),
    runtimeWriteDeny('courses_runtime_write_deny'),
    pgPolicy('courses_manager_all', {
      for: 'all',
      to: 'openschool_section_manager',
      using: managerSchoolAccess(table.tenantId, table.schoolId),
      withCheck: managerSchoolAccess(table.tenantId, table.schoolId),
    }),
  ]
).enableRLS()

export const sections = pgTable(
  'sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    schoolId: uuid('school_id').notNull(),
    academicYearId: uuid('academic_year_id').notNull(),
    academicTermId: uuid('academic_term_id'),
    learnerLevelId: uuid('learner_level_id'),
    courseId: uuid('course_id'),
    code: text('code').notNull(),
    name: text('name').notNull(),
    sectionType: text('section_type', { enum: ['homeroom', 'course'] }).notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    capacity: integer('capacity'),
    status: text('status', { enum: ['draft', 'active', 'closed'] })
      .default('draft')
      .notNull(),
    version: integer('version').default(1).notNull(),
    source: text('source', { enum: ['native', 'legacy_backfill'] })
      .default('native')
      .notNull(),
    legacyClassId: uuid('legacy_class_id'),
    createdByAccountId: uuid('created_by_account_id')
      .references(() => accounts.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    creationReason: text('creation_reason').notNull(),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    activatedByAccountId: uuid('activated_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedByAccountId: uuid('closed_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    closureReason: text('closure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('sections_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('sections_tenant_school_id_id_unique').on(table.tenantId, table.schoolId, table.id),
    unique('sections_year_code_unique').on(table.tenantId, table.academicYearId, table.code),
    unique('sections_legacy_class_unique').on(table.tenantId, table.legacyClassId),
    foreignKey({
      name: 'sections_tenant_school_fk',
      columns: [table.tenantId, table.schoolId],
      foreignColumns: [schools.tenantId, schools.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'sections_tenant_school_year_fk',
      columns: [table.tenantId, table.schoolId, table.academicYearId],
      foreignColumns: [academicYears.tenantId, academicYears.schoolId, academicYears.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'sections_tenant_school_term_fk',
      columns: [table.tenantId, table.schoolId, table.academicTermId],
      foreignColumns: [academicTerms.tenantId, academicTerms.schoolId, academicTerms.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'sections_tenant_school_level_fk',
      columns: [table.tenantId, table.schoolId, table.learnerLevelId],
      foreignColumns: [learnerLevels.tenantId, learnerLevels.schoolId, learnerLevels.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'sections_tenant_school_course_fk',
      columns: [table.tenantId, table.schoolId, table.courseId],
      foreignColumns: [courses.tenantId, courses.schoolId, courses.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'sections_tenant_legacy_class_fk',
      columns: [table.tenantId, table.legacyClassId],
      foreignColumns: [classes.tenantId, classes.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('sections_tenant_school_year_status_idx').on(
      table.tenantId,
      table.schoolId,
      table.academicYearId,
      table.status,
      table.startDate,
      table.id
    ),
    check(
      'sections_code_check',
      sql`char_length(btrim(${table.code})) BETWEEN 1 AND 64 AND ${table.code} ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'`
    ),
    check('sections_name_check', sql`char_length(btrim(${table.name})) BETWEEN 1 AND 160`),
    check('sections_type_check', sql`${table.sectionType} IN ('homeroom', 'course')`),
    check(
      'sections_course_requirement_check',
      sql`${table.sectionType} <> 'course' OR ${table.courseId} IS NOT NULL`
    ),
    check('sections_dates_check', sql`${table.endDate} >= ${table.startDate}`),
    check('sections_status_check', sql`${table.status} IN ('draft', 'active', 'closed')`),
    check('sections_capacity_check', sql`${table.capacity} IS NULL OR ${table.capacity} > 0`),
    check('sections_version_positive', sql`${table.version} > 0`),
    check(
      'sections_source_check',
      sql`${table.source} IN ('native', 'legacy_backfill') AND (${table.source} <> 'legacy_backfill' OR ${table.legacyClassId} IS NOT NULL)`
    ),
    check(
      'sections_creation_reason_check',
      sql`char_length(btrim(${table.creationReason})) BETWEEN 3 AND 512`
    ),
    check(
      'sections_activation_evidence_check',
      sql`${table.status} = 'draft' OR (${table.activatedAt} IS NOT NULL AND ${table.activatedByAccountId} IS NOT NULL)`
    ),
    check(
      'sections_closure_evidence_check',
      sql`${table.status} <> 'closed' OR (${table.closedAt} IS NOT NULL AND ${table.closedByAccountId} IS NOT NULL AND char_length(btrim(${table.closureReason})) BETWEEN 3 AND 512)`
    ),
    pgPolicy('sections_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: runtimeSectionRead(table.tenantId, table.schoolId, table.id),
    }),
    runtimeWriteDeny('sections_runtime_write_deny'),
    pgPolicy('sections_manager_all', {
      for: 'all',
      to: 'openschool_section_manager',
      using: managerSchoolAccess(table.tenantId, table.schoolId),
      withCheck: managerSchoolAccess(table.tenantId, table.schoolId),
    }),
  ]
).enableRLS()

export const sectionStaffAssignments = pgTable(
  'section_staff_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    schoolId: uuid('school_id').notNull(),
    sectionId: uuid('section_id').notNull(),
    personId: uuid('person_id').notNull(),
    assignmentKey: uuid('assignment_key').notNull(),
    version: integer('version').default(1).notNull(),
    role: text('role', { enum: ['lead_teacher', 'teacher', 'assistant', 'counselor'] }).notNull(),
    isPrimary: boolean('is_primary').default(false).notNull(),
    status: text('status', { enum: ['active', 'ended'] })
      .default('active')
      .notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    issuedByAccountId: uuid('issued_by_account_id')
      .references(() => accounts.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    issuanceReason: text('issuance_reason').notNull(),
    endedByAccountId: uuid('ended_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    endReason: text('end_reason'),
    legacyTeacherClassId: uuid('legacy_teacher_class_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('section_staff_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('section_staff_key_version_unique').on(
      table.tenantId,
      table.assignmentKey,
      table.version
    ),
    unique('section_staff_legacy_assignment_unique').on(table.tenantId, table.legacyTeacherClassId),
    foreignKey({
      name: 'section_staff_tenant_section_fk',
      columns: [table.tenantId, table.schoolId, table.sectionId],
      foreignColumns: [sections.tenantId, sections.schoolId, sections.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'section_staff_tenant_person_fk',
      columns: [table.tenantId, table.personId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'section_staff_tenant_legacy_assignment_fk',
      columns: [table.tenantId, table.legacyTeacherClassId],
      foreignColumns: [teachersOnClass.tenantId, teachersOnClass.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('section_staff_tenant_section_effective_idx').on(
      table.tenantId,
      table.sectionId,
      table.status,
      table.validFrom,
      table.validUntil,
      table.personId
    ),
    check(
      'section_staff_role_check',
      sql`${table.role} IN ('lead_teacher', 'teacher', 'assistant', 'counselor')`
    ),
    check('section_staff_status_check', sql`${table.status} IN ('active', 'ended')`),
    check(
      'section_staff_period_check',
      sql`${table.validUntil} IS NULL OR ${table.validUntil} > ${table.validFrom}`
    ),
    check(
      'section_staff_end_evidence_check',
      sql`${table.status} <> 'ended' OR (${table.validUntil} IS NOT NULL AND ${table.endedByAccountId} IS NOT NULL AND char_length(btrim(${table.endReason})) BETWEEN 3 AND 512)`
    ),
    check('section_staff_version_positive', sql`${table.version} > 0`),
    pgPolicy('section_staff_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: runtimeSectionRead(table.tenantId, table.schoolId, table.sectionId),
    }),
    runtimeWriteDeny('section_staff_runtime_write_deny'),
    pgPolicy('section_staff_manager_all', {
      for: 'all',
      to: 'openschool_section_manager',
      using: managerSchoolAccess(table.tenantId, table.schoolId),
      withCheck: managerSchoolAccess(table.tenantId, table.schoolId),
    }),
  ]
).enableRLS()

export const sectionRosterMemberships = pgTable(
  'section_roster_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    schoolId: uuid('school_id').notNull(),
    sectionId: uuid('section_id').notNull(),
    personId: uuid('person_id').notNull(),
    schoolEnrollmentId: uuid('school_enrollment_id').notNull(),
    rosterKey: uuid('roster_key').notNull(),
    version: integer('version').default(1).notNull(),
    status: text('status', { enum: ['active', 'ended'] })
      .default('active')
      .notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    issuedByAccountId: uuid('issued_by_account_id')
      .references(() => accounts.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    issuanceReason: text('issuance_reason').notNull(),
    endedByAccountId: uuid('ended_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    endReason: text('end_reason'),
    legacyEnrollmentId: uuid('legacy_enrollment_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('section_rosters_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('section_rosters_key_version_unique').on(table.tenantId, table.rosterKey, table.version),
    unique('section_rosters_legacy_enrollment_unique').on(table.tenantId, table.legacyEnrollmentId),
    foreignKey({
      name: 'section_rosters_tenant_section_fk',
      columns: [table.tenantId, table.schoolId, table.sectionId],
      foreignColumns: [sections.tenantId, sections.schoolId, sections.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'section_rosters_tenant_person_fk',
      columns: [table.tenantId, table.personId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'section_rosters_tenant_school_enrollment_fk',
      columns: [table.tenantId, table.schoolEnrollmentId],
      foreignColumns: [schoolEnrollments.tenantId, schoolEnrollments.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'section_rosters_tenant_legacy_enrollment_fk',
      columns: [table.tenantId, table.legacyEnrollmentId],
      foreignColumns: [enrollments.tenantId, enrollments.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('section_rosters_tenant_section_effective_idx').on(
      table.tenantId,
      table.sectionId,
      table.status,
      table.validFrom,
      table.validUntil,
      table.personId
    ),
    index('section_rosters_tenant_person_effective_idx').on(
      table.tenantId,
      table.personId,
      table.status,
      table.validFrom,
      table.validUntil,
      table.sectionId
    ),
    check(
      'section_rosters_period_check',
      sql`${table.validUntil} IS NULL OR ${table.validUntil} > ${table.validFrom}`
    ),
    check('section_rosters_status_check', sql`${table.status} IN ('active', 'ended')`),
    check(
      'section_rosters_end_evidence_check',
      sql`${table.status} <> 'ended' OR (${table.validUntil} IS NOT NULL AND ${table.endedByAccountId} IS NOT NULL AND char_length(btrim(${table.endReason})) BETWEEN 3 AND 512)`
    ),
    check('section_rosters_version_positive', sql`${table.version} > 0`),
    pgPolicy('section_rosters_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN ('tenant.sections.read', 'tenant.sections.manage')
        AND public.openschool_section_roster_scope_allows(
          ${table.tenantId}, ${table.schoolId}, ${table.sectionId}, ${table.personId}
        )
      `,
    }),
    runtimeWriteDeny('section_rosters_runtime_write_deny'),
    pgPolicy('section_rosters_manager_all', {
      for: 'all',
      to: 'openschool_section_manager',
      using: managerSchoolAccess(table.tenantId, table.schoolId),
      withCheck: managerSchoolAccess(table.tenantId, table.schoolId),
    }),
  ]
).enableRLS()

export const sectionCompatibilityEvidence = pgTable(
  'section_compatibility_evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    schoolId: uuid('school_id').notNull(),
    legacyClassId: uuid('legacy_class_id').notNull(),
    sectionId: uuid('section_id'),
    mappingStatus: text('mapping_status', {
      enum: ['mapped', 'unmapped', 'review_required'],
    }).notNull(),
    legacyRosterCount: integer('legacy_roster_count').notNull(),
    canonicalRosterCount: integer('canonical_roster_count').notNull(),
    legacyRosterHash: text('legacy_roster_hash'),
    canonicalRosterHash: text('canonical_roster_hash'),
    reason: text('reason').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('section_compatibility_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('section_compatibility_legacy_class_unique').on(table.tenantId, table.legacyClassId),
    foreignKey({
      name: 'section_compatibility_tenant_school_fk',
      columns: [table.tenantId, table.schoolId],
      foreignColumns: [schools.tenantId, schools.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'section_compatibility_tenant_legacy_class_fk',
      columns: [table.tenantId, table.legacyClassId],
      foreignColumns: [classes.tenantId, classes.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'section_compatibility_tenant_section_fk',
      columns: [table.tenantId, table.sectionId],
      foreignColumns: [sections.tenantId, sections.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('section_compatibility_tenant_school_status_idx').on(
      table.tenantId,
      table.schoolId,
      table.mappingStatus,
      table.id
    ),
    check(
      'section_compatibility_status_check',
      sql`${table.mappingStatus} IN ('mapped', 'unmapped', 'review_required')`
    ),
    check(
      'section_compatibility_counts_check',
      sql`${table.legacyRosterCount} >= 0 AND ${table.canonicalRosterCount} >= 0`
    ),
    check(
      'section_compatibility_mapping_check',
      sql`${table.mappingStatus} <> 'mapped' OR (${table.sectionId} IS NOT NULL AND ${table.legacyRosterCount} = ${table.canonicalRosterCount} AND ${table.legacyRosterHash} = ${table.canonicalRosterHash})`
    ),
    check(
      'section_compatibility_reason_check',
      sql`char_length(btrim(${table.reason})) BETWEEN 3 AND 512`
    ),
    pgPolicy('section_compatibility_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN ('tenant.sections.read', 'tenant.sections.manage')
        AND public.openschool_school_scope_allows(${table.tenantId}, ${table.schoolId})
      `,
    }),
    runtimeWriteDeny('section_compatibility_runtime_write_deny'),
  ]
).enableRLS()

export type Course = typeof courses.$inferSelect
export type Section = typeof sections.$inferSelect
export type SectionStaffAssignment = typeof sectionStaffAssignments.$inferSelect
export type SectionRosterMembership = typeof sectionRosterMemberships.$inferSelect
export type SectionCompatibilityEvidence = typeof sectionCompatibilityEvidence.$inferSelect
