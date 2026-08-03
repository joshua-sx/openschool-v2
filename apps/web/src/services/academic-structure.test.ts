import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TRPCError } from '@trpc/server'
import { normalizeAcademicMutationError, normalizeAcademicYearInput } from './academic-structure'

const validInput = {
  schoolId: '00000000-0000-4000-8000-000000000101',
  code: '2026-2027',
  name: '2026–2027 Academic Year',
  timeZone: 'America/Lower_Princes',
  startDate: '2026-08-17',
  endDate: '2027-06-30',
  terms: [
    {
      code: 'T1',
      name: 'Term 1',
      startDate: '2026-08-17',
      endDate: '2026-12-18',
    },
    {
      code: 'T2',
      name: 'Term 2',
      startDate: '2027-01-04',
      endDate: '2027-06-30',
    },
  ],
  levels: [{ code: 'G5', name: 'Grade 5', educationStage: 'Primary' }],
} as const

describe('Academic Year input', () => {
  it('normalizes the same primitives for primary and high School labels', () => {
    const primary = normalizeAcademicYearInput(validInput)
    const high = normalizeAcademicYearInput({
      ...validInput,
      terms: [
        {
          code: 'S1',
          name: 'Semester 1',
          startDate: '2026-08-17',
          endDate: '2026-12-18',
        },
      ],
      levels: [{ code: 'F5', name: 'Form 5', educationStage: 'Upper secondary' }],
    })

    assert.equal(primary.levels[0]?.name, 'Grade 5')
    assert.equal(high.levels[0]?.name, 'Form 5')
    assert.equal(primary.timeZone, high.timeZone)
  })

  it('rejects malformed local dates instead of allowing calendar rollover', () => {
    assert.throws(
      () => normalizeAcademicYearInput({ ...validInput, startDate: '2026-02-30' }),
      /valid Academic Year dates/
    )
  })

  it('rejects overlapping or out-of-order Terms before database execution', () => {
    assert.throws(
      () =>
        normalizeAcademicYearInput({
          ...validInput,
          terms: [validInput.terms[0], { ...validInput.terms[1], startDate: '2026-12-18' }],
        }),
      /cannot overlap/
    )
  })

  it('rejects duplicate stable codes within an aggregate', () => {
    assert.throws(
      () =>
        normalizeAcademicYearInput({
          ...validInput,
          levels: [
            validInput.levels[0],
            { code: 'G5', name: 'Fifth Year', educationStage: 'Primary' },
          ],
        }),
      /codes must be unique/
    )
  })
})

describe('Academic Year database errors', () => {
  it('maps exclusion conflicts through nested database causes', () => {
    const normalized = normalizeAcademicMutationError({ cause: { code: '23P01' } })
    assert.ok(normalized instanceof TRPCError)
    assert.equal(normalized.code, 'CONFLICT')
    assert.match(normalized.message, /overlap/)
  })

  it('maps lifecycle guard failures to actionable conflicts', () => {
    const normalized = normalizeAcademicMutationError({ code: '55000' })
    assert.ok(normalized instanceof TRPCError)
    assert.equal(normalized.code, 'CONFLICT')
    assert.match(normalized.message, /lifecycle state/)
  })
})
