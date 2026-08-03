import type { AuditEventRecord } from '@openschool/db'

export const AUDIT_EVENT_VERSION = 1

export type AuditOutcome = 'attempted' | 'succeeded' | 'denied' | 'failed'
export type AuditSource = 'web' | 'worker' | 'migration' | 'support' | 'system'
export type AuditRetentionClass =
  | 'operational'
  | 'security'
  | 'financial'
  | 'safeguarding'
  | 'legal_hold'
export type AuditDataClass =
  | 'internal'
  | 'student_personal'
  | 'financial'
  | 'health'
  | 'safeguarding'
  | 'credential'

export type AuditSummaryValue = string | number | boolean | null

export interface AuditChangeSummaryInput {
  changedFields?: readonly string[]
  before?: Readonly<Record<string, AuditSummaryValue>>
  after?: Readonly<Record<string, AuditSummaryValue>>
}

export interface AuditEventInput {
  eventType: string
  outcome: AuditOutcome
  targetType: string
  targetId?: string
  dataClasses: readonly AuditDataClass[]
  change?: AuditChangeSummaryInput
  purpose?: string
  source?: Extract<AuditSource, 'web' | 'support'>
  retentionClass?: AuditRetentionClass
  legalHold?: boolean
  correlationId?: string
  causationId?: string
  preOperationReceiptId?: string
  supportGrantId?: string
  occurredAt?: Date
  outbox?: {
    topic: string
    deduplicationKey: string
  }
}

export interface AuditAppendResult {
  eventId: string
  occurredAt: Date
  outboxId?: string
  outboxCreated: boolean
}

export interface AuditReadPage {
  events: AuditEventRecord[]
  receipt: AuditAppendResult
  completion: AuditAppendResult
}
