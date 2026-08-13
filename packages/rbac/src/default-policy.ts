import { createPolicyBundle } from './policy-bundle'
import { CAPABILITIES, type Capability, SCOPES } from './registry'
import type {
  PolicyBundle,
  PolicyGrant,
  PolicyObligation,
  RoleTemplateDefinition,
  ScopeKind,
} from './types'

export const POLICY_VERSION_LEGACY_PARITY = '2026-08-02.legacy-parity'
export const POLICY_VERSION_ACADEMIC_STRUCTURE = '2026-08-03.v4'
export const POLICY_VERSION_ENROLLMENT_LIFECYCLE = '2026-08-03.v5'
export const POLICY_VERSION_GUARDIAN_CONTACTS = '2026-08-03.v6'
export const POLICY_VERSION_HOUSEHOLDS = '2026-08-13.v7'
export const POLICY_VERSION_SECTIONS = '2026-08-13.v8'
export const POLICY_VERSION_CURRENT = '2026-08-13.v9'

const audit = (event: string): PolicyObligation => ({ kind: 'audit', event })
const mfa: PolicyObligation = { kind: 'mfa', assuranceLevel: 'aal2' }
const recentReauthentication: PolicyObligation = {
  kind: 'reauthentication',
  maxAgeSeconds: 900,
}

function grants(
  role: string,
  entries: readonly (readonly [Capability, ScopeKind, (readonly PolicyObligation[])?])[]
): readonly PolicyGrant[] {
  return entries.map(([capability, scope, obligations]) => ({
    id: `${role}.${capability}.${scope}`,
    capability,
    scope,
    ...(obligations ? { obligations } : {}),
  }))
}

