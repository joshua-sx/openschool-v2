import {
  boolean,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { classes } from './classes'
import { organizations } from './organizations'
import { schools } from './schools'
import { students } from './student'
import { tenants } from './tenancy'
import { users } from './users'

// User → Organization membership
export const usersOnOrg = pgTable(
  'users_on_org',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    orgId: uuid('org_id').notNull(),
    role: text('role', { enum: ['org_admin', 'org_viewer'] }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('users_on_org_tenant_id_id_unique').on(table.tenantId, table.id),
    foreignKey({
      name: 'users_on_org_tenant_organization_fk',
      columns: [table.tenantId, table.orgId],
      foreignColumns: [organizations.tenantId, organizations.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('users_on_org_tenant_user_idx').on(table.tenantId, table.userId),
  ]
)

// User → School membership
export const usersOnSchool = pgTable(
  'users_on_school',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    schoolId: uuid('school_id').notNull(),
    role: text('role', { enum: ['school_admin', 'staff', 'teacher'] }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('users_on_school_tenant_id_id_unique').on(table.tenantId, table.id),
    foreignKey({
      name: 'users_on_school_tenant_school_fk',
      columns: [table.tenantId, table.schoolId],
      foreignColumns: [schools.tenantId, schools.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('users_on_school_tenant_user_idx').on(table.tenantId, table.userId),
  ]
)

// Teacher → Class assignment
export const teachersOnClass = pgTable(
  'teachers_on_class',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    classId: uuid('class_id').notNull(),
    isPrimary: boolean('is_primary').default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('teachers_on_class_tenant_id_id_unique').on(table.tenantId, table.id),
    foreignKey({
      name: 'teachers_on_class_tenant_class_fk',
      columns: [table.tenantId, table.classId],
      foreignColumns: [classes.tenantId, classes.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('teachers_on_class_tenant_user_idx').on(table.tenantId, table.userId),
  ]
)

// Parent → Student relationship
export const parentStudent = pgTable(
  'parent_student',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      })
      .notNull(),
    parentId: uuid('parent_id')
      .references(() => users.id)
      .notNull(),
    studentId: uuid('student_id').notNull(),
    relationship: text('relationship', {
      enum: ['mother', 'father', 'guardian', 'other'],
    }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('parent_student_tenant_id_id_unique').on(table.tenantId, table.id),
    foreignKey({
      name: 'parent_student_tenant_student_fk',
      columns: [table.tenantId, table.studentId],
      foreignColumns: [students.tenantId, students.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('parent_student_tenant_parent_idx').on(table.tenantId, table.parentId),
  ]
)

export type UsersOnOrg = typeof usersOnOrg.$inferSelect
export type UsersOnSchool = typeof usersOnSchool.$inferSelect
export type TeachersOnClass = typeof teachersOnClass.$inferSelect
export type ParentStudent = typeof parentStudent.$inferSelect
