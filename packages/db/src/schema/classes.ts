import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core'
import { schools } from './schools'
import { ENTITY_STATUS } from './status'

export const classes = pgTable('classes', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id').references(() => schools.id).notNull(),
  name: text('name').notNull(),
  gradeLevel: integer('grade_level'),
  academicYear: text('academic_year').notNull(),
  status: text('status', { enum: ['active', 'archived', 'read_only'] })
    .default(ENTITY_STATUS.ACTIVE)
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Class = typeof classes.$inferSelect
export type NewClass = typeof classes.$inferInsert