function tenantRoleTemplates(options: {
  supportAccess: boolean
  academicStructure: boolean
  enrollmentLifecycle: boolean
  guardianContacts: boolean
  households: boolean
  sections: boolean
  duplicateReview: boolean
}): RoleTemplateDefinition[] {
  const protectedAdmin = (event: string): readonly PolicyObligation[] => [mfa, audit(event)]
  const academicStructureAdmin = (): readonly PolicyObligation[] => [
    mfa,
    audit('academic_year.create'),
    audit('academic_year.review'),
    audit('academic_year.publish'),
    audit('academic_year.close'),
  ]
  const enrollmentAdmin = (): readonly PolicyObligation[] => [
    mfa,
    audit('student.enrollment.schedule'),
    audit('student.enrollment.apply'),
    audit('student.enrollment.cancel'),
  ]
  const guardianContactAdmin = (): readonly PolicyObligation[] => [
    mfa,
    audit('guardian.contact.create'),
    audit('guardian.contact.update'),
    audit('guardian.contact.end'),
  ]
  const householdAdmin = (): readonly PolicyObligation[] => [
    mfa,
    audit('household.create'),
    audit('household.member.add'),
    audit('household.member.revise'),
    audit('household.member.end'),
    audit('household.address.add'),
    audit('household.address.revise'),
  ]
  const sectionAdmin = (): readonly PolicyObligation[] => [
    mfa,
    audit('course.create'),
    audit('section.create'),
    audit('section.close'),
    audit('section.staff.assign'),
    audit('section.staff.end'),
    audit('section.roster.add'),
    audit('section.roster.end'),
  ]
  const duplicateReviewAdmin = (): readonly PolicyObligation[] => [
    mfa,
    audit('person_duplicate.distinct'),
    audit('person_duplicate.merge_approval_request'),
  ]
  const recorded = (event: string): readonly PolicyObligation[] => [audit(event)]

  return [
    {
      key: 'org_admin',
      description: 'Manages the selected Education Organization subtree.',
      grants: grants('org_admin', [
        [CAPABILITIES.SCHOOLS_READ, SCOPES.ORGANIZATION_SUBTREE],
        ...(options.academicStructure
          ? [
              [CAPABILITIES.ACADEMIC_STRUCTURE_READ, SCOPES.ORGANIZATION_SUBTREE] as const,
              [
                CAPABILITIES.ACADEMIC_STRUCTURE_MANAGE,
                SCOPES.ORGANIZATION_SUBTREE,
                academicStructureAdmin(),
              ] as const,
            ]
          : []),
        ...(options.enrollmentLifecycle
          ? [
              [CAPABILITIES.STUDENT_ENROLLMENTS_READ, SCOPES.ORGANIZATION_SUBTREE] as const,
              [
                CAPABILITIES.STUDENT_ENROLLMENTS_MANAGE,
                SCOPES.ORGANIZATION_SUBTREE,
                enrollmentAdmin(),
              ] as const,
            ]
          : []),
        ...(options.guardianContacts
          ? [
              [CAPABILITIES.GUARDIAN_CONTACTS_READ, SCOPES.ORGANIZATION_SUBTREE] as const,
              [
                CAPABILITIES.GUARDIAN_CONTACTS_MANAGE,
                SCOPES.ORGANIZATION_SUBTREE,
                guardianContactAdmin(),
              ] as const,
            ]
          : []),
        ...(options.households
          ? [
              [CAPABILITIES.HOUSEHOLDS_READ, SCOPES.ORGANIZATION_SUBTREE] as const,
              [
                CAPABILITIES.HOUSEHOLDS_MANAGE,
                SCOPES.ORGANIZATION_SUBTREE,
                householdAdmin(),
              ] as const,
            ]
          : []),
        ...(options.sections
          ? [
              [CAPABILITIES.SECTIONS_READ, SCOPES.ORGANIZATION_SUBTREE] as const,
              [CAPABILITIES.SECTIONS_MANAGE, SCOPES.ORGANIZATION_SUBTREE, sectionAdmin()] as const,
            ]
          : []),
        ...(options.duplicateReview
          ? [
              [CAPABILITIES.PEOPLE_DUPLICATES_READ, SCOPES.ORGANIZATION_SUBTREE] as const,
              [
                CAPABILITIES.PEOPLE_DUPLICATES_REVIEW,
                SCOPES.ORGANIZATION_SUBTREE,
                duplicateReviewAdmin(),
              ] as const,
            ]
          : []),
        [CAPABILITIES.STUDENTS_CREATE, SCOPES.ORGANIZATION_SUBTREE, recorded('student.create')],
        [CAPABILITIES.STUDENTS_READ, SCOPES.ORGANIZATION_SUBTREE],
        [CAPABILITIES.STUDENTS_UPDATE, SCOPES.ORGANIZATION_SUBTREE, recorded('student.update')],
        [CAPABILITIES.STUDENTS_DELETE, SCOPES.ORGANIZATION_SUBTREE, recorded('student.delete')],
        [CAPABILITIES.GRADES_READ, SCOPES.ORGANIZATION_SUBTREE],
        [CAPABILITIES.CLASSES_CREATE, SCOPES.ORGANIZATION_SUBTREE],
        [CAPABILITIES.CLASSES_READ, SCOPES.ORGANIZATION_SUBTREE],
        [CAPABILITIES.CLASSES_UPDATE, SCOPES.ORGANIZATION_SUBTREE],
        [CAPABILITIES.CLASSES_DELETE, SCOPES.ORGANIZATION_SUBTREE],
        [CAPABILITIES.TEACHERS_CREATE, SCOPES.ORGANIZATION_SUBTREE],
        [CAPABILITIES.TEACHERS_READ, SCOPES.ORGANIZATION_SUBTREE],
        [CAPABILITIES.TEACHERS_UPDATE, SCOPES.ORGANIZATION_SUBTREE],
        [CAPABILITIES.TEACHERS_DELETE, SCOPES.ORGANIZATION_SUBTREE],
        [CAPABILITIES.REPORTS_SCHOOL_READ, SCOPES.ORGANIZATION_SUBTREE],
        [CAPABILITIES.REPORTS_CLASS_READ, SCOPES.ORGANIZATION_SUBTREE],
        [CAPABILITIES.REPORTS_STUDENT_READ, SCOPES.ORGANIZATION_SUBTREE],
        [
          CAPABILITIES.SETTINGS_ORGANIZATION_MANAGE,
          SCOPES.ORGANIZATION_EXACT,
          protectedAdmin('settings.organization.manage'),
        ],
        [
          CAPABILITIES.SETTINGS_SCHOOL_MANAGE,
          SCOPES.ORGANIZATION_SUBTREE,
          protectedAdmin('settings.school.manage'),
        ],
        [
          CAPABILITIES.ACCOUNTS_INVITE,
          SCOPES.ORGANIZATION_SUBTREE,
          protectedAdmin('account.invite'),
        ],
        [
          CAPABILITIES.ACCOUNTS_MANAGE,
          SCOPES.ORGANIZATION_SUBTREE,
          [mfa, recentReauthentication, audit('account.manage')],
        ],
        [CAPABILITIES.AUDIT_READ, SCOPES.ORGANIZATION_SUBTREE, recorded('audit.read')],
        ...(options.supportAccess
          ? [
              [
                CAPABILITIES.SUPPORT_GRANTS_MANAGE,
                SCOPES.ORGANIZATION_SUBTREE,
                [mfa, recentReauthentication, audit('support.grant.manage')],
              ] as const,
            ]
          : []),
      ]),
    },
    {
      key: 'org_viewer',
      description: 'Reads operational information in the selected Organization subtree.',
      grants: grants('org_viewer', [
        [CAPABILITIES.SCHOOLS_READ, SCOPES.ORGANIZATION_SUBTREE],
        ...(options.academicStructure
          ? [[CAPABILITIES.ACADEMIC_STRUCTURE_READ, SCOPES.ORGANIZATION_SUBTREE] as const]
          : []),
        ...(options.enrollmentLifecycle
          ? [[CAPABILITIES.STUDENT_ENROLLMENTS_READ, SCOPES.ORGANIZATION_SUBTREE] as const]
          : []),
        ...(options.guardianContacts
          ? [[CAPABILITIES.GUARDIAN_CONTACTS_READ, SCOPES.ORGANIZATION_SUBTREE] as const]
          : []),
        ...(options.households
          ? [[CAPABILITIES.HOUSEHOLDS_READ, SCOPES.ORGANIZATION_SUBTREE] as const]
          : []),
        ...(options.sections
          ? [[CAPABILITIES.SECTIONS_READ, SCOPES.ORGANIZATION_SUBTREE] as const]
          : []),
        [CAPABILITIES.STUDENTS_READ, SCOPES.ORGANIZATION_SUBTREE],
        [CAPABILITIES.GRADES_READ, SCOPES.ORGANIZATION_SUBTREE],
        [CAPABILITIES.CLASSES_READ, SCOPES.ORGANIZATION_SUBTREE],
        [CAPABILITIES.TEACHERS_READ, SCOPES.ORGANIZATION_SUBTREE],
        [CAPABILITIES.REPORTS_SCHOOL_READ, SCOPES.ORGANIZATION_SUBTREE],
        [CAPABILITIES.REPORTS_CLASS_READ, SCOPES.ORGANIZATION_SUBTREE],
        [CAPABILITIES.REPORTS_STUDENT_READ, SCOPES.ORGANIZATION_SUBTREE],
      ]),
    },
    {
      key: 'school_admin',
      description: 'Manages one selected School.',
      grants: grants('school_admin', [
        [CAPABILITIES.SCHOOLS_READ, SCOPES.SCHOOL],
        ...(options.academicStructure
          ? [
              [CAPABILITIES.ACADEMIC_STRUCTURE_READ, SCOPES.SCHOOL] as const,
              [
                CAPABILITIES.ACADEMIC_STRUCTURE_MANAGE,
                SCOPES.SCHOOL,
                academicStructureAdmin(),
              ] as const,
            ]
          : []),
        ...(options.enrollmentLifecycle
          ? [
              [CAPABILITIES.STUDENT_ENROLLMENTS_READ, SCOPES.SCHOOL] as const,
              [CAPABILITIES.STUDENT_ENROLLMENTS_MANAGE, SCOPES.SCHOOL, enrollmentAdmin()] as const,
            ]
          : []),
        ...(options.guardianContacts
          ? [
              [CAPABILITIES.GUARDIAN_CONTACTS_READ, SCOPES.SCHOOL] as const,
              [
                CAPABILITIES.GUARDIAN_CONTACTS_MANAGE,
                SCOPES.SCHOOL,
                guardianContactAdmin(),
              ] as const,
            ]
          : []),
        ...(options.households
          ? [
              [CAPABILITIES.HOUSEHOLDS_READ, SCOPES.SCHOOL] as const,
              [CAPABILITIES.HOUSEHOLDS_MANAGE, SCOPES.SCHOOL, householdAdmin()] as const,
            ]
          : []),
        ...(options.sections
          ? [
              [CAPABILITIES.SECTIONS_READ, SCOPES.SCHOOL] as const,
              [CAPABILITIES.SECTIONS_MANAGE, SCOPES.SCHOOL, sectionAdmin()] as const,
            ]
          : []),
        ...(options.duplicateReview
          ? [
              [CAPABILITIES.PEOPLE_DUPLICATES_READ, SCOPES.SCHOOL] as const,
              [
                CAPABILITIES.PEOPLE_DUPLICATES_REVIEW,
                SCOPES.SCHOOL,
                duplicateReviewAdmin(),
              ] as const,
            ]
          : []),
        [CAPABILITIES.STUDENTS_CREATE, SCOPES.SCHOOL, recorded('student.create')],
        [CAPABILITIES.STUDENTS_READ, SCOPES.SCHOOL],
        [CAPABILITIES.STUDENTS_UPDATE, SCOPES.SCHOOL, recorded('student.update')],
        [CAPABILITIES.STUDENTS_DELETE, SCOPES.SCHOOL, recorded('student.delete')],
        [CAPABILITIES.GRADES_READ, SCOPES.SCHOOL],
        [CAPABILITIES.GRADES_UPDATE, SCOPES.SCHOOL],
        [CAPABILITIES.GRADES_DELETE, SCOPES.SCHOOL],
        [CAPABILITIES.CLASSES_CREATE, SCOPES.SCHOOL],
        [CAPABILITIES.CLASSES_READ, SCOPES.SCHOOL],
        [CAPABILITIES.CLASSES_UPDATE, SCOPES.SCHOOL],
        [CAPABILITIES.CLASSES_DELETE, SCOPES.SCHOOL],
        [CAPABILITIES.TEACHERS_CREATE, SCOPES.SCHOOL],
        [CAPABILITIES.TEACHERS_READ, SCOPES.SCHOOL],
        [CAPABILITIES.TEACHERS_UPDATE, SCOPES.SCHOOL],
        [CAPABILITIES.TEACHERS_DELETE, SCOPES.SCHOOL],
        [CAPABILITIES.REPORTS_SCHOOL_READ, SCOPES.SCHOOL],
        [CAPABILITIES.REPORTS_CLASS_READ, SCOPES.SCHOOL],
        [CAPABILITIES.REPORTS_STUDENT_READ, SCOPES.SCHOOL],
        [
          CAPABILITIES.SETTINGS_SCHOOL_MANAGE,
          SCOPES.SCHOOL,
          protectedAdmin('settings.school.manage'),
        ],
        [CAPABILITIES.ACCOUNTS_INVITE, SCOPES.SCHOOL, protectedAdmin('account.invite')],
        [
          CAPABILITIES.ACCOUNTS_MANAGE,
          SCOPES.SCHOOL,
          [mfa, recentReauthentication, audit('account.manage')],
        ],
        [CAPABILITIES.AUDIT_READ, SCOPES.SCHOOL, recorded('audit.read')],
        ...(options.supportAccess
          ? [
              [
                CAPABILITIES.SUPPORT_GRANTS_MANAGE,
                SCOPES.SCHOOL,
                [mfa, recentReauthentication, audit('support.grant.manage')],
              ] as const,
            ]
          : []),
      ]),
    },
    {
      key: 'staff',
      description: 'Performs non-teaching operations in one selected School.',
      grants: grants('staff', [
        [CAPABILITIES.SCHOOLS_READ, SCOPES.SCHOOL],
        [CAPABILITIES.STUDENTS_CREATE, SCOPES.SCHOOL, recorded('student.create')],
        [CAPABILITIES.STUDENTS_READ, SCOPES.SCHOOL],
        [CAPABILITIES.STUDENTS_UPDATE, SCOPES.SCHOOL, recorded('student.update')],
        [CAPABILITIES.GRADES_READ, SCOPES.SCHOOL],
        [CAPABILITIES.CLASSES_READ, SCOPES.SCHOOL],
        ...(options.sections ? [[CAPABILITIES.SECTIONS_READ, SCOPES.SCHOOL] as const] : []),
        [CAPABILITIES.TEACHERS_READ, SCOPES.SCHOOL],
      ]),
    },
    {
      key: 'teacher',
      description: 'Works with assigned classes in one selected School.',
      grants: grants('teacher', [
        [CAPABILITIES.SCHOOLS_READ, SCOPES.SCHOOL],
        [CAPABILITIES.STUDENTS_READ, SCOPES.CLASS],
        [CAPABILITIES.GRADES_CREATE, SCOPES.CLASS, recorded('grade.create')],
        [CAPABILITIES.GRADES_READ, SCOPES.CLASS],
        [CAPABILITIES.GRADES_UPDATE, SCOPES.CLASS, recorded('grade.update')],
        [CAPABILITIES.CLASSES_READ, SCOPES.CLASS],
        ...(options.sections ? [[CAPABILITIES.SECTIONS_READ, SCOPES.CLASS] as const] : []),
        [CAPABILITIES.TEACHERS_READ, SCOPES.SCHOOL],
        [CAPABILITIES.REPORTS_CLASS_READ, SCOPES.CLASS],
        [CAPABILITIES.REPORTS_STUDENT_READ, SCOPES.CLASS],
      ]),
    },
    {
      key: 'parent',
      description: 'Reads records for currently linked students.',
      grants: grants('parent', [
        [CAPABILITIES.SCHOOLS_READ, SCOPES.SCHOOL],
        [CAPABILITIES.STUDENTS_READ, SCOPES.LINKED_STUDENT],
        [CAPABILITIES.GRADES_READ, SCOPES.LINKED_STUDENT],
        [CAPABILITIES.CLASSES_READ, SCOPES.LINKED_STUDENT],
        ...(options.sections ? [[CAPABILITIES.SECTIONS_READ, SCOPES.LINKED_STUDENT] as const] : []),
        [CAPABILITIES.TEACHERS_READ, SCOPES.SCHOOL],
        [CAPABILITIES.REPORTS_STUDENT_READ, SCOPES.LINKED_STUDENT],
      ]),
    },
    {
      key: 'student',
      description: 'Reads the signed-in student’s own learning records.',
      grants: grants('student', [
        [CAPABILITIES.SCHOOLS_READ, SCOPES.SCHOOL],
        [CAPABILITIES.STUDENTS_READ, SCOPES.SELF],
        [CAPABILITIES.GRADES_READ, SCOPES.SELF],
        [CAPABILITIES.CLASSES_READ, SCOPES.SELF],
        ...(options.sections ? [[CAPABILITIES.SECTIONS_READ, SCOPES.SELF] as const] : []),
        [CAPABILITIES.TEACHERS_READ, SCOPES.SCHOOL],
      ]),
    },
  ]
}

