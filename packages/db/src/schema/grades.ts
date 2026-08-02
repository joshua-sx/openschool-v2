import {
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { enrollments } from './enrollments'
import { tenants } from './tenancy'
import { users } from './users'

export const grades = pgTable(
  'grades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      })
      .notNull(),
    enrollmentId: uuid('enrollment_id').notNull(),
    assignmentName: text('assignment_name').notNull(),
    score: numeric('score', { precision: 5, scale: 2 }),
    maxScore: numeric('max_score', { precision: 5, scale: 2 }).default('100'),
    gradedBy: uuid('graded_by').references(() => users.id),
    gradedAt: timestamp('graded_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    unique('grades_tenant_id_id_unique').on(table.tenantId, table.id),
    foreignKey({
      name: 'grades_tenant_enrollment_fk',
      columns: [table.tenantId, table.enrollmentId],
      foreignColumns: [enrollments.tenantId, enrollments.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('grades_tenant_enrollment_idx').on(table.tenantId, table.enrollmentId),
  ]
)

export type Grade = typeof grades.$inferSelect
export type NewGrade = typeof grades.$inferInsert
