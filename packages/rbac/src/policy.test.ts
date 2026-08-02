import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CURRENT_POLICY_BUNDLE,
  POLICY_VERSION_CURRENT,
  POLICY_VERSION_LEGACY_PARITY,
  selectPolicyBundle,
} from './default-policy'
import { evaluatePolicy } from './policy'
import { createPolicyBundle } from './policy-bundle'
import { CAPABILITIES } from './registry'
import type { PolicyContext, PolicyEvaluationRequest } from './types'

const NOW = new Date('2026-08-02T12:00:00Z')

function context(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    accountId: 'account-1',
    personId: 'person-1',
    tenantId: 'tenant-1',
    roleTemplateKeys: ['school_admin'],
    assuranceLevel: 'aal1',
    activeSchoolId: 'school-1',
    ...overrides,
  }
}

function decision(
  overrides: Partial<PolicyEvaluationRequest> = {}
): ReturnType<typeof evaluatePolicy> {
  return evaluatePolicy({
    bundle: CURRENT_POLICY_BUNDLE,
    context: context(),
    capability: CAPABILITIES.STUDENTS_READ,
    resource: { kind: 'student', tenantId: 'tenant-1' },
    attributes: { now: NOW },
    ...overrides,
  })
}

describe('capability Policy Decisions', () => {
  it('fails closed for unknown or missing policy inputs', () => {
    assert.equal(decision({ bundle: undefined }).reason, 'UNKNOWN_POLICY_VERSION')
    assert.equal(decision({ context: null }).reason, 'CONTEXT_MISSING')
    assert.equal(decision({ capability: 'tenant.students.export' }).reason, 'UNKNOWN_CAPABILITY')
    assert.equal(decision({ requestedScope: 'district' }).reason, 'UNKNOWN_SCOPE')
    assert.equal(decision({ resource: { kind: 'secret_record' } }).reason, 'UNKNOWN_RESOURCE')
    assert.equal(
      decision({ resource: { kind: 'school', tenantId: 'tenant-1' } }).reason,
      'RESOURCE_KIND_MISMATCH'
    )
    assert.equal(
      decision({ resource: { kind: 'student', tenantId: 'tenant-2' } }).reason,
      'TENANT_MISMATCH'
    )
    assert.equal(
      decision({ context: context({ roleTemplateKeys: ['unknown_role'] }) }).reason,
      'UNKNOWN_ROLE_TEMPLATE'
    )
  })

  it('returns stable denial evidence including policy version', () => {
    const denied = decision({
      context: context({ roleTemplateKeys: ['teacher'] }),
      capability: CAPABILITIES.STUDENTS_DELETE,
    })

    assert.deepEqual(
      {
        effect: denied.effect,
        reason: denied.reason,
        policyVersion: denied.policyVersion,
        matchedGrants: denied.matchedGrants,
        queryConstraints: denied.queryConstraints,
      },
      {
        effect: 'deny',
        reason: 'SCOPE_NOT_GRANTED',
        policyVersion: POLICY_VERSION_CURRENT,
        matchedGrants: [],
        queryConstraints: [],
      }
    )
  })

  it('combines multiple roles as a union without numeric rank', () => {
    const teacherOnly = decision({
      context: context({ roleTemplateKeys: ['teacher'] }),
      capability: CAPABILITIES.STUDENTS_DELETE,
    })
    const combined = decision({
      context: context({ roleTemplateKeys: ['teacher', 'school_admin'] }),
      capability: CAPABILITIES.STUDENTS_DELETE,
    })
    const reversed = decision({
      context: context({ roleTemplateKeys: ['school_admin', 'teacher'] }),
      capability: CAPABILITIES.STUDENTS_DELETE,
    })

    assert.equal(teacherOnly.effect, 'deny')
    assert.equal(combined.effect, 'allow')
    assert.deepEqual(combined, reversed)
    assert.equal(combined.matchedGrant.assignedRoleTemplateKey, 'school_admin')
  })

  it('keeps every valid query constraint when multiple roles grant access', () => {
    const allowed = decision({
      context: context({ roleTemplateKeys: ['parent', 'school_admin'] }),
    })

    assert.equal(allowed.effect, 'allow')
    assert.deepEqual(
      allowed.queryConstraints.map(({ kind }) => kind),
      ['linked_student', 'school']
    )
  })

  it('limits teachers to assigned-class queries and denies school-wide scope', () => {
    const teacher = context({ roleTemplateKeys: ['teacher'] })
    const assigned = decision({
      context: teacher,
      resource: {
        kind: 'student',
        tenantId: 'tenant-1',
        schoolId: 'school-1',
        classId: 'class-1',
      },
      attributes: { now: NOW, relationship: { classAssigned: true } },
    })
    const unassigned = decision({
      context: teacher,
      resource: { kind: 'student', tenantId: 'tenant-1', classId: 'class-2' },
      attributes: { now: NOW, relationship: { classAssigned: false } },
    })
    const schoolWide = decision({ context: teacher, requestedScope: 'school' })

    assert.equal(assigned.effect, 'allow')
    assert.deepEqual(assigned.queryConstraints, [
      {
        kind: 'class',
        tenantId: 'tenant-1',
        actorPersonId: 'person-1',
        classId: 'class-1',
        schoolId: 'school-1',
      },
    ])
    assert.equal(unassigned.reason, 'RESOURCE_SCOPE_MISMATCH')
    assert.equal(schoolWide.reason, 'SCOPE_NOT_GRANTED')
  })

  it('limits guardians to linked students and related classes', () => {
    const guardian = context({ roleTemplateKeys: ['parent'] })
    const linked = decision({
      context: guardian,
      resource: { kind: 'student', tenantId: 'tenant-1', studentId: 'student-1' },
      attributes: { now: NOW, relationship: { studentLinked: true } },
    })
    const unrelated = decision({
      context: guardian,
      resource: { kind: 'student', tenantId: 'tenant-1', studentId: 'student-2' },
      attributes: { now: NOW, relationship: { studentLinked: false } },
    })
    const broad = decision({ context: guardian, requestedScope: 'school' })

    assert.equal(linked.effect, 'allow')
    assert.equal(linked.queryConstraints[0]?.kind, 'linked_student')
    assert.equal(unrelated.reason, 'RESOURCE_SCOPE_MISMATCH')
    assert.equal(broad.reason, 'SCOPE_NOT_GRANTED')
  })

  it('limits students to their own Person record', () => {
    const student = context({ roleTemplateKeys: ['student'] })
    assert.equal(
      decision({ context: student, resource: { kind: 'student', personId: 'person-1' } }).effect,
      'allow'
    )
    assert.equal(
      decision({ context: student, resource: { kind: 'student', personId: 'person-2' } }).reason,
      'RESOURCE_SCOPE_MISMATCH'
    )
  })

  it('constrains School administrators to the selected School', () => {
    const allowed = decision({
      capability: CAPABILITIES.SCHOOLS_READ,
      resource: { kind: 'school', tenantId: 'tenant-1', schoolId: 'school-1' },
    })
    const sibling = decision({
      capability: CAPABILITIES.SCHOOLS_READ,
      resource: { kind: 'school', tenantId: 'tenant-1', schoolId: 'school-2' },
    })

    assert.equal(allowed.effect, 'allow')
    assert.equal(sibling.reason, 'RESOURCE_SCOPE_MISMATCH')
  })

  it('uses the current Organization Tree path for subtree decisions', () => {
    const organizationAdmin = context({
      roleTemplateKeys: ['org_admin'],
      activeSchoolId: undefined,
      activeEducationOrganizationId: 'org-root',
    })
    const descendant = decision({
      context: organizationAdmin,
      resource: {
        kind: 'student',
        tenantId: 'tenant-1',
        organizationId: 'org-child',
        organizationAncestorIds: ['org-root'],
      },
    })
    const sibling = decision({
      context: organizationAdmin,
      resource: {
        kind: 'student',
        tenantId: 'tenant-1',
        organizationId: 'org-sibling',
        organizationAncestorIds: ['org-other-root'],
      },
    })

    assert.equal(descendant.effect, 'allow')
    assert.equal(descendant.queryConstraints[0]?.kind, 'organization_subtree')
    assert.equal(sibling.reason, 'RESOURCE_SCOPE_MISMATCH')
  })

  it('never converts platform roles into implicit Tenant grants', () => {
    const platform = context({
      tenantId: undefined,
      roleTemplateKeys: ['super_admin'],
      activeSchoolId: undefined,
      platformAccess: true,
    })
    const platformRead = decision({
      context: platform,
      capability: CAPABILITIES.PLATFORM_TENANTS_READ,
      resource: { kind: 'platform' },
    })
    const tenantRead = decision({ context: platform })
    const unverifiedPlatform = decision({
      context: { ...platform, platformAccess: false },
      capability: CAPABILITIES.PLATFORM_TENANTS_READ,
      resource: { kind: 'platform' },
    })

    assert.equal(platformRead.effect, 'allow')
    assert.equal(tenantRead.reason, 'SCOPE_NOT_GRANTED')
    assert.equal(unverifiedPlatform.reason, 'RESOURCE_SCOPE_MISMATCH')
  })

  it('enforces and explains support MFA, reauthentication, purpose, and audit obligations', () => {
    const support = context({
      tenantId: undefined,
      roleTemplateKeys: ['support_agent'],
      activeSchoolId: undefined,
      platformAccess: true,
      authenticatedAt: '2026-08-02T11:50:00Z',
    })
    const request = {
      context: support,
      capability: CAPABILITIES.SUPPORT_SESSIONS_USE,
      resource: { kind: 'support_session' },
      attributes: { now: NOW, purpose: 'customer_support' },
    } as const

    assert.equal(decision(request).reason, 'MFA_REQUIRED')
    assert.equal(
      decision({
        ...request,
        context: { ...support, assuranceLevel: 'aal2', authenticatedAt: '2026-08-02T11:00:00Z' },
      }).reason,
      'REAUTHENTICATION_REQUIRED'
    )
    assert.equal(
      decision({
        ...request,
        context: { ...support, assuranceLevel: 'aal2', authenticatedAt: '2026-08-02T12:01:00Z' },
      }).reason,
      'REAUTHENTICATION_REQUIRED'
    )
    assert.equal(
      decision({
        ...request,
        context: { ...support, assuranceLevel: 'aal2' },
        attributes: { now: NOW },
      }).reason,
      'PURPOSE_REQUIRED'
    )

    const allowed = decision({
      ...request,
      context: { ...support, assuranceLevel: 'aal2' },
    })
    assert.equal(allowed.effect, 'allow')
    assert.deepEqual(
      allowed.obligations.map(({ kind }) => kind),
      ['mfa', 'reauthentication', 'purpose', 'audit']
    )
  })

  it('requires MFA for safeguarded Account administration and carries audit evidence', () => {
    const request = {
      capability: CAPABILITIES.ACCOUNTS_MANAGE,
      requestedScope: 'school',
      resource: { kind: 'account', tenantId: 'tenant-1', schoolId: 'school-1' },
    } as const
    assert.equal(decision(request).reason, 'MFA_REQUIRED')

    const allowed = decision({
      ...request,
      context: context({ assuranceLevel: 'aal2' }),
    })
    assert.equal(allowed.effect, 'allow')
    assert.deepEqual(
      allowed.obligations.map(({ kind }) => kind),
      ['mfa', 'audit']
    )
  })
})

