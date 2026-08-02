import {
  type NewAuditLog,
  type TenantDatabaseContext,
  auditLogs,
  withTenantTransaction,
} from '@openschool/db'
import type { PolicyContext } from '@openschool/rbac'
import type { AuditEvent } from './types'

export async function logAuditEvent(
  databaseContext: TenantDatabaseContext,
  ctx: PolicyContext,
  event: AuditEvent,
  ipAddress?: string
): Promise<void> {
  const log: NewAuditLog = {
    // New Accounts do not necessarily have a row in the legacy users table.
    // Story #87 will move this evidence into first-class Account-backed columns.
    userId: ctx.legacyUserId,
    userEmail: ctx.userEmail,
    userRole: ctx.roleTemplateKeys.join(','),
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

  // Story #88 will make this insert atomic with its product mutation and add
  // tamper evidence. Until then it still runs through the same non-owner,
  // transaction-scoped Tenant boundary and reports failures to the caller.
  await withTenantTransaction(databaseContext, async (db) => {
    await db.insert(auditLogs).values(log).execute()
  })
}
