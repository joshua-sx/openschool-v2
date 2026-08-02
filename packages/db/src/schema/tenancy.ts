import { sql } from 'drizzle-orm'
import { check, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').unique().notNull(),
    status: text('status', { enum: ['active', 'suspended', 'archived'] })
      .default('active')
      .notNull(),
    settings: jsonb('settings').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('tenants_status_check', sql`${table.status} IN ('active', 'suspended', 'archived')`),
  ]
)

export const tenantPlacements = pgTable(
  'tenant_placements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    adapter: text('adapter', { enum: ['pooled'] })
      .default('pooled')
      .notNull(),
    placementKey: text('placement_key').default('primary').notNull(),
    region: text('region'),
    status: text('status', { enum: ['active', 'migrating', 'disabled'] })
      .default('active')
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('tenant_placements_tenant_id_unique').on(table.tenantId),
    check('tenant_placements_adapter_check', sql`${table.adapter} = 'pooled'`),
    check(
      'tenant_placements_status_check',
      sql`${table.status} IN ('active', 'migrating', 'disabled')`
    ),
  ]
)

export type Tenant = typeof tenants.$inferSelect
export type NewTenant = typeof tenants.$inferInsert
export type TenantPlacement = typeof tenantPlacements.$inferSelect
export type NewTenantPlacement = typeof tenantPlacements.$inferInsert
