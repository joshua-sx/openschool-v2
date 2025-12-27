export const PERMISSIONS = {
    // Student management
    'students:create': ['org_admin', 'school_admin', 'staff'],
    'students:read': [
      'org_admin',
      'school_admin',
      'staff',
      'teacher',
      'parent:own',
      'student:own',
    ],
    'students:update': ['org_admin', 'school_admin', 'staff'],
    'students:delete': ['org_admin', 'school_admin'],
  
    // Grades
    'grades:create': ['teacher:own_class'],
    'grades:read': [
      'org_admin',
      'school_admin',
      'staff',
      'teacher:own_class',
      'parent:own_child',
      'student:own',
    ],
    'grades:update': ['teacher:own_class', 'school_admin'],
    'grades:delete': ['school_admin'],
  
    // Classes
    'classes:create': ['org_admin', 'school_admin'],
    'classes:read': [
      'org_admin',
      'school_admin',
      'staff',
      'teacher:own',
      'parent:child_class',
      'student:own',
    ],
    'classes:update': ['org_admin', 'school_admin'],
    'classes:delete': ['org_admin', 'school_admin'],
  
    // Teachers
    'teachers:create': ['org_admin', 'school_admin'],
    'teachers:read': ['org_admin', 'school_admin', 'staff', 'teacher', 'parent', 'student'],
    'teachers:update': ['org_admin', 'school_admin'],
    'teachers:delete': ['org_admin', 'school_admin'],
  
    // Reports
    'reports:school': ['org_admin', 'school_admin'],
    'reports:class': ['org_admin', 'school_admin', 'teacher:own_class'],
    'reports:student': ['org_admin', 'school_admin', 'teacher:own_class', 'parent:own_child'],
  
    // Settings
    'settings:org': ['org_admin'],
    'settings:school': ['org_admin', 'school_admin'],
  
    // Users
    'users:invite': ['org_admin', 'school_admin'],
    'users:manage': ['org_admin', 'school_admin'],
  
    // Audit logs
    'audit:read': ['org_admin', 'school_admin'],
  } as const
  
  export type Permission = keyof typeof PERMISSIONS