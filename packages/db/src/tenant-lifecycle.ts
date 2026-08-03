import { sql } from 'drizzle-orm'
import type { DatabaseTransaction } from './tenant-transaction'

export const TENANT_LIFECYCLE_ACTIONS = ['suspend', 'reactivate'] as const
export type TenantLifecycleAction = (typeof TENANT_LIFECYCLE_ACTIONS)[number]

export interface TenantLifecycleInput {
  action: TenantLifecycleAction
  tenantId: string
  reason: string
}

export interface TenantLifecycleEffect {
  tenantId: string
  tenantStatus: 'active' | 'suspended'
  auditEventId: string
  outboxId: string
  occurredAt: Date
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface TenantLifecycleRow extends Record<string, unknown> {
  tenantId: string
  tenantStatus: string
  auditEventId: string
  outboxId: string
  occurredAt: Date | string
}

/** Calls the sole database authority allowed to change global Tenant status. */
export async function applyTenantLifecycle(
  transaction: DatabaseTransaction,
  input: TenantLifecycleInput
): Promise<Readonly<TenantLifecycleEffect>> {
  if (!TENANT_LIFECYCLE_ACTIONS.includes(input.action)) {
    throw new Error('TENANT_LIFECYCLE_ACTION_INVALID')
  }
  const tenantId = input.tenantId.toLowerCase()
  if (!UUID.test(tenantId)) throw new Error('TENANT_LIFECYCLE_TARGET_INVALID')
  const reason = input.reason.trim()
  if (reason.length < 3 || reason.length > 512) {
    throw new Error('TENANT_LIFECYCLE_REASON_INVALID')
  }

  const rows = await transaction.execute<TenantLifecycleRow>(sql`
    select
      tenant_id as "tenantId",
      tenant_status as "tenantStatus",
      audit_event_id as "auditEventId",
      outbox_id as "outboxId",
      occurred_at as "occurredAt"
    from openschool_private.apply_tenant_lifecycle(
      ${input.action}::text,
      ${tenantId}::uuid,
      ${reason}::text
    )
  `)
  const row = rows[0]
  const occurredAt =
    row?.occurredAt instanceof Date ? row.occurredAt : new Date(row?.occurredAt ?? '')
  if (
    rows.length !== 1 ||
    !row ||
    row.tenantId !== tenantId ||
    !['active', 'suspended'].includes(row.tenantStatus) ||
    !UUID.test(row.auditEventId) ||
    !UUID.test(row.outboxId) ||
    Number.isNaN(occurredAt.getTime())
  ) {
    throw new Error('TENANT_LIFECYCLE_EFFECT_INVALID')
  }
  return Object.freeze({
    tenantId: row.tenantId,
    tenantStatus: row.tenantStatus as TenantLifecycleEffect['tenantStatus'],
    auditEventId: row.auditEventId,
    outboxId: row.outboxId,
    occurredAt: new Date(occurredAt.getTime()),
  })
}
