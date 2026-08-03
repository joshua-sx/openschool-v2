import { sql } from 'drizzle-orm'

export const STUDENT_ADMITTER_CAPABILITIES = sql`
  'tenant.students.create', 'tenant.students.update',
  'tenant.student_enrollments.manage'
`
