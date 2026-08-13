import type { ResourceKind, ScopeKind } from './types'

export const SCOPES = Object.freeze({
  PLATFORM: 'platform',
  TENANT: 'tenant',
  ORGANIZATION_EXACT: 'organization_exact',
  ORGANIZATION_SUBTREE: 'organization_subtree',
  SCHOOL: 'school',
  CLASS: 'class',
  SELF: 'self',
  LINKED_STUDENT: 'linked_student',
} as const satisfies Record<string, ScopeKind>)

export const RESOURCE_KINDS = Object.freeze({
  PLATFORM: 'platform',
  TENANT: 'tenant',
  EDUCATION_ORGANIZATION: 'education_organization',
  SCHOOL: 'school',
  ACADEMIC_STRUCTURE: 'academic_structure',
  STUDENT_ENROLLMENT: 'student_enrollment',
  GUARDIAN_CONTACT: 'guardian_contact',
  HOUSEHOLD: 'household',
  SECTION: 'section',
  CLASS: 'class',
  STUDENT: 'student',
  GRADE: 'grade',
  TEACHER: 'teacher',
  REPORT: 'report',
  SETTINGS: 'settings',
  ACCOUNT: 'account',
  AUDIT_LOG: 'audit_log',
  SUPPORT_SESSION: 'support_session',
} as const satisfies Record<string, ResourceKind>)

export const CAPABILITIES = Object.freeze({
  PLATFORM_TENANTS_READ: 'platform.tenants.read',
  PLATFORM_TENANTS_MANAGE: 'platform.tenants.manage',
  PLATFORM_BREAK_GLASS_OPEN: 'platform.break_glass.open',
  SUPPORT_GRANTS_MANAGE: 'tenant.support.grants.manage',
  SUPPORT_SESSIONS_USE: 'support.sessions.use',
  SUPPORT_SCHOOLS_READ: 'support.schools.read',
  SUPPORT_STUDENTS_READ: 'support.students.read',
  SCHOOLS_READ: 'tenant.schools.read',
  ACADEMIC_STRUCTURE_READ: 'tenant.academic_structure.read',
  ACADEMIC_STRUCTURE_MANAGE: 'tenant.academic_structure.manage',
  STUDENT_ENROLLMENTS_READ: 'tenant.student_enrollments.read',
  STUDENT_ENROLLMENTS_MANAGE: 'tenant.student_enrollments.manage',
  GUARDIAN_CONTACTS_READ: 'tenant.guardian_contacts.read',
  GUARDIAN_CONTACTS_MANAGE: 'tenant.guardian_contacts.manage',
  HOUSEHOLDS_READ: 'tenant.households.read',
  HOUSEHOLDS_MANAGE: 'tenant.households.manage',
  SECTIONS_READ: 'tenant.sections.read',
  SECTIONS_MANAGE: 'tenant.sections.manage',
  STUDENTS_CREATE: 'tenant.students.create',
  STUDENTS_READ: 'tenant.students.read',
  STUDENTS_UPDATE: 'tenant.students.update',
  STUDENTS_DELETE: 'tenant.students.delete',
  GRADES_CREATE: 'tenant.grades.create',
  GRADES_READ: 'tenant.grades.read',
  GRADES_UPDATE: 'tenant.grades.update',
  GRADES_DELETE: 'tenant.grades.delete',
  CLASSES_CREATE: 'tenant.classes.create',
  CLASSES_READ: 'tenant.classes.read',
  CLASSES_UPDATE: 'tenant.classes.update',
  CLASSES_DELETE: 'tenant.classes.delete',
  TEACHERS_CREATE: 'tenant.teachers.create',
  TEACHERS_READ: 'tenant.teachers.read',
  TEACHERS_UPDATE: 'tenant.teachers.update',
  TEACHERS_DELETE: 'tenant.teachers.delete',
  REPORTS_SCHOOL_READ: 'tenant.reports.school.read',
  REPORTS_CLASS_READ: 'tenant.reports.class.read',
  REPORTS_STUDENT_READ: 'tenant.reports.student.read',
  SETTINGS_ORGANIZATION_MANAGE: 'tenant.settings.organization.manage',
  SETTINGS_SCHOOL_MANAGE: 'tenant.settings.school.manage',
  ACCOUNTS_INVITE: 'tenant.accounts.invite',
  ACCOUNTS_MANAGE: 'tenant.accounts.manage',
  AUDIT_READ: 'tenant.audit.read',
} as const)

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES]

