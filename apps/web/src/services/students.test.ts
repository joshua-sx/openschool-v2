import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { validateStudentData, validateStudentUpdateData } from './students'

describe('student validation', () => {
  it('requires names when validating a complete student record', () => {
    assert.deepEqual(validateStudentData({ email: 'a@b.com' }), [
      { field: 'firstName', message: 'First name is required' },
      { field: 'lastName', message: 'Last name is required' },
    ])
  })

  it('allows an email-only partial update', () => {
    assert.deepEqual(validateStudentUpdateData({ email: 'a@b.com' }), [])
  })

  it('validates only fields supplied in a partial update', () => {
    assert.deepEqual(validateStudentUpdateData({ firstName: '  ' }), [
      { field: 'firstName', message: 'First name is required' },
    ])
    assert.deepEqual(validateStudentUpdateData({ email: 'invalid' }), [
      { field: 'email', message: 'Enter a valid email address' },
    ])
  })

  it('accepts adult learners while rejecting future or invalid dates', () => {
    assert.deepEqual(
      validateStudentData({
        firstName: 'Ada',
        lastName: 'Lovelace',
        dateOfBirth: '1985-12-10',
      }),
      []
    )
    assert.deepEqual(validateStudentUpdateData({ dateOfBirth: 'not-a-date' }), [
      { field: 'dateOfBirth', message: 'Enter a valid date of birth' },
    ])
    assert.deepEqual(validateStudentUpdateData({ dateOfBirth: '2999-01-01' }), [
      { field: 'dateOfBirth', message: 'Date of birth cannot be in the future' },
    ])
  })
})