function platformRoleTemplates(): RoleTemplateDefinition[] {
  return [
    {
      key: 'super_admin',
      description: 'Operates the OpenSchool platform without implicit Tenant data access.',
      grants: grants('super_admin', [
        [CAPABILITIES.PLATFORM_TENANTS_READ, SCOPES.PLATFORM, [mfa, audit('platform.tenant.read')]],
        [
          CAPABILITIES.PLATFORM_TENANTS_MANAGE,
          SCOPES.PLATFORM,
          [mfa, recentReauthentication, audit('platform.tenant.manage')],
        ],
      ]),
    },
    {
      key: 'support_agent',
      description: 'Uses approved, time-bounded support access with explicit purpose.',
      grants: grants('support_agent', [
        [
          CAPABILITIES.SUPPORT_SESSIONS_USE,
          SCOPES.PLATFORM,
          [
            mfa,
            recentReauthentication,
            { kind: 'purpose', allowed: ['incident_response', 'customer_support'] },
            audit('support.session.use'),
          ],
        ],
        [
          CAPABILITIES.SUPPORT_SCHOOLS_READ,
          SCOPES.TENANT,
          [
            mfa,
            recentReauthentication,
            { kind: 'purpose', allowed: ['incident_response', 'customer_support'] },
            audit('support.school.read'),
          ],
        ],
        [
          CAPABILITIES.SUPPORT_STUDENTS_READ,
          SCOPES.TENANT,
          [
            mfa,
            recentReauthentication,
            { kind: 'purpose', allowed: ['incident_response', 'customer_support'] },
            audit('support.student.read'),
          ],
        ],
      ]),
    },
    {
      key: 'break_glass_operator',
      description: 'Uses separately held emergency credentials under mandatory incident review.',
      grants: grants('break_glass_operator', [
        [
          CAPABILITIES.PLATFORM_BREAK_GLASS_OPEN,
          SCOPES.PLATFORM,
          [
            mfa,
            recentReauthentication,
            { kind: 'purpose', allowed: ['incident_response'] },
            audit('support.break_glass.open'),
          ],
        ],
        [
          CAPABILITIES.SUPPORT_SCHOOLS_READ,
          SCOPES.TENANT,
          [mfa, recentReauthentication, audit('support.school.read')],
        ],
        [
          CAPABILITIES.SUPPORT_STUDENTS_READ,
          SCOPES.TENANT,
          [mfa, recentReauthentication, audit('support.student.read')],
        ],
      ]),
    },
  ]
}

