import {
  type DatabasePolicyContext,
  type DatabaseTransaction,
  type SanitizedAuditLedgerEvent,
  type TenantDatabaseContext,
  appendSanitizedAuditLedgerEvent,
  withTenantTransaction,
} from '@openschool/db'
import type { PolicyContext, PolicyDecision } from '@openschool/rbac'
import { sanitizeAuditChangeSummary, validateAuditDataClasses } from './redaction'
import { AUDIT_EVENT_VERSION, type AuditAppendResult, type AuditEventInput } from './types'

const EVENT_TYPE = /^[a-z][a-z0-9_.]{2,127}$/
const PURPOSE_CODE = /^[a-z][a-z0-9_.-]{2,63}$/
const SAFE_REFERENCE = /^[A-Za-z0-9_.:/-]{1,512}$/
const UUID_REFERENCE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function assertContextBinding(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext
): asserts context is PolicyContext & { tenantId: string } {
  if (
    !context.tenantId ||
    databaseContext.accountId !== context.accountId ||
    databaseContext.personId !== context.personId ||
    databaseContext.tenantId !== context.tenantId ||
    databaseContext.activeEducationOrganizationId !== context.activeEducationOrganizationId ||
    databaseContext.activeSchoolId !== context.activeSchoolId
  ) {
    throw new Error('AUDIT_CONTEXT_MISMATCH')
  }
}

function policyDecisionReference(decision: PolicyDecision): Readonly<Record<string, unknown>> {
  return Object.freeze({
    effect: decision.effect,
    reason: decision.reason,
    capability: decision.capability,
    policyVersion: decision.policyVersion,
    ...(decision.requestedScope ? { requestedScope: decision.requestedScope } : {}),
    matchedGrantIds: Object.freeze(decision.matchedGrants.map(({ grantId }) => grantId).sort()),
    obligationKinds: Object.freeze(decision.obligations.map(({ kind }) => kind).sort()),
    queryScopeKinds: Object.freeze(decision.queryConstraints.map(({ kind }) => kind).sort()),
  })
}

function assertAuditInput(input: AuditEventInput): void {
  if (!EVENT_TYPE.test(input.eventType)) throw new Error('AUDIT_EVENT_TYPE_INVALID')
  if (!EVENT_TYPE.test(input.targetType)) throw new Error('AUDIT_TARGET_TYPE_INVALID')
  if (input.targetId && !SAFE_REFERENCE.test(input.targetId)) {
    throw new Error('AUDIT_TARGET_ID_INVALID')
  }
  if (input.purpose && !PURPOSE_CODE.test(input.purpose)) {
    throw new Error('AUDIT_PURPOSE_MUST_BE_CODE')
  }
  for (const value of [input.causationId, input.preOperationReceiptId, input.supportGrantId]) {
    if (value && !UUID_REFERENCE.test(value)) throw new Error('AUDIT_UUID_REFERENCE_INVALID')
  }
  if (input.occurredAt && Number.isNaN(input.occurredAt.getTime())) {
    throw new Error('AUDIT_OCCURRED_AT_INVALID')
  }
  for (const value of [input.correlationId, input.outbox?.deduplicationKey]) {
    if (value && !SAFE_REFERENCE.test(value)) throw new Error('AUDIT_REFERENCE_INVALID')
  }
  if (input.outbox && !EVENT_TYPE.test(input.outbox.topic)) {
    throw new Error('AUDIT_OUTBOX_TOPIC_INVALID')
  }
  if (input.source === 'support' && !input.supportGrantId) {
    throw new Error('AUDIT_SUPPORT_GRANT_REQUIRED')
  }
  if (input.supportGrantId && !input.purpose) {
    throw new Error('AUDIT_SUPPORT_PURPOSE_REQUIRED')
  }
  if (input.supportGrantId && input.source === 'web') {
    throw new Error('AUDIT_SUPPORT_SOURCE_REQUIRED')
  }
}

