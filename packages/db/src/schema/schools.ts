import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { organizations } from './organizations'

export const schools = pgTable('schools', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id).notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  address: text('address'),
  phone: text('phone'),
  settings: jsonb('settings').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type School = typeof schools.$inferSelect
export type NewSchool = typeof schools.$inferInsert