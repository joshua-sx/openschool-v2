import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TRPCError } from '@trpc/server'
import {
  normalizeSectionMutationError,
  normalizedSectionCode,
  normalizedSectionReason,
} from './sections'

describe('Section service boundaries', () => {
  it('normalizes user-entered codes and reasons', () => {
    assert.equal(normalizedSectionCode('  MATH-101  '), 'MATH-101')
    assert.equal(normalizedSectionReason('  Annual   timetable setup  '), 'Annual timetable setup')
    assert.throws(() => normalizedSectionCode('math 101'), TRPCError)
    assert.throws(() => normalizedSectionReason('x'), TRPCError)
  })

  it('maps database conflicts without exposing implementation details', () => {
    const overlap = normalizeSectionMutationError({ code: '23P01' })
    const stale = normalizeSectionMutationError({ cause: { code: '55000' } })
    const denied = normalizeSectionMutationError({ cause: { cause: { code: '42501' } } })
    assert.ok(overlap instanceof TRPCError)
    assert.equal(overlap.code, 'CONFLICT')
    assert.ok(stale instanceof TRPCError)
    assert.equal(stale.code, 'CONFLICT')
    assert.ok(denied instanceof TRPCError)
    assert.equal(denied.code, 'FORBIDDEN')
  })
})
