import { pgTable, uuid, text, timestamp, integer, numeric } from 'drizzle-orm/pg-core'
import { enrollments } from './enrollments'
import { users } from './users'

export const grades = pgTable('grades', {
  id: uuid('id').primaryKey().defaultRandom(),
  enrollmentId: uuid('enrollment_id').references(() => enrollments.id).notNull(),
  assignmentName: text('assignment_name').notNull(),
  score: numeric('score', { precision: 5, scale: 2 }),
  maxScore: numeric('max_score', { precision: 5, scale: 2 }).default('100'),
  gradedBy: uuid('graded_by').references(() => users.id),
  gradedAt: timestamp('graded_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Grade = typeof grades.$inferSelect
export type NewGrade = typeof grades.$inferInsert