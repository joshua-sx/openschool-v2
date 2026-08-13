import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
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
import { classes } from './classes'
import { educationOrganizations } from './education-organizations'
import { schools } from './schools'
import { students } from './student'
import { tenants } from './tenancy'
import { users } from './users'

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    legacyUserId: uuid('legacy_user_id').references(() => users.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    identityProvider: text('identity_provider').default('supabase').notNull(),
    providerSubject: text('provider_subject').notNull(),
    primaryEmail: text('primary_email').notNull(),
    status: text('status', { enum: ['active', 'disabled', 'deleted'] })
      .default('active')
      .notNull(),
    membershipVersion: bigint('membership_version', { mode: 'number' }).default(1).notNull(),
    securityVersion: bigint('security_version', { mode: 'number' }).default(1).notNull(),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    disabledReason: text('disabled_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('accounts_legacy_user_id_unique').on(table.legacyUserId),
    unique('accounts_provider_subject_unique').on(table.identityProvider, table.providerSubject),
    unique('accounts_primary_email_unique').on(table.primaryEmail),
    check('accounts_status_check', sql`${table.status} IN ('active', 'disabled', 'deleted')`),
    check(
      'accounts_versions_positive',
      sql`${table.membershipVersion} > 0 AND ${table.securityVersion} > 0`
    ),
    check(
      'accounts_disabled_evidence_check',
      sql`${table.status} = 'active' OR (${table.disabledAt} IS NOT NULL AND ${table.disabledReason} IS NOT NULL)`
    ),
  ]
)

