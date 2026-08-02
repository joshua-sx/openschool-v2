import { foreignKey, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { classes } from './classes'
import { students } from './student'
import { tenants } from './tenancy'

export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      })
      .notNull(),
    studentId: uuid('student_id').notNull(),
    classId: uuid('class_id').notNull(),
    enrolledAt: timestamp('enrolled_at').defaultNow().notNull(),
    status: text('status', { enum: ['active', 'withdrawn', 'graduated'] }).default('active'),
  },
  (table) => [
    unique('enrollments_tenant_id_id_unique').on(table.tenantId, table.id),
    foreignKey({
      name: 'enrollments_tenant_student_fk',
      columns: [table.tenantId, table.studentId],
      foreignColumns: [students.tenantId, students.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'enrollments_tenant_class_fk',
      columns: [table.tenantId, table.classId],
      foreignColumns: [classes.tenantId, classes.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('enrollments_tenant_student_idx').on(table.tenantId, table.studentId),
    index('enrollments_tenant_class_idx').on(table.tenantId, table.classId),
  ]
)

export type Enrollment = typeof enrollments.$inferSelect
export type NewEnrollment = typeof enrollments.$inferInsert
