import {
  type TenantDatabaseContext,
  auditEvents,
  withPolicyTenantTransaction,
} from '@openschool/db'
import { CAPABILITIES, type PolicyContext, type PolicyDecision } from '@openschool/rbac'
import { and, desc, eq, ne } from 'drizzle-orm'
import {
  appendAuditEventInTransaction,
  recordAuditAttempt,
  toAuditDatabasePolicyContext,
} from './logger'
import type { AuditAppendResult, AuditEventInput, AuditReadPage } from './types'

async function throwAfterRecordingAttempt(
  error: unknown,
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: PolicyDecision,
  input: AuditEventInput
): Promise<never> {
  try {
    await recordAuditAttempt(databaseContext, context, decision, input)
  } catch (evidenceError) {
    throw new AggregateError(
      [error, evidenceError],
      'Protected Audit Ledger operation and its failure evidence both failed'
    )
  }
  throw error
}

function assertAuditReadDecision(decision: PolicyDecision): void {
  if (decision.effect !== 'allow' || decision.capability !== CAPABILITIES.AUDIT_READ) {
    throw new Error('AUDIT_READ_DENIED')
  }
  if (
    !decision.obligations.some(
      (obligation) => obligation.kind === 'audit' && obligation.event === 'audit.read'
    )
  ) {
    throw new Error('AUDIT_OBLIGATION_MISSING')
  }
}

export async function readAuditEvents(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: PolicyDecision,
  options: { limit?: number; purpose?: string } = {}
): Promise<AuditReadPage> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  try {
    assertAuditReadDecision(decision)
  } catch (error) {
    return throwAfterRecordingAttempt(error, databaseContext, context, decision, {
      eventType: 'audit.read',
      outcome: 'denied',
      targetType: 'audit_event',
      dataClasses: ['internal'],
      purpose: options.purpose,
      change: { changedFields: ['policyDecision'] },
    })
  }

  try {
    return await withPolicyTenantTransaction(
      databaseContext,
      toAuditDatabasePolicyContext(decision),
      async (tx) => {
        const receipt = await appendAuditEventInTransaction(
          tx,
          databaseContext,
          context,
          decision,
          {
            eventType: 'audit.read.intent',
            outcome: 'attempted',
            targetType: 'audit_event',
            dataClasses: ['internal'],
            purpose: options.purpose,
            change: { after: { limit } },
          },
          { requireObligation: false }
        )
        const events = await tx
          .select()
          .from(auditEvents)
          .where(
            and(
              eq(auditEvents.tenantId, databaseContext.tenantId),
              ne(auditEvents.id, receipt.eventId)
            )
          )
          .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
          .limit(limit)
        const completion = await appendAuditEventInTransaction(
          tx,
          databaseContext,
          context,
          decision,
          {
            eventType: 'audit.read',
            outcome: 'succeeded',
            targetType: 'audit_event',
            dataClasses: ['internal'],
            purpose: options.purpose,
            preOperationReceiptId: receipt.eventId,
            change: { after: { resultCount: events.length } },
          }
        )
        return { events, receipt, completion }
      }
    )
  } catch (error) {
    return throwAfterRecordingAttempt(error, databaseContext, context, decision, {
      eventType: 'audit.read',
      outcome: 'failed',
      targetType: 'audit_event',
      dataClasses: ['internal'],
      purpose: options.purpose,
      change: { changedFields: ['operation'] },
    })
  }
}

export async function requestAuditExport(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: PolicyDecision,
  input: { format: 'jsonl' | 'csv'; deduplicationKey: string; purpose: string }
): Promise<AuditAppendResult> {
  try {
    assertAuditReadDecision(decision)
  } catch (error) {
    return throwAfterRecordingAttempt(error, databaseContext, context, decision, {
      eventType: 'audit.export.request',
      outcome: 'denied',
      targetType: 'audit_export',
      dataClasses: ['internal'],
      purpose: input.purpose,
      change: { changedFields: ['policyDecision'] },
    })
  }
  try {
    return await withPolicyTenantTransaction(
      databaseContext,
      toAuditDatabasePolicyContext(decision),
      (tx) =>
        appendAuditEventInTransaction(
          tx,
          databaseContext,
          context,
          decision,
          {
            eventType: 'audit.export.request',
            outcome: 'attempted',
            targetType: 'audit_export',
            dataClasses: ['internal'],
            purpose: input.purpose,
            change: { after: { format: input.format } },
            outbox: {
              topic: 'audit.export.requested',
              deduplicationKey: input.deduplicationKey,
              deduplicationMode: 'return_existing',
            },
          },
          { requireObligation: false }
        )
    )
  } catch (error) {
    return throwAfterRecordingAttempt(error, databaseContext, context, decision, {
      eventType: 'audit.export.request',
      outcome: 'failed',
      targetType: 'audit_export',
      dataClasses: ['internal'],
      purpose: input.purpose,
      change: { changedFields: ['operation'] },
    })
  }
}