export const accountSessions = pgTable(
  'account_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .references(() => accounts.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    providerSessionId: text('provider_session_id').notNull(),
    status: text('status', { enum: ['active', 'revoked', 'expired'] })
      .default('active')
      .notNull(),
    assuranceLevel: text('assurance_level', { enum: ['aal1', 'aal2'] }).notNull(),
    securityVersion: bigint('security_version', { mode: 'number' }).notNull(),
    authenticatedAt: timestamp('authenticated_at', { withTimezone: true }).notNull(),
    reauthenticatedAt: timestamp('reauthenticated_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByAccountId: uuid('revoked_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    revocationReason: text('revocation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('account_sessions_provider_session_id_unique').on(table.providerSessionId),
    index('account_sessions_account_status_idx').on(
      table.accountId,
      table.status,
      table.expiresAt,
      table.id
    ),
    check(
      'account_sessions_status_check',
      sql`${table.status} IN ('active', 'revoked', 'expired')`
    ),
    check(
      'account_sessions_assurance_level_check',
      sql`${table.assuranceLevel} IN ('aal1', 'aal2')`
    ),
    check('account_sessions_security_version_positive', sql`${table.securityVersion} > 0`),
    check('account_sessions_time_order_check', sql`${table.expiresAt} > ${table.authenticatedAt}`),
    check(
      'account_sessions_reauthentication_time_check',
      sql`${table.reauthenticatedAt} IS NULL OR ${table.reauthenticatedAt} < ${table.expiresAt}`
    ),
    check(
      'account_sessions_revocation_evidence_check',
      sql`${table.status} <> 'revoked' OR (${table.revokedAt} IS NOT NULL AND ${table.revocationReason} IS NOT NULL AND btrim(${table.revocationReason}) <> '')`
    ),
  ]
)

export const people = pgTable(
  'people',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    legacyUserId: uuid('legacy_user_id').references(() => users.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    legacyStudentId: uuid('legacy_student_id'),
    displayName: text('display_name').notNull(),
    normalizedDisplayName: text('normalized_display_name').notNull(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    dateOfBirth: date('date_of_birth'),
    email: text('email'),
    normalizedEmail: text('normalized_email'),
    status: text('status', { enum: ['active', 'suspended', 'archived', 'deceased'] })
      .default('active')
      .notNull(),
    source: text('source', { enum: ['legacy_user', 'legacy_student', 'native'] })
      .default('native')
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('people_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('people_tenant_legacy_user_unique').on(table.tenantId, table.legacyUserId),
    unique('people_tenant_legacy_student_unique').on(table.tenantId, table.legacyStudentId),
    foreignKey({
      name: 'people_tenant_legacy_student_fk',
      columns: [table.tenantId, table.legacyStudentId],
      foreignColumns: [students.tenantId, students.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('people_tenant_name_idx').on(table.tenantId, table.normalizedDisplayName, table.id),
    index('people_tenant_email_idx').on(table.tenantId, table.normalizedEmail, table.id),
    check(
      'people_status_check',
      sql`${table.status} IN ('active', 'suspended', 'archived', 'deceased')`
    ),
    check(
      'people_source_check',
      sql`${table.source} IN ('legacy_user', 'legacy_student', 'native')`
    ),
    check(
      'people_legacy_source_check',
      sql`(${table.source} <> 'legacy_user' OR ${table.legacyUserId} IS NOT NULL)
          AND (${table.source} <> 'legacy_student' OR ${table.legacyStudentId} IS NOT NULL)`
    ),
  ]
)

export const accountLinks = pgTable(
  'account_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    accountId: uuid('account_id')
      .references(() => accounts.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    personId: uuid('person_id').notNull(),
    status: text('status', { enum: ['pending', 'active', 'suspended', 'revoked', 'expired'] })
      .default('pending')
      .notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    issuedByAccountId: uuid('issued_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    issuanceReason: text('issuance_reason').notNull(),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByAccountId: uuid('revoked_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    revocationReason: text('revocation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('account_links_tenant_id_id_unique').on(table.tenantId, table.id),
    foreignKey({
      name: 'account_links_tenant_person_fk',
      columns: [table.tenantId, table.personId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('account_links_account_status_idx').on(table.accountId, table.status, table.tenantId),
    index('account_links_tenant_person_status_idx').on(
      table.tenantId,
      table.personId,
      table.status
    ),
    check(
      'account_links_status_check',
      sql`${table.status} IN ('pending', 'active', 'suspended', 'revoked', 'expired')`
    ),
    check(
      'account_links_valid_period_check',
      sql`${table.validFrom} IS NULL OR ${table.validUntil} IS NULL OR ${table.validUntil} > ${table.validFrom}`
    ),
    check(
      'account_links_activation_evidence_check',
      sql`${table.status} <> 'active' OR (${table.validFrom} IS NOT NULL AND ${table.activatedAt} IS NOT NULL)`
    ),
    check(
      'account_links_revocation_evidence_check',
      sql`${table.status} <> 'revoked' OR (${table.revokedAt} IS NOT NULL AND ${table.revocationReason} IS NOT NULL AND ${table.validUntil} IS NOT NULL)`
    ),
  ]
)

export const affiliations = pgTable(
  'affiliations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    personId: uuid('person_id').notNull(),
    kind: text('kind', {
      enum: ['student', 'guardian', 'employee', 'teacher', 'administrator', 'member'],
    }).notNull(),
    scopeType: text('scope_type', {
      enum: ['tenant', 'education_organization', 'school', 'class'],
    }).notNull(),
    educationOrganizationId: uuid('education_organization_id'),
    schoolId: uuid('school_id'),
    classId: uuid('class_id'),
    status: text('status', { enum: ['active', 'suspended', 'revoked'] })
      .default('active')
      .notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    issuedByAccountId: uuid('issued_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    issuanceReason: text('issuance_reason').notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByAccountId: uuid('revoked_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    revocationReason: text('revocation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('affiliations_tenant_id_id_unique').on(table.tenantId, table.id),
    foreignKey({
      name: 'affiliations_tenant_person_fk',
      columns: [table.tenantId, table.personId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'affiliations_tenant_education_organization_fk',
      columns: [table.tenantId, table.educationOrganizationId],
      foreignColumns: [educationOrganizations.tenantId, educationOrganizations.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'affiliations_tenant_school_fk',
      columns: [table.tenantId, table.schoolId],
      foreignColumns: [schools.tenantId, schools.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'affiliations_tenant_class_fk',
      columns: [table.tenantId, table.classId],
      foreignColumns: [classes.tenantId, classes.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('affiliations_tenant_person_effective_idx').on(
      table.tenantId,
      table.personId,
      table.status,
      table.validFrom,
      table.validUntil
    ),
    index('affiliations_tenant_school_effective_idx').on(
      table.tenantId,
      table.schoolId,
      table.status,
      table.validFrom,
      table.validUntil
    ),
    check(
      'affiliations_kind_check',
      sql`${table.kind} IN ('student', 'guardian', 'employee', 'teacher', 'administrator', 'member')`
    ),
    check('affiliations_status_check', sql`${table.status} IN ('active', 'suspended', 'revoked')`),
    check(
      'affiliations_scope_check',
      sql`(${table.scopeType} = 'tenant' AND ${table.educationOrganizationId} IS NULL AND ${table.schoolId} IS NULL AND ${table.classId} IS NULL)
          OR (${table.scopeType} = 'education_organization' AND ${table.educationOrganizationId} IS NOT NULL AND ${table.schoolId} IS NULL AND ${table.classId} IS NULL)
          OR (${table.scopeType} = 'school' AND ${table.educationOrganizationId} IS NULL AND ${table.schoolId} IS NOT NULL AND ${table.classId} IS NULL)
          OR (${table.scopeType} = 'class' AND ${table.educationOrganizationId} IS NULL AND ${table.schoolId} IS NULL AND ${table.classId} IS NOT NULL)`
    ),
    check(
      'affiliations_valid_period_check',
      sql`${table.validUntil} IS NULL OR ${table.validUntil} > ${table.validFrom}`
    ),
    check(
      'affiliations_revocation_evidence_check',
      sql`${table.status} <> 'revoked' OR (${table.revokedAt} IS NOT NULL AND ${table.revocationReason} IS NOT NULL AND ${table.validUntil} IS NOT NULL)`
    ),
  ]
)

export const roleTemplateAssignments = pgTable(
  'role_template_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    affiliationId: uuid('affiliation_id').notNull(),
    roleTemplateKey: text('role_template_key').notNull(),
    status: text('status', { enum: ['active', 'suspended', 'revoked'] })
      .default('active')
      .notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    issuedByAccountId: uuid('issued_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    issuanceReason: text('issuance_reason').notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByAccountId: uuid('revoked_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    revocationReason: text('revocation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('role_template_assignments_tenant_id_id_unique').on(table.tenantId, table.id),
    foreignKey({
      name: 'role_template_assignments_tenant_affiliation_fk',
      columns: [table.tenantId, table.affiliationId],
      foreignColumns: [affiliations.tenantId, affiliations.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('role_template_assignments_affiliation_effective_idx').on(
      table.tenantId,
      table.affiliationId,
      table.status,
      table.validFrom,
      table.validUntil
    ),
    check(
      'role_template_assignments_status_check',
      sql`${table.status} IN ('active', 'suspended', 'revoked')`
    ),
    check(
      'role_template_assignments_valid_period_check',
      sql`${table.validUntil} IS NULL OR ${table.validUntil} > ${table.validFrom}`
    ),
    check(
      'role_template_assignments_revocation_evidence_check',
      sql`${table.status} <> 'revoked' OR (${table.revokedAt} IS NOT NULL AND ${table.revocationReason} IS NOT NULL AND ${table.validUntil} IS NOT NULL)`
    ),
  ]
)

export const personRelationships = pgTable(
  'person_relationships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    subjectPersonId: uuid('subject_person_id').notNull(),
    relatedPersonId: uuid('related_person_id').notNull(),
    type: text('type', {
      enum: [
        'guardian_of',
        'parent_of',
        'emergency_contact_of',
        'spouse_of',
        'sibling_of',
        'other',
      ],
    }).notNull(),
    status: text('status', { enum: ['active', 'suspended', 'revoked'] })
      .default('active')
      .notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    issuedByAccountId: uuid('issued_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    issuanceReason: text('issuance_reason').notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByAccountId: uuid('revoked_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    revocationReason: text('revocation_reason'),
    legalAuthority: boolean('legal_authority').default(false).notNull(),
    decisionAuthority: text('decision_authority', {
      enum: ['none', 'shared', 'sole', 'limited'],
    })
      .default('none')
      .notNull(),
    emergencyPriority: integer('emergency_priority'),
    pickupAuthority: boolean('pickup_authority').default(false).notNull(),
    portalEligible: boolean('portal_eligible').default(false).notNull(),
    version: bigint('version', { mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('person_relationships_tenant_id_id_unique').on(table.tenantId, table.id),
    foreignKey({
      name: 'person_relationships_tenant_subject_fk',
      columns: [table.tenantId, table.subjectPersonId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'person_relationships_tenant_related_fk',
      columns: [table.tenantId, table.relatedPersonId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('person_relationships_subject_effective_idx').on(
      table.tenantId,
      table.subjectPersonId,
      table.status,
      table.validFrom,
      table.validUntil
    ),
    index('person_relationships_related_effective_idx').on(
      table.tenantId,
      table.relatedPersonId,
      table.status,
      table.validFrom,
      table.validUntil
    ),
    check(
      'person_relationships_type_check',
      sql`${table.type} IN ('guardian_of', 'parent_of', 'emergency_contact_of', 'spouse_of', 'sibling_of', 'other')`
    ),
    check(
      'person_relationships_status_check',
      sql`${table.status} IN ('active', 'suspended', 'revoked')`
    ),
    check(
      'person_relationships_distinct_people_check',
      sql`${table.subjectPersonId} <> ${table.relatedPersonId}`
    ),
    check(
      'person_relationships_valid_period_check',
      sql`${table.validUntil} IS NULL OR ${table.validUntil} > ${table.validFrom}`
    ),
    check(
      'person_relationships_revocation_evidence_check',
      sql`${table.status} <> 'revoked' OR (${table.revokedAt} IS NOT NULL AND ${table.revocationReason} IS NOT NULL AND ${table.validUntil} IS NOT NULL)`
    ),
    check(
      'person_relationships_decision_authority_check',
      sql`${table.decisionAuthority} IN ('none', 'shared', 'sole', 'limited')`
    ),
    check(
      'person_relationships_emergency_priority_check',
      sql`${table.emergencyPriority} IS NULL OR ${table.emergencyPriority} BETWEEN 1 AND 99`
    ),
    check(
      'person_relationships_portal_eligibility_check',
      sql`NOT ${table.portalEligible} OR ${table.type} IN ('guardian_of', 'parent_of')`
    ),
    check('person_relationships_version_positive', sql`${table.version} > 0`),
    pgPolicy('person_relationships_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND (
          (
            nullif(current_setting('app.policy_capability', true), '')
              = 'tenant.guardian_contacts.read'
            AND public.openschool_guardian_contact_read_scope_allows(
              ${table.tenantId}, ${table.relatedPersonId}
            )
          )
          OR (
            nullif(current_setting('app.policy_capability', true), '')
              = 'tenant.guardian_contacts.manage'
            AND public.openschool_guardian_contact_manage_scope_allows(
              ${table.tenantId}, ${table.relatedPersonId}
            )
          )
          OR (
            nullif(current_setting('app.policy_capability', true), '')
              IN ('identity.context.resolve', 'tenant.students.read')
            AND ${table.subjectPersonId}::text
              = nullif(current_setting('app.person_id', true), '')
            AND ${table.type} IN ('guardian_of', 'parent_of')
            AND ${table.portalEligible}
            AND ${table.status} = 'active'
            AND ${table.validFrom} <= now()
            AND (${table.validUntil} IS NULL OR ${table.validUntil} > now())
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements(public.openschool_policy_constraints()) AS constraint_row
              WHERE constraint_row ->> 'kind' = 'linked_student'
                AND constraint_row ->> 'tenantId' = ${table.tenantId}::text
                AND constraint_row ->> 'guardianPersonId' = ${table.subjectPersonId}::text
                AND (
                  constraint_row ->> 'studentId' IS NULL
                  OR constraint_row ->> 'studentId' = ${table.relatedPersonId}::text
                )
            )
          )
        )
      `,
    }),
    pgPolicy('person_relationships_runtime_insert_deny', {
      for: 'insert',
      to: 'openschool_runtime',
      withCheck: sql`false`,
    }),
    pgPolicy('person_relationships_runtime_update_deny', {
      for: 'update',
      to: 'openschool_runtime',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('person_relationships_runtime_delete_deny', {
      for: 'delete',
      to: 'openschool_runtime',
      using: sql`false`,
    }),
    pgPolicy('person_relationships_contact_manager_select', {
      for: 'select',
      to: 'openschool_guardian_contact_manager',
      using: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_guardian_contact_manager'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.guardian_contacts.manage'
        AND public.openschool_guardian_contact_manage_scope_allows(
          ${table.tenantId}, ${table.relatedPersonId}
        )
      `,
    }),
    pgPolicy('person_relationships_contact_manager_insert', {
      for: 'insert',
      to: 'openschool_guardian_contact_manager',
      withCheck: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_guardian_contact_manager'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.guardian_contacts.manage'
        AND public.openschool_guardian_contact_manage_scope_allows(
          ${table.tenantId}, ${table.relatedPersonId}
        )
      `,
    }),
    pgPolicy('person_relationships_contact_manager_update', {
      for: 'update',
      to: 'openschool_guardian_contact_manager',
      using: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_guardian_contact_manager'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.guardian_contacts.manage'
        AND public.openschool_guardian_contact_manage_scope_allows(
          ${table.tenantId}, ${table.relatedPersonId}
        )
      `,
      withCheck: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_guardian_contact_manager'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.guardian_contacts.manage'
        AND public.openschool_guardian_contact_manage_scope_allows(
          ${table.tenantId}, ${table.relatedPersonId}
        )
      `,
    }),
    pgPolicy('person_relationships_contact_manager_delete_deny', {
      for: 'delete',
      to: 'openschool_guardian_contact_manager',
      using: sql`false`,
    }),
  ]
).enableRLS()

export const contactProfiles = pgTable(
  'contact_profiles',
  {
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    personId: uuid('person_id').notNull(),
    phone: text('phone'),
    normalizedPhone: text('normalized_phone'),
    preferredContactMethod: text('preferred_contact_method', {
      enum: ['email', 'phone', 'sms', 'none'],
    })
      .default('none')
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ name: 'contact_profiles_pk', columns: [table.tenantId, table.personId] }),
    foreignKey({
      name: 'contact_profiles_tenant_person_fk',
      columns: [table.tenantId, table.personId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('contact_profiles_tenant_phone_idx').on(table.tenantId, table.normalizedPhone),
    check(
      'contact_profiles_phone_check',
      sql`${table.phone} IS NULL OR char_length(btrim(${table.phone})) BETWEEN 5 AND 32`
    ),
    check(
      'contact_profiles_normalized_phone_check',
      sql`${table.normalizedPhone} IS NULL OR char_length(${table.normalizedPhone}) BETWEEN 5 AND 20`
    ),
    check(
      'contact_profiles_preferred_method_check',
      sql`${table.preferredContactMethod} IN ('email', 'phone', 'sms', 'none')`
    ),
    pgPolicy('contact_profiles_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN ('tenant.guardian_contacts.read', 'tenant.guardian_contacts.manage')
        AND public.openschool_contact_person_read_scope_allows(
          ${table.tenantId}, ${table.personId}
        )
      `,
    }),
    pgPolicy('contact_profiles_runtime_insert_deny', {
      for: 'insert',
      to: 'openschool_runtime',
      withCheck: sql`false`,
    }),
    pgPolicy('contact_profiles_runtime_update_deny', {
      for: 'update',
      to: 'openschool_runtime',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('contact_profiles_runtime_delete_deny', {
      for: 'delete',
      to: 'openschool_runtime',
      using: sql`false`,
    }),
    pgPolicy('contact_profiles_contact_manager_select', {
      for: 'select',
      to: 'openschool_guardian_contact_manager',
      using: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_guardian_contact_manager'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.guardian_contacts.manage'
        AND public.openschool_contact_person_manage_scope_allows(
          ${table.tenantId}, ${table.personId}
        )
      `,
    }),
    pgPolicy('contact_profiles_contact_manager_insert', {
      for: 'insert',
      to: 'openschool_guardian_contact_manager',
      withCheck: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_guardian_contact_manager'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.guardian_contacts.manage'
        AND public.openschool_contact_person_manage_scope_allows(
          ${table.tenantId}, ${table.personId}
        )
      `,
    }),
    pgPolicy('contact_profiles_contact_manager_update', {
      for: 'update',
      to: 'openschool_guardian_contact_manager',
      using: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_guardian_contact_manager'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.guardian_contacts.manage'
        AND public.openschool_contact_person_manage_scope_allows(
          ${table.tenantId}, ${table.personId}
        )
      `,
      withCheck: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_guardian_contact_manager'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.guardian_contacts.manage'
        AND public.openschool_contact_person_manage_scope_allows(
          ${table.tenantId}, ${table.personId}
        )
      `,
    }),
    pgPolicy('contact_profiles_contact_manager_delete_deny', {
      for: 'delete',
      to: 'openschool_guardian_contact_manager',
      using: sql`false`,
    }),
  ]
).enableRLS()

export const studentProfiles = pgTable(
  'student_profiles',
  {
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    personId: uuid('person_id').notNull(),
    legacyStudentId: uuid('legacy_student_id'),
    studentNumber: text('student_number'),
    status: text('status', { enum: ['active', 'inactive', 'graduated', 'withdrawn'] })
      .default('active')
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ name: 'student_profiles_pk', columns: [table.tenantId, table.personId] }),
    foreignKey({
      name: 'student_profiles_tenant_person_fk',
      columns: [table.tenantId, table.personId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'student_profiles_tenant_legacy_student_fk',
      columns: [table.tenantId, table.legacyStudentId],
      foreignColumns: [students.tenantId, students.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique('student_profiles_tenant_student_number_unique').on(table.tenantId, table.studentNumber),
    unique('student_profiles_tenant_legacy_student_unique').on(
      table.tenantId,
      table.legacyStudentId
    ),
    check(
      'student_profiles_status_check',
      sql`${table.status} IN ('active', 'inactive', 'graduated', 'withdrawn')`
    ),
  ]
)

export const guardianProfiles = pgTable(
  'guardian_profiles',
  {
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    personId: uuid('person_id').notNull(),
    status: text('status', { enum: ['active', 'inactive'] })
      .default('active')
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ name: 'guardian_profiles_pk', columns: [table.tenantId, table.personId] }),
    foreignKey({
      name: 'guardian_profiles_tenant_person_fk',
      columns: [table.tenantId, table.personId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    check('guardian_profiles_status_check', sql`${table.status} IN ('active', 'inactive')`),
  ]
)

export const employeeProfiles = pgTable(
  'employee_profiles',
  {
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    personId: uuid('person_id').notNull(),
    employeeNumber: text('employee_number'),
    jobTitle: text('job_title'),
    status: text('status', { enum: ['active', 'leave', 'terminated'] })
      .default('active')
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ name: 'employee_profiles_pk', columns: [table.tenantId, table.personId] }),
    foreignKey({
      name: 'employee_profiles_tenant_person_fk',
      columns: [table.tenantId, table.personId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique('employee_profiles_tenant_employee_number_unique').on(
      table.tenantId,
      table.employeeNumber
    ),
    check(
      'employee_profiles_status_check',
      sql`${table.status} IN ('active', 'leave', 'terminated')`
    ),
  ]
)

export const teacherProfiles = pgTable(
  'teacher_profiles',
  {
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    personId: uuid('person_id').notNull(),
    registrationNumber: text('registration_number'),
    status: text('status', { enum: ['active', 'inactive', 'suspended'] })
      .default('active')
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ name: 'teacher_profiles_pk', columns: [table.tenantId, table.personId] }),
    foreignKey({
      name: 'teacher_profiles_tenant_person_fk',
      columns: [table.tenantId, table.personId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique('teacher_profiles_tenant_registration_number_unique').on(
      table.tenantId,
      table.registrationNumber
    ),
    check(
      'teacher_profiles_status_check',
      sql`${table.status} IN ('active', 'inactive', 'suspended')`
    ),
  ]
)

export const personMergeEvidence = pgTable(
  'person_merge_evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    sourcePersonId: uuid('source_person_id').notNull(),
    targetPersonId: uuid('target_person_id').notNull(),
    status: text('status', {
      enum: ['proposed', 'approved', 'completed', 'rejected', 'reverted'],
    })
      .default('proposed')
      .notNull(),
    reason: text('reason').notNull(),
    evidence: jsonb('evidence').default({}).notNull(),
    recordedByAccountId: uuid('recorded_by_account_id')
      .references(() => accounts.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('person_merge_evidence_tenant_id_id_unique').on(table.tenantId, table.id),
    foreignKey({
      name: 'person_merge_evidence_tenant_source_fk',
      columns: [table.tenantId, table.sourcePersonId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'person_merge_evidence_tenant_target_fk',
      columns: [table.tenantId, table.targetPersonId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('person_merge_evidence_tenant_people_idx').on(
      table.tenantId,
      table.sourcePersonId,
      table.targetPersonId,
      table.createdAt
    ),
    check(
      'person_merge_evidence_status_check',
      sql`${table.status} IN ('proposed', 'approved', 'completed', 'rejected', 'reverted')`
    ),
    check(
      'person_merge_evidence_distinct_people_check',
      sql`${table.sourcePersonId} <> ${table.targetPersonId}`
    ),
    check(
      'person_merge_evidence_completion_check',
      sql`${table.status} <> 'completed' OR ${table.completedAt} IS NOT NULL`
    ),
  ]
)

export const identityMigrationEvents = pgTable(
  'identity_migration_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    accountId: uuid('account_id')
      .references(() => accounts.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    personId: uuid('person_id').notNull(),
    accountLinkId: uuid('account_link_id').notNull(),
    eventType: text('event_type', {
      enum: ['account_link_backfilled', 'account_link_activated', 'account_link_revoked'],
    }).notNull(),
    membershipVersion: bigint('membership_version', { mode: 'number' }).notNull(),
    actorAccountId: uuid('actor_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    evidence: jsonb('evidence').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('identity_migration_events_tenant_id_id_unique').on(table.tenantId, table.id),
    foreignKey({
      name: 'identity_migration_events_tenant_person_fk',
      columns: [table.tenantId, table.personId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'identity_migration_events_tenant_account_link_fk',
      columns: [table.tenantId, table.accountLinkId],
      foreignColumns: [accountLinks.tenantId, accountLinks.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('identity_migration_events_account_version_idx').on(
      table.accountId,
      table.membershipVersion
    ),
    index('identity_migration_events_tenant_person_idx').on(
      table.tenantId,
      table.personId,
      table.createdAt
    ),
    check(
      'identity_migration_events_type_check',
      sql`${table.eventType} IN ('account_link_backfilled', 'account_link_activated', 'account_link_revoked')`
    ),
    check('identity_migration_events_version_positive', sql`${table.membershipVersion} > 0`),
  ]
)

export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert
export type AccountSession = typeof accountSessions.$inferSelect
export type NewAccountSession = typeof accountSessions.$inferInsert
export type Person = typeof people.$inferSelect
export type NewPerson = typeof people.$inferInsert
export type AccountLink = typeof accountLinks.$inferSelect
export type NewAccountLink = typeof accountLinks.$inferInsert
export type Affiliation = typeof affiliations.$inferSelect
export type NewAffiliation = typeof affiliations.$inferInsert
export type RoleTemplateAssignment = typeof roleTemplateAssignments.$inferSelect
export type PersonRelationship = typeof personRelationships.$inferSelect
export type ContactProfile = typeof contactProfiles.$inferSelect
export type PersonMergeEvidence = typeof personMergeEvidence.$inferSelect
export type IdentityMigrationEvent = typeof identityMigrationEvents.$inferSelect
