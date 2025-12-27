export const ROLES = {
    SUPER_ADMIN: 'super_admin',
    ORG_ADMIN: 'org_admin',
    SCHOOL_ADMIN: 'school_admin',
    STAFF: 'staff',
    TEACHER: 'teacher',
    PARENT: 'parent',
    STUDENT: 'student',
  } as const
  
  export type Role = (typeof ROLES)[keyof typeof ROLES]
  
  export const ROLE_HIERARCHY: Record<Role, number> = {
    super_admin: 100,
    org_admin: 80,
    school_admin: 60,
    staff: 40,
    teacher: 30,
    parent: 20,
    student: 10,
  }