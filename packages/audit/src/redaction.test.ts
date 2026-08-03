import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { sanitizeAuditChangeSummary, validateAuditDataClasses } from './redaction'

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
      /AUDIT_REDACTION_FIELD_NOT_ALLOWLISTED:email/
    )
    assert.throws(
      () =>
        sanitizeAuditChangeSummary('future.event', { after: { accessToken: 'secret' } }, [
          'credential',
        ]),
      /AUDIT_REDACTION_CLASS_VALUES_FORBIDDEN/
    )
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
