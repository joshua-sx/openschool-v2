import {
  date,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { schools } from './schools'
import { ENTITY_STATUS } from './status'
import { tenants } from './tenancy'

export const students = pgTable(
  'students',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      })
      .notNull(),
    schoolId: uuid('school_id').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    dateOfBirth: date('date_of_birth'),
    studentNumber: text('student_number'),
    email: text('email'),
    status: text('status', { enum: ['active', 'archived', 'read_only'] })
      .default(ENTITY_STATUS.ACTIVE)
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    unique('students_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('students_tenant_id_student_number_unique').on(table.tenantId, table.studentNumber),
    foreignKey({
      name: 'students_tenant_school_fk',
      columns: [table.tenantId, table.schoolId],
      foreignColumns: [schools.tenantId, schools.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('students_tenant_school_idx').on(table.tenantId, table.schoolId),
  ]
)

export type Student = typeof students.$inferSelect
export type NewStudent = typeof students.$inferInsert
