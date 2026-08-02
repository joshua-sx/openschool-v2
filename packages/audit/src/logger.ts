import { type NewAuditLog, auditLogs, getDb } from '@openschool/db'
import type { TenantContext } from '@openschool/rbac'
import type { AuditEvent } from './types'

export async function logAuditEvent(
  ctx: TenantContext,
  event: AuditEvent,
  ipAddress?: string
): Promise<void> {
  const db = getDb()

  const log: NewAuditLog = {
    // New Accounts do not necessarily have a row in the legacy users table.
    // Story #87 will move this evidence into first-class Account-backed columns.
    userId: ctx.legacyUserId,
    userEmail: ctx.userEmail,
    userRole: ctx.roles.join(','),
    action: event.action,
    resource: event.resource,
    resourceId: event.resourceId,
    orgId: ctx.activeEducationOrganizationId,
    schoolId: ctx.activeSchoolId,
    oldValues: event.oldValues,
    newValues: event.newValues,
    metadata: {
      ...event.metadata,
      actorAccountId: ctx.accountId,
      actorPersonId: ctx.personId,
      tenantId: ctx.tenantId,
    },
    ipAddress: ipAddress,
  }

  // Fire and forget - don't block the request
  db.insert(auditLogs)
    .values(log)
    .execute()
    .catch((err) => console.error('Audit log failed:', err))
}
