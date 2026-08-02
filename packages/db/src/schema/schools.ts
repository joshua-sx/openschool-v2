import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { organizations } from './organizations'
import { ENTITY_STATUS } from './status'
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
  ]
)

export type School = typeof schools.$inferSelect
export type NewSchool = typeof schools.$inferInsert