describe('versioned Role Template bundles', () => {
  it('selects only accepted versions for deployment rollback', () => {
    assert.equal(selectPolicyBundle()?.version, POLICY_VERSION_CURRENT)
    assert.equal(selectPolicyBundle(POLICY_VERSION_CURRENT)?.version, POLICY_VERSION_CURRENT)
    assert.equal(
      selectPolicyBundle(POLICY_VERSION_LEGACY_PARITY)?.version,
      POLICY_VERSION_LEGACY_PARITY
    )
    assert.equal(selectPolicyBundle('unknown'), undefined)
  })

  it('composes immutable custom roles from explicit grant bundles', () => {
    const bundle = createPolicyBundle({
      version: 'custom.v1',
      roleTemplates: [
        {
          key: 'school_reader',
          description: 'Reads one School.',
          grants: [
            {
              id: 'school_reader.schools.read',
              capability: CAPABILITIES.SCHOOLS_READ,
              scope: 'school',
            },
          ],
        },
        {
          key: 'registrar',
          description: 'Composes School reads and adds student maintenance.',
          composes: ['school_reader'],
          grants: [
            {
              id: 'registrar.students.update',
              capability: CAPABILITIES.STUDENTS_UPDATE,
              scope: 'school',
            },
          ],
        },
      ],
    })

    assert.equal(bundle.roleTemplates.registrar?.grants.length, 2)
    assert.equal(Object.isFrozen(bundle), true)
    assert.equal(Object.isFrozen(bundle.roleTemplates.registrar?.grants), true)
    assert.throws(() => {
      ;(bundle.roleTemplates.registrar?.grants as unknown as unknown[]).push('mutation')
    }, TypeError)
  })

  it('rejects unknown, cyclic, or invalid custom composition', () => {
    assert.throws(
      () =>
        createPolicyBundle({
          version: 'custom.v1',
          roleTemplates: [
            { key: 'registrar', description: 'Invalid.', composes: ['missing_role'] },
          ],
        }),
      /Unknown composed Role Template/
    )
    assert.throws(
      () =>
        createPolicyBundle({
          version: 'custom.v1',
          roleTemplates: [
            { key: 'role_a', description: 'A.', composes: ['role_b'] },
            { key: 'role_b', description: 'B.', composes: ['role_a'] },
          ],
        }),
      /composition cycle/
    )
    assert.throws(
      () =>
        createPolicyBundle({
          version: 'custom.v1',
          roleTemplates: [
            {
              key: 'bad_scope',
              description: 'Invalid.',
              grants: [
                {
                  id: 'bad_scope.platform',
                  capability: CAPABILITIES.STUDENTS_READ,
                  scope: 'platform',
                },
              ],
            },
          ],
        }),
      /scope unsupported/
    )
  })
})
