import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CURRENT_POLICY_BUNDLE,
  POLICY_VERSION_ACADEMIC_STRUCTURE,
  POLICY_VERSION_CURRENT,
  POLICY_VERSION_ENROLLMENT_LIFECYCLE,
  POLICY_VERSION_GUARDIAN_CONTACTS,
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
      assuranceLevel: 'aal2',
      personId: undefined,
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
    assert.equal(unverifiedPlatform.reason, 'CONTEXT_MISSING')
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

  it('requires a current Support Grant and narrows diagnostics to its exact scope', () => {
    const support = context({
      personId: undefined,
      tenantId: 'tenant-1',
      activeSchoolId: undefined,
      roleTemplateKeys: ['support_agent'],
      assuranceLevel: 'aal2',
      authenticatedAt: '2026-08-02T11:55:00.000Z',
    })
    const request = {
      context: support,
      capability: CAPABILITIES.SUPPORT_STUDENTS_READ,
      resource: { kind: 'student', tenantId: 'tenant-1', schoolId: 'school-1' },
      requestedScope: 'school',
      attributes: { now: NOW, purpose: 'customer_support' },
    } as const

    assert.equal(
      decision({
        ...request,
        context: {
          ...support,
          tenantId: undefined,
          platformAccess: true,
        },
      }).reason,
      'SUPPORT_ACCESS_REQUIRED'
    )

    const granted = {
      ...support,
      supportAccess: {
        grantId: 'grant-1',
        kind: 'support' as const,
        purpose: 'customer_support' as const,
        allowedCapabilities: [CAPABILITIES.SUPPORT_STUDENTS_READ],
        queryConstraint: { kind: 'school' as const, tenantId: 'tenant-1', schoolId: 'school-1' },
        expiresAt: '2026-08-02T13:00:00.000Z',
      },
    }
    const allowed = decision({ ...request, context: granted })
    const broader = decision({ ...request, context: granted, requestedScope: 'tenant' })
    const sibling = decision({
      ...request,
      context: granted,
      resource: { kind: 'student', tenantId: 'tenant-1', schoolId: 'school-2' },
    })
    const ungrantedCapability = decision({
      ...request,
      context: granted,
      capability: CAPABILITIES.SUPPORT_SCHOOLS_READ,
      resource: { kind: 'school', tenantId: 'tenant-1', schoolId: 'school-1' },
    })

    assert.equal(allowed.effect, 'allow')
    assert.deepEqual(allowed.queryConstraints, [
      { kind: 'school', tenantId: 'tenant-1', schoolId: 'school-1' },
    ])
    assert.equal(broader.reason, 'RESOURCE_SCOPE_MISMATCH')
    assert.equal(sibling.reason, 'RESOURCE_SCOPE_MISMATCH')
    assert.equal(ungrantedCapability.reason, 'SUPPORT_CAPABILITY_DENIED')
  })

  it('limits grant management to MFA-authenticated, recently verified Tenant administrators', () => {
    const request = {
      capability: CAPABILITIES.SUPPORT_GRANTS_MANAGE,
      requestedScope: 'school',
      resource: { kind: 'support_session', tenantId: 'tenant-1', schoolId: 'school-1' },
      attributes: { now: NOW },
    } as const

    assert.equal(decision(request).reason, 'MFA_REQUIRED')
    assert.equal(
      decision({ ...request, context: context({ assuranceLevel: 'aal2' }) }).reason,
      'REAUTHENTICATION_REQUIRED'
    )
    assert.equal(
      decision({
        ...request,
        context: context({
          assuranceLevel: 'aal2',
          authenticatedAt: '2026-08-02T11:55:00.000Z',
        }),
      }).effect,
      'allow'
    )
    assert.equal(
      decision({
        ...request,
        context: context({
          roleTemplateKeys: ['staff'],
          assuranceLevel: 'aal2',
          authenticatedAt: '2026-08-02T11:55:00.000Z',
        }),
      }).reason,
      'SCOPE_NOT_GRANTED'
    )
  })

  it('keeps break-glass opening on the separate platform role and incident purpose', () => {
    const breakGlass = context({
      personId: undefined,
      tenantId: undefined,
      activeSchoolId: undefined,
      platformAccess: true,
      roleTemplateKeys: ['break_glass_operator'],
      assuranceLevel: 'aal2',
      authenticatedAt: '2026-08-02T11:55:00.000Z',
    })
    const request = {
      context: breakGlass,
      capability: CAPABILITIES.PLATFORM_BREAK_GLASS_OPEN,
      resource: { kind: 'support_session' },
      attributes: { now: NOW, purpose: 'incident_response' },
    } as const

    assert.equal(decision(request).effect, 'allow')
    assert.equal(
      decision({
        ...request,
        attributes: { now: NOW, purpose: 'customer_support' },
      }).reason,
      'PURPOSE_REQUIRED'
    )
    assert.equal(
      decision({ ...request, context: { ...breakGlass, roleTemplateKeys: ['super_admin'] } })
        .reason,
      'SCOPE_NOT_GRANTED'
    )
  })

  it('requires MFA and recent reauthentication for safeguarded Account administration', () => {
    const request = {
      capability: CAPABILITIES.ACCOUNTS_MANAGE,
      requestedScope: 'school',
      resource: { kind: 'account', tenantId: 'tenant-1', schoolId: 'school-1' },
    } as const
    assert.equal(decision(request).reason, 'MFA_REQUIRED')
    assert.equal(
      decision({
        ...request,
        context: context({ assuranceLevel: 'aal2' }),
        attributes: { now: NOW },
      }).reason,
      'REAUTHENTICATION_REQUIRED'
    )

    const allowed = decision({
      ...request,
      context: context({
        assuranceLevel: 'aal2',
        authenticatedAt: '2026-08-02T11:58:00.000Z',
      }),
      attributes: { now: NOW },
    })
    assert.equal(allowed.effect, 'allow')
    assert.deepEqual(
      allowed.obligations.map(({ kind }) => kind),
      ['mfa', 'reauthentication', 'audit']
    )
    assert.equal(
      decision({
        ...request,
        context: context({
          assuranceLevel: 'aal2',
          authenticatedAt: '2026-08-02T11:44:59.999Z',
        }),
        attributes: { now: NOW },
      }).reason,
      'REAUTHENTICATION_REQUIRED'
    )
  })

  it('limits academic structure changes to MFA-protected School and Organization administrators', () => {
    const request = {
      capability: CAPABILITIES.ACADEMIC_STRUCTURE_MANAGE,
      requestedScope: 'school',
      resource: {
        kind: 'academic_structure',
        tenantId: 'tenant-1',
        schoolId: 'school-1',
      },
      attributes: { now: NOW },
    } as const

    assert.equal(decision(request).reason, 'MFA_REQUIRED')

    const schoolAdmin = decision({
      ...request,
      context: context({ assuranceLevel: 'aal2' }),
    })
    assert.equal(schoolAdmin.effect, 'allow')
    assert.equal(schoolAdmin.queryConstraints[0]?.kind, 'school')
    assert.deepEqual(
      schoolAdmin.obligations
        .filter((obligation) => obligation.kind === 'audit')
        .map(({ event }) => event),
      [
        'academic_year.create',
        'academic_year.review',
        'academic_year.publish',
        'academic_year.close',
      ]
    )

    assert.equal(
      decision({
        ...request,
        context: context({ roleTemplateKeys: ['teacher'], assuranceLevel: 'aal2' }),
      }).reason,
      'SCOPE_NOT_GRANTED'
    )

    const organizationAdmin = decision({
      ...request,
      context: context({
        roleTemplateKeys: ['org_admin'],
        assuranceLevel: 'aal2',
        activeSchoolId: undefined,
        activeEducationOrganizationId: 'org-root',
      }),
      resource: {
        kind: 'academic_structure',
        tenantId: 'tenant-1',
        organizationId: 'org-child',
        organizationAncestorIds: ['org-root'],
        schoolId: 'school-1',
      },
    })
    assert.equal(organizationAdmin.effect, 'allow')
    assert.equal(organizationAdmin.queryConstraints[0]?.kind, 'organization_subtree')

    assert.equal(
      decision({
        ...request,
        bundle: selectPolicyBundle(POLICY_VERSION_LEGACY_PARITY),
        context: context({ assuranceLevel: 'aal2' }),
      }).reason,
      'SCOPE_NOT_GRANTED'
    )
  })

  it('limits enrollment lifecycle changes to MFA-protected administrators', () => {
    const request = {
      capability: CAPABILITIES.STUDENT_ENROLLMENTS_MANAGE,
      requestedScope: 'school',
      resource: {
        kind: 'student_enrollment',
        tenantId: 'tenant-1',
        schoolId: 'school-1',
      },
      attributes: { now: NOW },
    } as const

    assert.equal(decision(request).reason, 'MFA_REQUIRED')
    const allowed = decision({
      ...request,
      context: context({ assuranceLevel: 'aal2' }),
    })
    assert.equal(allowed.effect, 'allow')
    assert.deepEqual(
      allowed.obligations
        .filter((obligation) => obligation.kind === 'audit')
        .map(({ event }) => event),
      ['student.enrollment.schedule', 'student.enrollment.apply', 'student.enrollment.cancel']
    )
    assert.equal(
      decision({
        ...request,
        context: context({ roleTemplateKeys: ['teacher'], assuranceLevel: 'aal2' }),
      }).reason,
      'SCOPE_NOT_GRANTED'
    )
    assert.equal(
      decision({
        ...request,
        bundle: selectPolicyBundle(POLICY_VERSION_ACADEMIC_STRUCTURE),
        context: context({ assuranceLevel: 'aal2' }),
      }).reason,
      'SCOPE_NOT_GRANTED'
    )
  })

  it('separates guardian contact reads from MFA-protected contact management', () => {
    const resource = {
      kind: 'guardian_contact',
      tenantId: 'tenant-1',
      schoolId: 'school-1',
    } as const
    const read = decision({
      capability: CAPABILITIES.GUARDIAN_CONTACTS_READ,
      requestedScope: 'school',
      resource,
    })
    assert.equal(read.effect, 'allow')
    assert.equal(read.queryConstraints[0]?.kind, 'school')

    const manageRequest = {
      capability: CAPABILITIES.GUARDIAN_CONTACTS_MANAGE,
      requestedScope: 'school',
      resource,
      attributes: { now: NOW },
    } as const
    assert.equal(decision(manageRequest).reason, 'MFA_REQUIRED')
    const manage = decision({
      ...manageRequest,
      context: context({ assuranceLevel: 'aal2' }),
    })
    assert.equal(manage.effect, 'allow')
    assert.deepEqual(
      manage.obligations
        .filter((obligation) => obligation.kind === 'audit')
        .map(({ event }) => event),
      ['guardian.contact.create', 'guardian.contact.update', 'guardian.contact.end']
    )
    assert.equal(
      decision({
        ...manageRequest,
        context: context({ roleTemplateKeys: ['staff'], assuranceLevel: 'aal2' }),
      }).reason,
      'SCOPE_NOT_GRANTED'
    )
    assert.equal(
      decision({
        ...manageRequest,
        bundle: selectPolicyBundle(POLICY_VERSION_ENROLLMENT_LIFECYCLE),
        context: context({ assuranceLevel: 'aal2' }),
      }).reason,
      'SCOPE_NOT_GRANTED'
    )
  })

  it('separates household reads from MFA-protected household management', () => {
    const resource = { kind: 'household', tenantId: 'tenant-1', schoolId: 'school-1' } as const
    const read = decision({
      capability: CAPABILITIES.HOUSEHOLDS_READ,
      requestedScope: 'school',
      resource,
    })
    assert.equal(read.effect, 'allow')
    assert.equal(read.queryConstraints[0]?.kind, 'school')

    const manageRequest = {
      capability: CAPABILITIES.HOUSEHOLDS_MANAGE,
      requestedScope: 'school',
      resource,
      attributes: { now: NOW },
    } as const
    assert.equal(decision(manageRequest).reason, 'MFA_REQUIRED')
    const manage = decision({
      ...manageRequest,
      context: context({ assuranceLevel: 'aal2' }),
    })
    assert.equal(manage.effect, 'allow')
    assert.deepEqual(
      manage.obligations
        .filter((obligation) => obligation.kind === 'audit')
        .map(({ event }) => event),
      [
        'household.create',
        'household.member.add',
        'household.member.revise',
        'household.member.end',
        'household.address.add',
        'household.address.revise',
      ]
    )
    assert.equal(
      decision({
        ...manageRequest,
        context: context({ roleTemplateKeys: ['staff'], assuranceLevel: 'aal2' }),
      }).reason,
      'SCOPE_NOT_GRANTED'
    )
    assert.equal(
      decision({
        ...manageRequest,
        bundle: selectPolicyBundle(POLICY_VERSION_GUARDIAN_CONTACTS),
        context: context({ assuranceLevel: 'aal2' }),
      }).reason,
      'SCOPE_NOT_GRANTED'
    )
  })
})

