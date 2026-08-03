import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { firstStudentFormError, validateStudentForm } from './student-form'

const complete = {
  schoolId: '00000000-0000-4000-8000-000000000101',
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: '1985-12-10',
  studentNumber: '',
  email: '',
}

describe('student form validation', () => {
  it('keeps adult learners valid and reports fields in form order', () => {
    assert.deepEqual(validateStudentForm(complete, { requireSchool: true }), {})
    const errors = validateStudentForm(
      { ...complete, schoolId: '', firstName: ' ', email: 'invalid' },
      { requireSchool: true }
    )
    assert.deepEqual(errors, {
      schoolId: 'Choose a school',
      firstName: 'Enter a first name',
      email: 'Enter a valid email address',
    })
    assert.equal(firstStudentFormError(errors), 'schoolId')
  })

  it('rejects invalid and future dates without imposing an age ceiling', () => {
    assert.deepEqual(
      validateStudentForm({ ...complete, dateOfBirth: 'not-a-date' }, { requireSchool: false }),
      { dateOfBirth: 'Enter a valid date' }
    )
    assert.deepEqual(
      validateStudentForm({ ...complete, dateOfBirth: '2999-01-01' }, { requireSchool: false }),
      { dateOfBirth: 'Date of birth cannot be in the future' }
    )
  })

  it('compares dates against the local calendar day', () => {
    const now = new Date(2026, 0, 2, 23, 30)
    assert.deepEqual(
      validateStudentForm(
        { ...complete, dateOfBirth: '2026-01-02' },
        { now, requireSchool: false }
      ),
      {}
    )
    assert.deepEqual(
      validateStudentForm(
        { ...complete, dateOfBirth: '2026-01-03' },
        { now, requireSchool: false }
      ),
      { dateOfBirth: 'Date of birth cannot be in the future' }
    )
  })

  it('enforces name, student number, and email length boundaries', () => {
    const emailAtLimit = `${'a'.repeat(314)}@b.com`
    const emailOverLimit = `${'a'.repeat(315)}@b.com`
    assert.equal(emailAtLimit.length, 320)
    assert.equal(emailOverLimit.length, 321)
    assert.deepEqual(
      validateStudentForm(
        {
          ...complete,
          firstName: 'a'.repeat(100),
          lastName: 'b'.repeat(100),
          studentNumber: 'c'.repeat(64),
          email: emailAtLimit,
        },
        { requireSchool: false }
      ),
      {}
    )
    assert.deepEqual(
      validateStudentForm(
        {
          ...complete,
          firstName: 'a'.repeat(101),
          lastName: 'b'.repeat(101),
          studentNumber: 'c'.repeat(65),
          email: emailOverLimit,
        },
        { requireSchool: false }
      ),
      {
        firstName: 'Use 100 characters or fewer',
        lastName: 'Use 100 characters or fewer',
        studentNumber: 'Use 64 characters or fewer',
        email: 'Use 320 characters or fewer',
      }
    )
  })
})
