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
import { organizations } from './organizations'
import { ENTITY_STATUS } from './status'
import { STUDENT_ADMITTER_CAPABILITIES } from './student-policy-capabilities'
import { tenants } from './tenancy'

export const schools = pgTable(
  'schools',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      })
      .notNull(),
    orgId: uuid('org_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    profile: text('profile', {
      enum: ['primary', 'secondary', 'all_through', 'special', 'other'],
    })
      .default('other')
      .notNull(),
    address: text('address'),
    phone: text('phone'),
    academicYear: text('academic_year'),
    terms: jsonb('terms').default([]),
    status: text('status', { enum: ['active', 'archived', 'read_only'] })
      .default(ENTITY_STATUS.ACTIVE)
      .notNull(),
    settings: jsonb('settings').default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    unique('schools_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('schools_tenant_id_slug_unique').on(table.tenantId, table.slug),
    foreignKey({
      name: 'schools_tenant_organization_fk',
      columns: [table.tenantId, table.orgId],
      foreignColumns: [organizations.tenantId, organizations.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('schools_tenant_organization_idx').on(table.tenantId, table.orgId),
    check(
      'schools_profile_check',
      sql`${table.profile} IN ('primary', 'secondary', 'all_through', 'special', 'other')`
    ),
    pgPolicy('schools_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND (
          ${table.id} = nullif(current_setting('app.school_id', true), '')::uuid
          OR (
            nullif(current_setting('app.policy_capability', true), '')
              IN (
                'tenant.schools.read',
                'tenant.students.create', 'tenant.students.read',
                'tenant.students.update', 'tenant.students.delete',
                'support.schools.read', 'support.students.read',
                'tenant.accounts.invite', 'tenant.accounts.manage',
                'tenant.academic_structure.read', 'tenant.academic_structure.manage',
                'tenant.student_enrollments.read', 'tenant.student_enrollments.manage',
                'tenant.guardian_contacts.read', 'tenant.guardian_contacts.manage',
                'tenant.sections.read', 'tenant.sections.manage',
                'identity.context.resolve'
              )
            AND public.openschool_school_scope_allows(
              ${table.tenantId}, ${table.id}
            )
          )
        )
      `,
    }),
    pgPolicy('schools_identity_revoker_select', {
      for: 'select',
      to: 'openschool_identity_revoker',
      using: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.accounts.manage'
        AND nullif(current_setting('app.assurance_level', true), '') = 'aal2'
      `,
    }),
    pgPolicy('schools_worker_select', {
      for: 'select',
      to: 'openschool_worker',
      using: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid`,
    }),
    pgPolicy('schools_student_admitter_select', {
      for: 'select',
      to: 'openschool_student_admitter',
      using: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN (${STUDENT_ADMITTER_CAPABILITIES})
        AND public.openschool_school_scope_allows(${table.tenantId}, ${table.id})
      `,
    }),
    pgPolicy('schools_academic_configurator_select', {
      for: 'select',
      to: 'openschool_academic_configurator',
      using: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_academic_configurator'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.academic_structure.manage'
        AND public.openschool_school_scope_allows(${table.tenantId}, ${table.id})
      `,
    }),
    pgPolicy('schools_runtime_insert_deny', {
      for: 'insert',
      to: 'openschool_runtime',
      withCheck: sql`false`,
    }),
    pgPolicy('schools_runtime_update_deny', {
      for: 'update',
      to: 'openschool_runtime',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('schools_runtime_delete_deny', {
      for: 'delete',
      to: 'openschool_runtime',
      using: sql`false`,
    }),
    pgPolicy('schools_worker_insert_deny', {
      for: 'insert',
      to: 'openschool_worker',
      withCheck: sql`false`,
    }),
    pgPolicy('schools_worker_update_deny', {
      for: 'update',
      to: 'openschool_worker',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('schools_worker_delete_deny', {
      for: 'delete',
      to: 'openschool_worker',
      using: sql`false`,
    }),
  ]
).enableRLS()

export type School = typeof schools.$inferSelect
export type NewSchool = typeof schools.$inferInsert
