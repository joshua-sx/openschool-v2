import { getDb, auditLogs, type NewAuditLog } from '@openschool/db'
import type { TenantContext } from '@openschool/rbac'
import type { AuditEvent } from './types'

export async function logAuditEvent(
  ctx: TenantContext,
  event: AuditEvent,
  ipAddress?: string
): Promise<void> {
  const db = getDb()

  const log: NewAuditLog = {
    userId: ctx.userId,
    userEmail: ctx.userEmail,
    userRole: ctx.effectiveRole,
    action: event.action,
    resource: event.resource,
    resourceId: event.resourceId,
    orgId: ctx.activeOrgId,
    schoolId: ctx.activeSchoolId,
    oldValues: event.oldValues,
    newValues: event.newValues,
    metadata: event.metadata,
    ipAddress: ipAddress,
  }

  // Fire and forget - don't block the request
  db.insert(auditLogs)
    .values(log)
    .execute()
    .catch((err) => console.error('Audit log failed:', err))
}