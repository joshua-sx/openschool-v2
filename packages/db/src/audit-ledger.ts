import { and, eq } from 'drizzle-orm'
import { auditEvents, auditOutbox } from './schema'
import type { DatabaseTransaction } from './tenant-transaction'

export interface SanitizedAuditLedgerEvent {
  id?: string
  occurredAt: Date
  eventVersion: number
  eventType: string
  outcome: 'attempted' | 'succeeded' | 'denied' | 'failed'
  tenantId: string
  educationOrganizationId?: string
  schoolId?: string
  actorType: 'account' | 'worker' | 'system' | 'support'
  actorAccountId?: string
  actorPersonId?: string
  capability?: string
  policyVersion?: string
  policyDecision?: Record<string, unknown>
  requestId: string
  correlationId: string
  causationId?: string
  preOperationReceiptId?: string
  supportGrantId?: string
  targetType: string
  targetId?: string
  dataClasses: string[]
  changeSummary: Record<string, unknown>
  purpose?: string
  source: 'web' | 'worker' | 'migration' | 'support' | 'system'
  retentionClass: 'operational' | 'security' | 'financial' | 'safeguarding' | 'legal_hold'
  legalHold?: boolean
}

export interface AuditOutboxRequest {
  topic: string
  deduplicationKey: string
}

export interface AuditLedgerAppendResult {
  eventId: string
  occurredAt: Date
  outboxId?: string
  outboxCreated: boolean
}

/** Deep infrastructure seam. Callers must sanitize and classify every field first. */
export async function appendSanitizedAuditLedgerEvent(
  tx: DatabaseTransaction,
  event: SanitizedAuditLedgerEvent,
  outbox?: AuditOutboxRequest
): Promise<AuditLedgerAppendResult> {
  const eventId = event.id ?? crypto.randomUUID()
  await tx
    .insert(auditEvents)
    .values({ ...event, id: eventId })
    .execute()

  if (!outbox) {
    return { eventId, occurredAt: event.occurredAt, outboxCreated: false }
  }

  const outboxId = crypto.randomUUID()
  const payload = {
    auditEventId: eventId,
    eventVersion: event.eventVersion,
    eventType: event.eventType,
    outcome: event.outcome,
    targetType: event.targetType,
    ...(event.targetId ? { targetId: event.targetId } : {}),
  }
  const context = {
    tenantId: event.tenantId,
    requestId: event.requestId,
    correlationId: event.correlationId,
    ...(event.educationOrganizationId
      ? { educationOrganizationId: event.educationOrganizationId }
      : {}),
    ...(event.schoolId ? { schoolId: event.schoolId } : {}),
  }
  const inserted = await tx
    .insert(auditOutbox)
    .values({
      id: outboxId,
      tenantId: event.tenantId,
      auditEventId: eventId,
      auditEventOccurredAt: event.occurredAt,
      topic: outbox.topic,
      deduplicationKey: outbox.deduplicationKey,
      correlationId: event.correlationId,
      context,
      payload,
    })
    .onConflictDoNothing({
      target: [auditOutbox.tenantId, auditOutbox.deduplicationKey],
    })
    .returning({ id: auditOutbox.id })

  if (inserted[0]) {
    return { eventId, occurredAt: event.occurredAt, outboxId, outboxCreated: true }
  }

  const [existing] = await tx
    .select({
      id: auditOutbox.id,
      auditEventId: auditOutbox.auditEventId,
      topic: auditOutbox.topic,
      correlationId: auditOutbox.correlationId,
    })
    .from(auditOutbox)
    .where(
      and(
        eq(auditOutbox.tenantId, event.tenantId),
        eq(auditOutbox.deduplicationKey, outbox.deduplicationKey)
      )
    )
    .limit(1)
  if (
    !existing ||
    existing.auditEventId !== eventId ||
    existing.topic !== outbox.topic ||
    existing.correlationId !== event.correlationId
  ) {
    throw new Error('AUDIT_OUTBOX_DEDUPLICATION_COLLISION')
  }
  return {
    eventId,
    occurredAt: event.occurredAt,
    outboxId: existing.id,
    outboxCreated: false,
  }
}
