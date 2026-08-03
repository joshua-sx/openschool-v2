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
})
