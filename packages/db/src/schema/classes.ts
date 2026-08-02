import {
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { schools } from './schools'
import { ENTITY_STATUS } from './status'
import { tenants } from './tenancy'

export const classes = pgTable(
  'classes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      })
      .notNull(),
    schoolId: uuid('school_id').notNull(),
    name: text('name').notNull(),
    gradeLevel: integer('grade_level'),
    academicYear: text('academic_year').notNull(),
    status: text('status', { enum: ['active', 'archived', 'read_only'] })
      .default(ENTITY_STATUS.ACTIVE)
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    unique('classes_tenant_id_id_unique').on(table.tenantId, table.id),
    foreignKey({
      name: 'classes_tenant_school_fk',
      columns: [table.tenantId, table.schoolId],
      foreignColumns: [schools.tenantId, schools.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('classes_tenant_school_idx').on(table.tenantId, table.schoolId),
  ]
)

export type Class = typeof classes.$inferSelect
export type NewClass = typeof classes.$inferInsert
