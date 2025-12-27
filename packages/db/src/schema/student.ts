import { pgTable, uuid, text, timestamp, date } from 'drizzle-orm/pg-core'
import { schools } from './schools'

export const students = pgTable('students', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id').references(() => schools.id).notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  dateOfBirth: date('date_of_birth'),
  studentNumber: text('student_number').unique(),
  email: text('email'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Student = typeof students.$inferSelect
export type NewStudent = typeof students.$inferInsert