import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  type OrganizationTreeNodeInput,
  OrganizationTreeValidationError,
  buildOrganizationClosure,
  getDescendantOrganizationIds,
  getSiblingOrganizationIds,
  moveOrganization,
  resolveSchoolGovernanceAt,
  resolveTreeVersionAt,
} from './organization-tree'

const originalTree = [
  { organizationId: 'ministry', parentOrganizationId: null },
  { organizationId: 'board', parentOrganizationId: 'ministry' },
  { organizationId: 'network', parentOrganizationId: 'ministry' },
  { organizationId: 'district', parentOrganizationId: 'board' },
] satisfies OrganizationTreeNodeInput[]

describe('Organization Tree', () => {
  it('builds self and ancestor closure edges for inserted nodes', () => {
    const closure = buildOrganizationClosure(originalTree)

    assert.deepEqual(getDescendantOrganizationIds(closure, 'ministry'), [
      'board',
      'network',
      'district',
    ])
    assert.deepEqual(getDescendantOrganizationIds(closure, 'board', true), ['board', 'district'])
    assert.deepEqual(getSiblingOrganizationIds(originalTree, 'board'), ['network'])
  })

  it('creates a new valid shape for a move without mutating the prior version', () => {
    const movedTree = moveOrganization(originalTree, 'district', 'network')
    const movedClosure = buildOrganizationClosure(movedTree)

    assert.equal(
      originalTree.find((node) => node.organizationId === 'district')?.parentOrganizationId,
      'board'
    )
    assert.equal(
      movedTree.find((node) => node.organizationId === 'district')?.parentOrganizationId,
      'network'
    )
    assert.deepEqual(getDescendantOrganizationIds(movedClosure, 'board'), [])
    assert.deepEqual(getDescendantOrganizationIds(movedClosure, 'network'), ['district'])
  })

  it('rejects missing parents, self-parenting, duplicate nodes, and cycles', () => {
    const cases: Array<{
      code: OrganizationTreeValidationError['code']
      nodes: OrganizationTreeNodeInput[]
    }> = [
      {
        code: 'missing_parent',
        nodes: [{ organizationId: 'board', parentOrganizationId: 'missing' }],
      },
      {
        code: 'self_parent',
        nodes: [{ organizationId: 'board', parentOrganizationId: 'board' }],
      },
      {
        code: 'duplicate_organization',
        nodes: [
          { organizationId: 'board', parentOrganizationId: null },
          { organizationId: 'board', parentOrganizationId: null },
        ],
      },
      {
        code: 'cycle',
        nodes: [
          { organizationId: 'board', parentOrganizationId: 'network' },
          { organizationId: 'network', parentOrganizationId: 'board' },
        ],
      },
      {
        code: 'invalid_root_count',
        nodes: [
          { organizationId: 'board', parentOrganizationId: null },
          { organizationId: 'network', parentOrganizationId: null },
        ],
      },
    ]

    for (const testCase of cases) {
      assert.throws(
        () => buildOrganizationClosure(testCase.nodes),
        (error) => error instanceof OrganizationTreeValidationError && error.code === testCase.code
      )
    }
  })

  it('resolves historical tree versions and School governance by effective time', () => {
    const versions = [
      { id: 'v1', effectiveFrom: new Date('2026-01-01T00:00:00Z') },
      { id: 'v2', effectiveFrom: new Date('2026-08-01T00:00:00Z') },
    ]
    const assignments = [
      {
        id: 'g1',
        schoolId: 'school',
        educationOrganizationId: 'board',
        validFrom: new Date('2026-01-01T00:00:00Z'),
        validUntil: new Date('2026-08-01T00:00:00Z'),
      },
      {
        id: 'g2',
        schoolId: 'school',
        educationOrganizationId: 'network',
        validFrom: new Date('2026-08-01T00:00:00Z'),
        validUntil: null,
      },
    ]

    assert.equal(resolveTreeVersionAt(versions, new Date('2026-07-31T23:59:59Z'))?.id, 'v1')
    assert.equal(resolveTreeVersionAt(versions, new Date('2026-08-01T00:00:00Z'))?.id, 'v2')
    assert.equal(
      resolveSchoolGovernanceAt(assignments, 'school', new Date('2026-07-31T23:59:59Z'))
        ?.educationOrganizationId,
      'board'
    )
    assert.equal(
      resolveSchoolGovernanceAt(assignments, 'school', new Date('2026-08-01T00:00:00Z'))
        ?.educationOrganizationId,
      'network'
    )
  })
})
