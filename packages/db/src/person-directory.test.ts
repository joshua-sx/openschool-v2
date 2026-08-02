import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isEffectiveRecord,
  normalizePersonEmail,
  normalizePersonName,
  scoreDuplicatePersonCandidate,
} from './person-directory'

const NOW = new Date('2026-08-02T12:00:00Z')

describe('Person directory', () => {
  it('normalizes human-entered names and emails without storing a global Person key', () => {
    assert.equal(normalizePersonName('  TAYLOR   James  '), 'taylor james')
    assert.equal(normalizePersonName('Ａｖａ Martinez'), 'ava martinez')
    assert.equal(normalizePersonEmail('  Admin@Example.TEST '), 'admin@example.test')
  })

  it('authorizes only active records inside their half-open effective period', () => {
    const cases = [
      { status: 'active', validFrom: new Date('2026-01-01Z'), validUntil: null, expected: true },
      { status: 'active', validFrom: new Date('2026-09-01Z'), validUntil: null, expected: false },
      {
        status: 'active',
        validFrom: new Date('2026-01-01Z'),
        validUntil: NOW,
        expected: false,
      },
      {
        status: 'suspended',
        validFrom: new Date('2026-01-01Z'),
        validUntil: null,
        expected: false,
      },
      { status: 'revoked', validFrom: new Date('2026-01-01Z'), validUntil: null, expected: false },
      { status: 'expired', validFrom: new Date('2026-01-01Z'), validUntil: NOW, expected: false },
      { status: 'pending', validFrom: null, validUntil: null, expected: false },
    ]

    for (const testCase of cases) {
      assert.equal(isEffectiveRecord(testCase, NOW), testCase.expected)
    }
  })

  it('ranks same-Tenant duplicate evidence but never decides a merge', () => {
    const exact = scoreDuplicatePersonCandidate(
      {
        id: 'person-a',
        tenantId: 'tenant-a',
        displayName: 'Taylor James',
        normalizedDisplayName: 'taylor james',
        normalizedEmail: 'taylor@example.test',
        dateOfBirth: '1980-01-02',
      },
      {
        tenantId: 'tenant-a',
        displayName: ' TAYLOR  JAMES ',
        email: 'TAYLOR@example.test',
        dateOfBirth: '1980-01-02',
      }
    )

    assert.equal(exact.score, 100)
    assert.deepEqual(exact.reasons, ['same_email', 'same_name', 'same_date_of_birth'])
  })
})
