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
export const POLICY_VERSION_CURRENT = '2026-08-02.v1'

const audit = (event: string): PolicyObligation => ({ kind: 'audit', event })
const mfa: PolicyObligation = { kind: 'mfa', assuranceLevel: 'aal2' }

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

function tenantRoleTemplates(safeguarded: boolean): RoleTemplateDefinition[] {
  const protectedAdmin = (event: string): readonly PolicyObligation[] =>
    safeguarded ? [mfa, audit(event)] : []
  const recorded = (event: string): readonly PolicyObligation[] =>
    safeguarded ? [audit(event)] : []

  return [
    {
      key: 'org_admin',
      description: 'Manages the selected Education Organization subtree.',
      grants: grants('org_admin', [
        [CAPABILITIES.SCHOOLS_READ, SCOPES.ORGANIZATION_SUBTREE],
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
          protectedAdmin('account.manage'),
        ],
        [CAPABILITIES.AUDIT_READ, SCOPES.ORGANIZATION_SUBTREE, recorded('audit.read')],
      ]),
    },
    {
      key: 'org_viewer',
      description: 'Reads operational information in the selected Organization subtree.',
      grants: grants('org_viewer', [
        [CAPABILITIES.SCHOOLS_READ, SCOPES.ORGANIZATION_SUBTREE],
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
        [CAPABILITIES.ACCOUNTS_MANAGE, SCOPES.SCHOOL, protectedAdmin('account.manage')],
        [CAPABILITIES.AUDIT_READ, SCOPES.SCHOOL, recorded('audit.read')],
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
        [CAPABILITIES.TEACHERS_READ, SCOPES.SCHOOL],
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
        [CAPABILITIES.TEACHERS_READ, SCOPES.SCHOOL],
      ]),
    },
  ]
}

const legacyParityBundle = createPolicyBundle({
  version: POLICY_VERSION_LEGACY_PARITY,
  roleTemplates: tenantRoleTemplates(false),
})

const currentBundle = createPolicyBundle({
  version: POLICY_VERSION_CURRENT,
  roleTemplates: [
    ...tenantRoleTemplates(true),
    {
      key: 'super_admin',
      description: 'Operates the OpenSchool platform without implicit Tenant data access.',
      grants: grants('super_admin', [
        [CAPABILITIES.PLATFORM_TENANTS_READ, SCOPES.PLATFORM, [audit('platform.tenant.read')]],
        [
          CAPABILITIES.PLATFORM_TENANTS_MANAGE,
          SCOPES.PLATFORM,
          [mfa, audit('platform.tenant.manage')],
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
            { kind: 'reauthentication', maxAgeSeconds: 900 },
            { kind: 'purpose', allowed: ['incident_response', 'customer_support'] },
            audit('support.session.use'),
          ],
        ],
      ]),
    },
  ],
})

export const POLICY_BUNDLES: Readonly<Record<string, PolicyBundle>> = Object.freeze({
  [legacyParityBundle.version]: legacyParityBundle,
  [currentBundle.version]: currentBundle,
})

export const CURRENT_POLICY_BUNDLE = currentBundle

/** Returns undefined for an invalid deployment selection so evaluation fails closed. */
export function selectPolicyBundle(version?: string): PolicyBundle | undefined {
  if (!version) return CURRENT_POLICY_BUNDLE
  return POLICY_BUNDLES[version]
}
