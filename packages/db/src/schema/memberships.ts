import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core'
import { users } from './users'
import { organizations } from './organizations'
import { schools } from './schools'
import { classes } from './classes'
import { students } from './student'

// User → Organization membership
export const usersOnOrg = pgTable('users_on_org', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  orgId: uuid('org_id').references(() => organizations.id).notNull(),
  role: text('role', { enum: ['org_admin', 'org_viewer'] }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// User → School membership
export const usersOnSchool = pgTable('users_on_school', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  schoolId: uuid('school_id').references(() => schools.id).notNull(),
  role: text('role', { enum: ['school_admin', 'staff', 'teacher'] }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Teacher → Class assignment
export const teachersOnClass = pgTable('teachers_on_class', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  classId: uuid('class_id').references(() => classes.id).notNull(),
  isPrimary: boolean('is_primary').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Parent → Student relationship
export const parentStudent = pgTable('parent_student', {
  id: uuid('id').primaryKey().defaultRandom(),
  parentId: uuid('parent_id').references(() => users.id).notNull(),
  studentId: uuid('student_id').references(() => students.id).notNull(),
  relationship: text('relationship', {
    enum: ['mother', 'father', 'guardian', 'other'],
  }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type UsersOnOrg = typeof usersOnOrg.$inferSelect
export type UsersOnSchool = typeof usersOnSchool.$inferSelect
export type TeachersOnClass = typeof teachersOnClass.$inferSelect
export type ParentStudent = typeof parentStudent.$inferSelect