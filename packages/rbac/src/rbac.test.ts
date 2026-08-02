import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Role } from '../roles'
import { hasPermission } from './rbac'
import type { TenantContext } from './types'

function tenantContext(role: Role, overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    accountId: 'account-1',
    personId: 'person-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    roles: [role],
    ...overrides,
  }
}

describe('hasPermission', () => {
  it('allows an organization administrator to manage students', () => {
    const context = tenantContext('org_admin')

    assert.equal(hasPermission(context, 'students:create'), true)
    assert.equal(hasPermission(context, 'students:delete'), true)
  })

  it('denies permissions that are not assigned to the role', () => {
    const context = tenantContext('teacher')

    assert.equal(hasPermission(context, 'students:delete'), false)
    assert.equal(hasPermission(context, 'settings:org'), false)
  })

  it('limits teachers to their assigned classes', () => {
    const context = tenantContext('teacher')

    assert.equal(
      hasPermission(context, 'grades:create', {
        resourceClassId: 'class-1',
        resourceClassAssigned: true,
      }),
      true
    )
    assert.equal(
      hasPermission(context, 'grades:create', {
        resourceClassId: 'class-2',
        resourceClassAssigned: false,
      }),
      false
    )
  })

  it('limits parents to their linked students', () => {
    const context = tenantContext('parent')

    assert.equal(
      hasPermission(context, 'grades:read', {
        resourceStudentId: 'student-1',
        resourceStudentLinked: true,
      }),
      true
    )
    assert.equal(
      hasPermission(context, 'grades:read', {
        resourceStudentId: 'student-2',
        resourceStudentLinked: false,
      }),
      false
    )
  })

  it('requires an ownership match for self-service access', () => {
    const context = tenantContext('student')

    assert.equal(hasPermission(context, 'students:read', { resourceOwnerId: 'person-1' }), true)
    assert.equal(hasPermission(context, 'students:read', { resourceOwnerId: 'person-2' }), false)
  })

  it('evaluates every current role without choosing one effective role', () => {
    const context = tenantContext('teacher', { roles: ['teacher', 'school_admin'] })

    assert.equal(hasPermission(context, 'grades:create', { resourceClassId: 'class-1' }), false)
    assert.equal(hasPermission(context, 'students:create'), true)
  })
})