const legacyParityBundle = createPolicyBundle({
  version: POLICY_VERSION_LEGACY_PARITY,
  // The rollback bundle preserves the accepted Tenant grant surface but keeps
  // the same safeguarding obligations; rollback never weakens MFA or audit.
  roleTemplates: tenantRoleTemplates({
    supportAccess: false,
    academicStructure: false,
    enrollmentLifecycle: false,
    guardianContacts: false,
    households: false,
    sections: false,
    duplicateReview: false,
  }),
})

const academicStructureBundle = createPolicyBundle({
  version: POLICY_VERSION_ACADEMIC_STRUCTURE,
  roleTemplates: [
    ...tenantRoleTemplates({
      supportAccess: true,
      academicStructure: true,
      enrollmentLifecycle: false,
      guardianContacts: false,
      households: false,
      sections: false,
      duplicateReview: false,
    }),
    ...platformRoleTemplates(),
  ],
})

const enrollmentLifecycleBundle = createPolicyBundle({
  version: POLICY_VERSION_ENROLLMENT_LIFECYCLE,
  roleTemplates: [
    ...tenantRoleTemplates({
      supportAccess: true,
      academicStructure: true,
      enrollmentLifecycle: true,
      guardianContacts: false,
      households: false,
      sections: false,
      duplicateReview: false,
    }),
    ...platformRoleTemplates(),
  ],
})

