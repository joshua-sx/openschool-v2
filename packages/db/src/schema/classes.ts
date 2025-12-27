import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core'
import { schools } from './schools'

export const classes = pgTable('classes', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id').references(() => schools.id).notNull(),
  name: text('name').notNull(),
  gradeLevel: integer('grade_level'),
  academicYear: text('academic_year').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Class = typeof classes.$inferSelect
export type NewClass = typeof classes.$inferInsert