import { createHash } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
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
  deduplicationMode?: 'reject' | 'return_existing'
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function eventFingerprint(event: SanitizedAuditLedgerEvent, topic: string): string {
  const evidence = {
    topic,
    eventVersion: event.eventVersion,
    eventType: event.eventType,
    outcome: event.outcome,
    tenantId: event.tenantId,
    educationOrganizationId: event.educationOrganizationId,
    schoolId: event.schoolId,
    actorType: event.actorType,
    actorAccountId: event.actorAccountId,
    actorPersonId: event.actorPersonId,
    capability: event.capability,
    policyVersion: event.policyVersion,
    policyDecision: event.policyDecision,
    causationId: event.causationId,
    preOperationReceiptId: event.preOperationReceiptId,
    supportGrantId: event.supportGrantId,
    targetType: event.targetType,
    targetId: event.targetId,
    dataClasses: event.dataClasses,
    changeSummary: event.changeSummary,
    purpose: event.purpose,
    source: event.source,
    retentionClass: event.retentionClass,
    legalHold: event.legalHold ?? false,
  }
  return createHash('sha256').update(canonicalJson(evidence)).digest('hex')
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
  const fingerprint = outbox ? eventFingerprint(event, outbox.topic) : undefined
  if (outbox?.deduplicationMode === 'return_existing') {
    const lockKey = `${event.tenantId}:${outbox.deduplicationKey}`
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`)
    const [existing] = await tx
      .select({
        id: auditOutbox.id,
        auditEventId: auditOutbox.auditEventId,
        auditEventOccurredAt: auditOutbox.auditEventOccurredAt,
        topic: auditOutbox.topic,
        payload: auditOutbox.payload,
      })
      .from(auditOutbox)
      .where(
        and(
          eq(auditOutbox.tenantId, event.tenantId),
          eq(auditOutbox.deduplicationKey, outbox.deduplicationKey)
        )
      )
      .limit(1)
    if (existing) {
      if (existing.topic !== outbox.topic || existing.payload.eventFingerprint !== fingerprint) {
        throw new Error('AUDIT_OUTBOX_DEDUPLICATION_COLLISION')
      }
      return {
        eventId: existing.auditEventId,
        occurredAt: existing.auditEventOccurredAt,
        outboxId: existing.id,
        outboxCreated: false,
      }
    }
  }

  const eventId = event.id ?? crypto.randomUUID()
  await tx
    .insert(auditEvents)
    .values({ ...event, id: eventId })
    .execute()

  if (!outbox) {
    return { eventId, occurredAt: event.occurredAt, outboxCreated: false }
  }
  if (!fingerprint) throw new Error('AUDIT_OUTBOX_FINGERPRINT_MISSING')

  const outboxId = crypto.randomUUID()
  const payload = {
    auditEventId: eventId,
    eventVersion: event.eventVersion,
    eventType: event.eventType,
    outcome: event.outcome,
    targetType: event.targetType,
    eventFingerprint: fingerprint,
    ...(event.targetId ? { targetId: event.targetId } : {}),
  }
  const context = {
    tenantId: event.tenantId,
    requestId: event.requestId,
    correlationId: event.correlationId,
    ...(event.actorAccountId ? { actorAccountId: event.actorAccountId } : {}),
    ...(event.actorPersonId ? { actorPersonId: event.actorPersonId } : {}),
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

  throw new Error('AUDIT_OUTBOX_DEDUPLICATION_COLLISION')
}