const guardianContactsBundle = createPolicyBundle({
  version: POLICY_VERSION_GUARDIAN_CONTACTS,
  roleTemplates: [
    ...tenantRoleTemplates({
      supportAccess: true,
      academicStructure: true,
      enrollmentLifecycle: true,
      guardianContacts: true,
      households: false,
      sections: false,
      duplicateReview: false,
    }),
    ...platformRoleTemplates(),
  ],
})

const householdsBundle = createPolicyBundle({
  version: POLICY_VERSION_HOUSEHOLDS,
  roleTemplates: [
    ...tenantRoleTemplates({
      supportAccess: true,
      academicStructure: true,
      enrollmentLifecycle: true,
      guardianContacts: true,
      households: true,
      sections: false,
      duplicateReview: false,
    }),
    ...platformRoleTemplates(),
  ],
})

const sectionsBundle = createPolicyBundle({
  version: POLICY_VERSION_SECTIONS,
  roleTemplates: [
    ...tenantRoleTemplates({
      supportAccess: true,
      academicStructure: true,
      enrollmentLifecycle: true,
      guardianContacts: true,
      households: true,
      sections: true,
      duplicateReview: false,
    }),
    ...platformRoleTemplates(),
  ],
})

const currentBundle = createPolicyBundle({
  version: POLICY_VERSION_CURRENT,
  roleTemplates: [
    ...tenantRoleTemplates({
      supportAccess: true,
      academicStructure: true,
      enrollmentLifecycle: true,
      guardianContacts: true,
      households: true,
      sections: true,
      duplicateReview: true,
    }),
    ...platformRoleTemplates(),
  ],
})

export const POLICY_BUNDLES: Readonly<Record<string, PolicyBundle>> = Object.freeze({
  [legacyParityBundle.version]: legacyParityBundle,
  [academicStructureBundle.version]: academicStructureBundle,
  [enrollmentLifecycleBundle.version]: enrollmentLifecycleBundle,
  [guardianContactsBundle.version]: guardianContactsBundle,
  [householdsBundle.version]: householdsBundle,
  [sectionsBundle.version]: sectionsBundle,
  [currentBundle.version]: currentBundle,
})

export const CURRENT_POLICY_BUNDLE = currentBundle

/** Returns undefined for an invalid deployment selection so evaluation fails closed. */
export function selectPolicyBundle(version?: string): PolicyBundle | undefined {
  if (!version) return CURRENT_POLICY_BUNDLE
  return POLICY_BUNDLES[version]
}
