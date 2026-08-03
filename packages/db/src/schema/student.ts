import { sql } from 'drizzle-orm'
import {
  date,
  foreignKey,
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { schools } from './schools'
import { ENTITY_STATUS } from './status'
import { STUDENT_ADMITTER_CAPABILITIES } from './student-policy-capabilities'
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
    pgPolicy('students_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') IN (
          'tenant.students.create', 'tenant.students.read',
          'tenant.students.update', 'tenant.students.delete',
          'support.students.read',
          'identity.context.resolve'
        )
        AND public.openschool_student_scope_allows(
          ${table.tenantId}, ${table.schoolId}, ${table.id}
        )
      `,
    }),
    pgPolicy('students_runtime_insert', {
      for: 'insert',
      to: 'openschool_runtime',
      withCheck: sql`false`,
    }),
    pgPolicy('students_runtime_update', {
      for: 'update',
      to: 'openschool_runtime',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('students_runtime_delete', {
      for: 'delete',
      to: 'openschool_runtime',
      using: sql`false`,
    }),
    pgPolicy('students_admitter_select', {
      for: 'select',
      to: 'openschool_student_admitter',
      using: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN (${STUDENT_ADMITTER_CAPABILITIES})
        AND public.openschool_school_scope_allows(${table.tenantId}, ${table.schoolId})
      `,
    }),
    pgPolicy('students_admitter_insert', {
      for: 'insert',
      to: 'openschool_student_admitter',
      withCheck: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.students.create'
        AND public.openschool_school_scope_allows(${table.tenantId}, ${table.schoolId})
      `,
    }),
    pgPolicy('students_admitter_update', {
      for: 'update',
      to: 'openschool_student_admitter',
      using: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.students.update'
        AND public.openschool_school_scope_allows(${table.tenantId}, ${table.schoolId})
      `,
      withCheck: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_student_admitter'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          = 'tenant.students.update'
        AND public.openschool_school_scope_allows(${table.tenantId}, ${table.schoolId})
      `,
    }),
    pgPolicy('students_admitter_delete_deny', {
      for: 'delete',
      to: 'openschool_student_admitter',
      using: sql`false`,
    }),
    pgPolicy('students_worker_select', {
      for: 'select',
      to: 'openschool_worker',
      using: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid`,
    }),
    pgPolicy('students_worker_insert_deny', {
      for: 'insert',
      to: 'openschool_worker',
      withCheck: sql`false`,
    }),
    pgPolicy('students_worker_update_deny', {
      for: 'update',
      to: 'openschool_worker',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('students_worker_delete_deny', {
      for: 'delete',
      to: 'openschool_worker',
      using: sql`false`,
    }),
  ]
).enableRLS()

export type Student = typeof students.$inferSelect
export type NewStudent = typeof students.$inferInsert
