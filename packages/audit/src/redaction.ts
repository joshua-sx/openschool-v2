import type { AuditChangeSummaryInput, AuditDataClass, AuditSummaryValue } from './types'

const SAFE_NAME = /^[a-z][A-Za-z0-9]{0,63}$/
const BLOCKED_VALUE_FIELD =
  /password|passcode|secret|token|credential|medical|health|diagnos|safeguard|note|email|phone|address|birth|ssn|national|payment|card/i
const VALUE_FIELD_ALLOWLIST: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
  'student.create': new Set(['schoolId', 'status']),
  'student.update': new Set(['schoolId', 'status']),
  'account_link.activate': new Set(['status', 'membershipVersion']),
  'account_link.revoke': new Set(['status', 'membershipVersion']),
  'audit.read.intent': new Set(['limit']),
  'audit.read': new Set(['resultCount']),
  'audit.export.request': new Set(['format']),
})
const VALUE_FREE_CLASSES = new Set<AuditDataClass>(['health', 'safeguarding', 'credential'])
const DATA_CLASSES = new Set<AuditDataClass>([
  'internal',
  'student_personal',
  'financial',
  'health',
  'safeguarding',
  'credential',
])

function assertSafeSummaryValue(field: string, value: AuditSummaryValue): void {
  if (BLOCKED_VALUE_FIELD.test(field)) {
    throw new Error(`AUDIT_REDACTION_BLOCKED_FIELD:${field}`)
  }
  if (typeof value === 'string' && value.length > 256) {
    throw new Error(`AUDIT_REDACTION_VALUE_TOO_LONG:${field}`)
  }
  if (!['string', 'number', 'boolean'].includes(typeof value) && value !== null) {
    throw new Error(`AUDIT_REDACTION_UNSUPPORTED_VALUE:${field}`)
  }
}

function sanitizeValueMap(
  eventType: string,
  values: Readonly<Record<string, AuditSummaryValue>> | undefined,
  dataClasses: readonly AuditDataClass[]
): Readonly<Record<string, AuditSummaryValue>> | undefined {
  if (!values) return undefined
  if (dataClasses.some((dataClass) => VALUE_FREE_CLASSES.has(dataClass))) {
    throw new Error('AUDIT_REDACTION_CLASS_VALUES_FORBIDDEN')
  }
  const allowedFields = VALUE_FIELD_ALLOWLIST[eventType] ?? new Set<string>()
  const sanitized: Record<string, AuditSummaryValue> = {}
  for (const [field, value] of Object.entries(values)) {
    if (!allowedFields.has(field)) throw new Error(`AUDIT_REDACTION_FIELD_NOT_ALLOWLISTED:${field}`)
    assertSafeSummaryValue(field, value)
    sanitized[field] = value
  }
  return Object.freeze(sanitized)
}

export function sanitizeAuditChangeSummary(
  eventType: string,
  change: AuditChangeSummaryInput | undefined,
  dataClasses: readonly AuditDataClass[]
): Readonly<Record<string, unknown>> {
  const changedFields = [...new Set(change?.changedFields ?? [])].sort()
  if (changedFields.length > 64) throw new Error('AUDIT_REDACTION_TOO_MANY_FIELDS')
  for (const field of changedFields) {
    if (!SAFE_NAME.test(field)) throw new Error(`AUDIT_REDACTION_INVALID_FIELD:${field}`)
  }
  const before = sanitizeValueMap(eventType, change?.before, dataClasses)
  const after = sanitizeValueMap(eventType, change?.after, dataClasses)
  return Object.freeze({
    ...(changedFields.length > 0 ? { changedFields: Object.freeze(changedFields) } : {}),
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
  })
}

export function validateAuditDataClasses(
  dataClasses: readonly AuditDataClass[]
): readonly AuditDataClass[] {
  const unique = [...new Set(dataClasses)].sort()
  if (unique.length < 1 || unique.length > 8) {
    throw new Error('AUDIT_DATA_CLASSES_REQUIRED')
  }
  if (unique.some((dataClass) => !DATA_CLASSES.has(dataClass))) {
    throw new Error('AUDIT_DATA_CLASS_INVALID')
  }
  return Object.freeze(unique)
}