export interface CapabilityDefinition {
  resourceKinds: readonly ResourceKind[]
  scopes: readonly ScopeKind[]
}

const tenantBroadScopes = [
  SCOPES.TENANT,
  SCOPES.ORGANIZATION_EXACT,
  SCOPES.ORGANIZATION_SUBTREE,
  SCOPES.SCHOOL,
] as const

export const CAPABILITY_REGISTRY = Object.freeze({
  [CAPABILITIES.PLATFORM_TENANTS_READ]: {
    resourceKinds: [RESOURCE_KINDS.PLATFORM, RESOURCE_KINDS.TENANT],
    scopes: [SCOPES.PLATFORM],
  },
  [CAPABILITIES.PLATFORM_TENANTS_MANAGE]: {
    resourceKinds: [RESOURCE_KINDS.PLATFORM, RESOURCE_KINDS.TENANT],
    scopes: [SCOPES.PLATFORM],
  },
  [CAPABILITIES.PLATFORM_BREAK_GLASS_OPEN]: {
    resourceKinds: [RESOURCE_KINDS.PLATFORM, RESOURCE_KINDS.SUPPORT_SESSION, RESOURCE_KINDS.TENANT],
    scopes: [SCOPES.PLATFORM],
  },
  [CAPABILITIES.SUPPORT_GRANTS_MANAGE]: {
    resourceKinds: [RESOURCE_KINDS.SUPPORT_SESSION],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.SUPPORT_SESSIONS_USE]: {
    resourceKinds: [RESOURCE_KINDS.SUPPORT_SESSION],
    scopes: [SCOPES.PLATFORM],
  },
  [CAPABILITIES.SUPPORT_SCHOOLS_READ]: {
    resourceKinds: [RESOURCE_KINDS.SCHOOL],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.SUPPORT_STUDENTS_READ]: {
    resourceKinds: [RESOURCE_KINDS.STUDENT],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.SCHOOLS_READ]: {
    resourceKinds: [RESOURCE_KINDS.SCHOOL],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.ACADEMIC_STRUCTURE_READ]: {
    resourceKinds: [RESOURCE_KINDS.ACADEMIC_STRUCTURE],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.ACADEMIC_STRUCTURE_MANAGE]: {
    resourceKinds: [RESOURCE_KINDS.ACADEMIC_STRUCTURE],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.STUDENT_ENROLLMENTS_READ]: {
    resourceKinds: [RESOURCE_KINDS.STUDENT_ENROLLMENT],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.STUDENT_ENROLLMENTS_MANAGE]: {
    resourceKinds: [RESOURCE_KINDS.STUDENT_ENROLLMENT],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.GUARDIAN_CONTACTS_READ]: {
    resourceKinds: [RESOURCE_KINDS.GUARDIAN_CONTACT],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.GUARDIAN_CONTACTS_MANAGE]: {
    resourceKinds: [RESOURCE_KINDS.GUARDIAN_CONTACT],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.HOUSEHOLDS_READ]: {
    resourceKinds: [RESOURCE_KINDS.HOUSEHOLD],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.HOUSEHOLDS_MANAGE]: {
    resourceKinds: [RESOURCE_KINDS.HOUSEHOLD],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.SECTIONS_READ]: {
    resourceKinds: [RESOURCE_KINDS.SECTION],
    scopes: [...tenantBroadScopes, SCOPES.CLASS, SCOPES.SELF, SCOPES.LINKED_STUDENT],
  },
  [CAPABILITIES.SECTIONS_MANAGE]: {
    resourceKinds: [RESOURCE_KINDS.SECTION],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.STUDENTS_CREATE]: {
    resourceKinds: [RESOURCE_KINDS.SCHOOL],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.STUDENTS_READ]: {
    resourceKinds: [RESOURCE_KINDS.STUDENT],
    scopes: [...tenantBroadScopes, SCOPES.CLASS, SCOPES.SELF, SCOPES.LINKED_STUDENT],
  },
  [CAPABILITIES.STUDENTS_UPDATE]: {
    resourceKinds: [RESOURCE_KINDS.STUDENT],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.STUDENTS_DELETE]: {
    resourceKinds: [RESOURCE_KINDS.STUDENT],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.GRADES_CREATE]: {
    resourceKinds: [RESOURCE_KINDS.GRADE],
    scopes: [SCOPES.CLASS],
  },
  [CAPABILITIES.GRADES_READ]: {
    resourceKinds: [RESOURCE_KINDS.GRADE],
    scopes: [...tenantBroadScopes, SCOPES.CLASS, SCOPES.SELF, SCOPES.LINKED_STUDENT],
  },
  [CAPABILITIES.GRADES_UPDATE]: {
    resourceKinds: [RESOURCE_KINDS.GRADE],
    scopes: [...tenantBroadScopes, SCOPES.CLASS],
  },
  [CAPABILITIES.GRADES_DELETE]: {
    resourceKinds: [RESOURCE_KINDS.GRADE],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.CLASSES_CREATE]: {
    resourceKinds: [RESOURCE_KINDS.SCHOOL],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.CLASSES_READ]: {
    resourceKinds: [RESOURCE_KINDS.CLASS],
    scopes: [...tenantBroadScopes, SCOPES.CLASS, SCOPES.SELF, SCOPES.LINKED_STUDENT],
  },
  [CAPABILITIES.CLASSES_UPDATE]: {
    resourceKinds: [RESOURCE_KINDS.CLASS],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.CLASSES_DELETE]: {
    resourceKinds: [RESOURCE_KINDS.CLASS],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.TEACHERS_CREATE]: {
    resourceKinds: [RESOURCE_KINDS.SCHOOL],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.TEACHERS_READ]: {
    resourceKinds: [RESOURCE_KINDS.TEACHER],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.TEACHERS_UPDATE]: {
    resourceKinds: [RESOURCE_KINDS.TEACHER],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.TEACHERS_DELETE]: {
    resourceKinds: [RESOURCE_KINDS.TEACHER],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.REPORTS_SCHOOL_READ]: {
    resourceKinds: [RESOURCE_KINDS.REPORT],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.REPORTS_CLASS_READ]: {
    resourceKinds: [RESOURCE_KINDS.REPORT],
    scopes: [...tenantBroadScopes, SCOPES.CLASS],
  },
  [CAPABILITIES.REPORTS_STUDENT_READ]: {
    resourceKinds: [RESOURCE_KINDS.REPORT],
    scopes: [...tenantBroadScopes, SCOPES.CLASS, SCOPES.SELF, SCOPES.LINKED_STUDENT],
  },
  [CAPABILITIES.SETTINGS_ORGANIZATION_MANAGE]: {
    resourceKinds: [RESOURCE_KINDS.SETTINGS],
    scopes: [SCOPES.TENANT, SCOPES.ORGANIZATION_EXACT],
  },
  [CAPABILITIES.SETTINGS_SCHOOL_MANAGE]: {
    resourceKinds: [RESOURCE_KINDS.SETTINGS],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.ACCOUNTS_INVITE]: {
    resourceKinds: [RESOURCE_KINDS.ACCOUNT],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.ACCOUNTS_MANAGE]: {
    resourceKinds: [RESOURCE_KINDS.ACCOUNT],
    scopes: tenantBroadScopes,
  },
  [CAPABILITIES.AUDIT_READ]: {
    resourceKinds: [RESOURCE_KINDS.AUDIT_LOG],
    scopes: tenantBroadScopes,
  },
} as const satisfies Record<Capability, CapabilityDefinition>)

const scopeValues = new Set<string>(Object.values(SCOPES))
const resourceValues = new Set<string>(Object.values(RESOURCE_KINDS))

export function isCapability(value: unknown): value is Capability {
  return typeof value === 'string' && value in CAPABILITY_REGISTRY
}

export function isScopeKind(value: unknown): value is ScopeKind {
  return typeof value === 'string' && scopeValues.has(value)
}

export function isResourceKind(value: unknown): value is ResourceKind {
  return typeof value === 'string' && resourceValues.has(value)
}