function assertRequiredAuditObligation(decision: PolicyDecision, eventType: string): void {
  if (
    decision.effect !== 'allow' ||
    !decision.obligations.some(
      (obligation) => obligation.kind === 'audit' && obligation.event === eventType
    )
  ) {
    throw new Error('AUDIT_OBLIGATION_MISSING')
  }
}

function databasePolicyContext(decision: PolicyDecision): DatabasePolicyContext {
  if (decision.effect !== 'allow') throw new Error('AUDIT_POLICY_DECISION_DENIED')
  const queryConstraints = decision.queryConstraints.map((constraint) => {
    if (constraint.kind === 'platform') throw new Error('AUDIT_PLATFORM_SCOPE_UNSUPPORTED')
    return Object.freeze({ ...constraint })
  })
  return {
    capability: decision.capability,
    policyVersion: decision.policyVersion,
    queryConstraints,
  }
}

export function toAuditDatabasePolicyContext(decision: PolicyDecision): DatabasePolicyContext {
  return databasePolicyContext(decision)
}

export async function appendAuditEventInTransaction(
  tx: DatabaseTransaction,
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: PolicyDecision,
  input: AuditEventInput,
  options: { requireObligation?: boolean } = {}
): Promise<AuditAppendResult> {
  assertContextBinding(databaseContext, context)
  assertAuditInput(input)
  if (options.requireObligation !== false) {
    assertRequiredAuditObligation(decision, input.eventType)
  }
  const dataClasses = validateAuditDataClasses(input.dataClasses)
  const occurredAt = input.occurredAt ?? new Date()
  const source = input.source ?? (input.supportGrantId ? 'support' : 'web')
  const event: SanitizedAuditLedgerEvent = {
    occurredAt,
    eventVersion: AUDIT_EVENT_VERSION,
    eventType: input.eventType,
    outcome: input.outcome,
    tenantId: context.tenantId,
    ...(context.activeEducationOrganizationId
      ? { educationOrganizationId: context.activeEducationOrganizationId }
      : {}),
    ...(context.activeSchoolId ? { schoolId: context.activeSchoolId } : {}),
    actorType: input.supportGrantId ? 'support' : 'account',
    actorAccountId: context.accountId,
    actorPersonId: context.personId,
    capability: decision.capability,
    policyVersion: decision.policyVersion,
    policyDecision: policyDecisionReference(decision),
    requestId: databaseContext.requestId,
    correlationId: input.correlationId ?? databaseContext.requestId,
    ...(input.causationId ? { causationId: input.causationId } : {}),
    ...(input.preOperationReceiptId ? { preOperationReceiptId: input.preOperationReceiptId } : {}),
    ...(input.supportGrantId ? { supportGrantId: input.supportGrantId } : {}),
    targetType: input.targetType,
    ...(input.targetId ? { targetId: input.targetId } : {}),
    dataClasses: [...dataClasses],
    changeSummary: { ...sanitizeAuditChangeSummary(input.eventType, input.change, dataClasses) },
    ...(input.purpose ? { purpose: input.purpose } : {}),
    source,
    retentionClass: input.retentionClass ?? 'security',
    ...(input.legalHold ? { legalHold: true } : {}),
  }
  return appendSanitizedAuditLedgerEvent(tx, event, input.outbox)
}

/** Records a denied or failed attempt in a separate durable transaction. */
export async function recordAuditAttempt(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: PolicyDecision,
  input: AuditEventInput
): Promise<AuditAppendResult> {
  if (input.outcome !== 'denied' && input.outcome !== 'failed') {
    throw new Error('AUDIT_ATTEMPT_OUTCOME_INVALID')
  }
  assertContextBinding(databaseContext, context)
  return withTenantTransaction(databaseContext, (tx) =>
    appendAuditEventInTransaction(tx, databaseContext, context, decision, input, {
      requireObligation: false,
    })
  )
}
