/**
 * System Roles for OpenSchool
 *
 * Hierarchical role system with 8 core roles:
 * - super_admin: Platform-level access (all orgs)
 * - org_admin: Organization administrator (district-level)
 * - org_viewer: Organization viewer (read-only district-level)
 * - school_admin: School administrator (school-level)
 * - staff: School staff member (non-teaching)
 * - teacher: Classroom teacher
 * - parent: Parent/guardian of student(s)
 * - student: Student user
 *
 * Role hierarchy (higher number = more permissions):
 * super_admin (100) > org_admin (80) > org_viewer (70) > school_admin (60) > staff (40) > teacher (30) > parent (20) > student (10)
 */
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ORG_ADMIN: 'org_admin',
  ORG_VIEWER: 'org_viewer',
  SCHOOL_ADMIN: 'school_admin',
  STAFF: 'staff',
  TEACHER: 'teacher',
  PARENT: 'parent',
  STUDENT: 'student',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

/**
 * Role hierarchy for permission resolution.
 * Higher numbers indicate more permissions.
 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  super_admin: 100,
  org_admin: 80,
  org_viewer: 70,
  school_admin: 60,
  staff: 40,
  teacher: 30,
  parent: 20,
  student: 10,
}