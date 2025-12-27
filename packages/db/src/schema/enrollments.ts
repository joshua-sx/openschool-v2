import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { students } from './student'
import { classes } from './classes'

export const enrollments = pgTable('enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').references(() => students.id).notNull(),
  classId: uuid('class_id').references(() => classes.id).notNull(),
  enrolledAt: timestamp('enrolled_at').defaultNow().notNull(),
  status: text('status', { enum: ['active', 'withdrawn', 'graduated'] }).default('active'),
})

export type Enrollment = typeof enrollments.$inferSelect
export type NewEnrollment = typeof enrollments.$inferInsert