describe('versioned Role Template bundles', () => {
  it('matches the reviewed legacy Tenant role surface before modifier removal', () => {
    const expectedRolesByCapability = new Map<string, readonly string[]>([
      [
        CAPABILITIES.SCHOOLS_READ,
        ['org_admin', 'org_viewer', 'school_admin', 'staff', 'teacher', 'parent', 'student'],
      ],
      [CAPABILITIES.ACADEMIC_STRUCTURE_READ, ['org_admin', 'org_viewer', 'school_admin']],
      [CAPABILITIES.ACADEMIC_STRUCTURE_MANAGE, ['org_admin', 'school_admin']],
      [CAPABILITIES.STUDENT_ENROLLMENTS_READ, ['org_admin', 'org_viewer', 'school_admin']],
      [CAPABILITIES.STUDENT_ENROLLMENTS_MANAGE, ['org_admin', 'school_admin']],
      [CAPABILITIES.GUARDIAN_CONTACTS_READ, ['org_admin', 'org_viewer', 'school_admin']],
      [CAPABILITIES.GUARDIAN_CONTACTS_MANAGE, ['org_admin', 'school_admin']],
      [CAPABILITIES.HOUSEHOLDS_READ, ['org_admin', 'org_viewer', 'school_admin']],
      [CAPABILITIES.HOUSEHOLDS_MANAGE, ['org_admin', 'school_admin']],
      [CAPABILITIES.STUDENTS_CREATE, ['org_admin', 'school_admin', 'staff']],
      [
        CAPABILITIES.STUDENTS_READ,
        ['org_admin', 'org_viewer', 'school_admin', 'staff', 'teacher', 'parent', 'student'],
      ],
      [CAPABILITIES.STUDENTS_UPDATE, ['org_admin', 'school_admin', 'staff']],
      [CAPABILITIES.STUDENTS_DELETE, ['org_admin', 'school_admin']],
      [CAPABILITIES.GRADES_CREATE, ['teacher']],
      [
        CAPABILITIES.GRADES_READ,
        ['org_admin', 'org_viewer', 'school_admin', 'staff', 'teacher', 'parent', 'student'],
      ],
      [CAPABILITIES.GRADES_UPDATE, ['school_admin', 'teacher']],
      [CAPABILITIES.GRADES_DELETE, ['school_admin']],
      [CAPABILITIES.CLASSES_CREATE, ['org_admin', 'school_admin']],
      [
        CAPABILITIES.CLASSES_READ,
        ['org_admin', 'org_viewer', 'school_admin', 'staff', 'teacher', 'parent', 'student'],
      ],
      [CAPABILITIES.CLASSES_UPDATE, ['org_admin', 'school_admin']],
      [CAPABILITIES.CLASSES_DELETE, ['org_admin', 'school_admin']],
      [CAPABILITIES.TEACHERS_CREATE, ['org_admin', 'school_admin']],
      [
        CAPABILITIES.TEACHERS_READ,
        ['org_admin', 'org_viewer', 'school_admin', 'staff', 'teacher', 'parent', 'student'],
      ],
      [CAPABILITIES.TEACHERS_UPDATE, ['org_admin', 'school_admin']],
      [CAPABILITIES.TEACHERS_DELETE, ['org_admin', 'school_admin']],
      [CAPABILITIES.REPORTS_SCHOOL_READ, ['org_admin', 'org_viewer', 'school_admin']],
      [CAPABILITIES.REPORTS_CLASS_READ, ['org_admin', 'org_viewer', 'school_admin', 'teacher']],
      [
        CAPABILITIES.REPORTS_STUDENT_READ,
        ['org_admin', 'org_viewer', 'school_admin', 'teacher', 'parent'],
      ],
      [CAPABILITIES.SETTINGS_ORGANIZATION_MANAGE, ['org_admin']],
      [CAPABILITIES.SETTINGS_SCHOOL_MANAGE, ['org_admin', 'school_admin']],
      [CAPABILITIES.ACCOUNTS_INVITE, ['org_admin', 'school_admin']],
      [CAPABILITIES.ACCOUNTS_MANAGE, ['org_admin', 'school_admin']],
      [CAPABILITIES.AUDIT_READ, ['org_admin', 'school_admin']],
    ])
    const tenantRoles = [
      'org_admin',
      'org_viewer',
      'school_admin',
      'staff',
      'teacher',
      'parent',
      'student',
    ]

    for (const [capability, expectedRoles] of expectedRolesByCapability) {
      const actualRoles = tenantRoles.filter((role) =>
        CURRENT_POLICY_BUNDLE.roleTemplates[role]?.grants.some(
          (grant) => grant.capability === capability
        )
      )
      assert.deepEqual(actualRoles.sort(), [...expectedRoles].sort(), capability)
    }
  })

  it('selects only accepted versions for deployment rollback', () => {
    assert.equal(selectPolicyBundle()?.version, POLICY_VERSION_CURRENT)
    assert.equal(selectPolicyBundle(POLICY_VERSION_CURRENT)?.version, POLICY_VERSION_CURRENT)
    assert.equal(
      selectPolicyBundle(POLICY_VERSION_GUARDIAN_CONTACTS)?.version,
      POLICY_VERSION_GUARDIAN_CONTACTS
    )
    assert.equal(
      selectPolicyBundle(POLICY_VERSION_ENROLLMENT_LIFECYCLE)?.version,
      POLICY_VERSION_ENROLLMENT_LIFECYCLE
    )
    assert.equal(
      selectPolicyBundle(POLICY_VERSION_ACADEMIC_STRUCTURE)?.version,
      POLICY_VERSION_ACADEMIC_STRUCTURE
    )
    assert.equal(
      selectPolicyBundle(POLICY_VERSION_LEGACY_PARITY)?.version,
      POLICY_VERSION_LEGACY_PARITY
    )
    assert.equal(selectPolicyBundle('unknown'), undefined)
  })

  it('preserves platform operators in the academic-structure rollback bundle', () => {
    const rollback = selectPolicyBundle(POLICY_VERSION_ACADEMIC_STRUCTURE)
    assert.ok(rollback)
    assert.deepEqual(
      ['super_admin', 'support_agent', 'break_glass_operator'].filter(
        (role) => rollback.roleTemplates[role]
      ),
      ['super_admin', 'support_agent', 'break_glass_operator']
    )
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
    assert.throws(
      () =>
        createPolicyBundle({
          version: 'custom.v1',
          roleTemplates: [
            {
              key: 'base_one',
              description: 'Base one.',
              grants: [
                {
                  id: 'shared.grant',
                  capability: CAPABILITIES.SCHOOLS_READ,
                  scope: 'school',
                },
              ],
            },
            {
              key: 'base_two',
              description: 'Base two.',
              grants: [
                {
                  id: 'shared.grant',
                  capability: CAPABILITIES.STUDENTS_READ,
                  scope: 'school',
                },
              ],
            },
            {
              key: 'combined',
              description: 'Invalid combined role.',
              composes: ['base_one', 'base_two'],
            },
          ],
        }),
      /Conflicting composed grant id/
    )
  })
})
