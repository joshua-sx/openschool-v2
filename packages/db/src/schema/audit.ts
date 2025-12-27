import { pgTable, uuid, text, timestamp, jsonb, inet } from 'drizzle-orm/pg-core'
import { users } from './users'

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Who
  userId: uuid('user_id').references(() => users.id),
  userEmail: text('user_email'),
  userRole: text('user_role'),
  
  // What
  action: text('action').notNull(), // create, read, update, delete
  resource: text('resource').notNull(), // student, grade, class, etc.
  resourceId: uuid('resource_id'),
  
  // Context
  orgId: uuid('org_id'),
  schoolId: uuid('school_id'),
  
  // Details
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
  metadata: jsonb('metadata'),
  
  // When/Where
  ipAddress: inet('ip_address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert