import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  AUDIT_VALUE_FIELD_ALLOWLIST,
  sanitizeAuditChangeSummary,
  validateAuditDataClasses,
} from './redaction'

describe('Audit Ledger redaction', () => {
  it('retains only explicitly allowlisted non-sensitive values', () => {
    assert.deepEqual(
      sanitizeAuditChangeSummary(
        'student.update',
        {
          changedFields: ['status', 'email', 'status'],
          before: { schoolId: 'school-a', status: 'active' },
          after: { schoolId: 'school-a', status: 'archived' },
        },
        ['student_personal']
      ),
      {
        changedFields: ['email', 'status'],
        before: { schoolId: 'school-a', status: 'active' },
        after: { schoolId: 'school-a', status: 'archived' },
      }
    )
  })

  it('rejects unallowlisted and sensitive value fields', () => {
    assert.throws(
      () =>
        sanitizeAuditChangeSummary('student.update', { after: { email: 'student@example.test' } }, [
          'student_personal',
        ]),
      /AUDIT_REDACTION_BLOCKED_FIELD:email/
    )
    assert.throws(
      () =>
        sanitizeAuditChangeSummary('student.update', { after: { nickname: 'Student' } }, [
          'student_personal',
        ]),
      /AUDIT_REDACTION_FIELD_NOT_ALLOWLISTED:nickname/
    )
    assert.throws(
      () =>
        sanitizeAuditChangeSummary('future.event', { after: { accessToken: 'secret' } }, [
          'credential',
        ]),
      /AUDIT_REDACTION_CLASS_VALUES_FORBIDDEN/
    )
    assert.throws(
      () =>
        sanitizeAuditChangeSummary('student.update', { after: { status: 'a'.repeat(257) } }, [
          'student_personal',
        ]),
      /AUDIT_REDACTION_VALUE_TOO_LONG:status/
    )
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assert.throws(
        () =>
          sanitizeAuditChangeSummary('student.update', { after: { status: value } }, [
            'student_personal',
          ]),
        /AUDIT_REDACTION_UNSUPPORTED_VALUE:status/
      )
    }
  })

  it('keeps the application and database value allowlists identical', () => {
    const migration = readFileSync(
      new URL('../../db/migrations/0015_atomic_audit_outbox.sql', import.meta.url),
      'utf8'
    )
    const databaseAllowlist: Record<string, string[]> = {}
    const casePattern =
      /WHEN\s+((?:'[^']+'(?:,\s*)?)+)\s+THEN\s+allowed_value_fields := ARRAY\[([^\]]*)\];/g
    for (const match of migration.matchAll(casePattern)) {
      const eventTypes = [...(match[1] ?? '').matchAll(/'([^']+)'/g)].map(
        (eventMatch) => eventMatch[1] ?? ''
      )
      const fields = [...(match[2] ?? '').matchAll(/'([^']+)'/g)].map(
        (fieldMatch) => fieldMatch[1] ?? ''
      )
      for (const eventType of eventTypes) databaseAllowlist[eventType] = fields
    }
    assert.deepEqual(databaseAllowlist, AUDIT_VALUE_FIELD_ALLOWLIST)
  })

  it('forbids every value for health, safeguarding, and credential evidence', () => {
    for (const dataClass of ['health', 'safeguarding', 'credential'] as const) {
      assert.throws(
        () =>
          sanitizeAuditChangeSummary('student.update', { after: { status: 'active' } }, [
            dataClass,
          ]),
        /AUDIT_REDACTION_CLASS_VALUES_FORBIDDEN/
      )
      assert.deepEqual(
        sanitizeAuditChangeSummary('student.update', { changedFields: ['status'] }, [dataClass]),
        { changedFields: ['status'] }
      )
    }
  })

  it('requires a bounded, deduplicated data classification', () => {
    assert.deepEqual(validateAuditDataClasses(['internal', 'internal', 'financial']), [
      'financial',
      'internal',
    ])
    assert.throws(() => validateAuditDataClasses([]), /AUDIT_DATA_CLASSES_REQUIRED/)
    assert.throws(
      () => validateAuditDataClasses(['student_personal', 'not-a-class' as never]),
      /AUDIT_DATA_CLASS_INVALID/
    )
  })
})
