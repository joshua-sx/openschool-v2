import { getDb, usersOnOrg, usersOnSchool, teachersOnClass, parentStudent } from '@openschool/db'
import { eq } from 'drizzle-orm'
import type { TenantContext } from '@openschool/rbac'
import type { Role } from '@openschool/rbac'

export async function resolveTenantContext(
  userId: string,
  requestContext: { orgId?: string; schoolId?: string } = {}
): Promise<TenantContext> {
  const db = getDb()

  // Get all org memberships
  const orgMemberships = await db
    .select()
    .from(usersOnOrg)
    .where(eq(usersOnOrg.userId, userId))

  // Get all school memberships
  const schoolMemberships = await db
    .select()
    .from(usersOnSchool)
    .where(eq(usersOnSchool.userId, userId))

  // Get all class assignments (for teachers)
  const classAssignments = await db
    .select()
    .from(teachersOnClass)
    .where(eq(teachersOnClass.userId, userId))

  // Get all linked students (for parents)
  const linkedStudents = await db
    .select()
    .from(parentStudent)
    .where(eq(parentStudent.parentId, userId))

  // Resolve accessible IDs
  const orgIds = [orgMemberships.map](http://orgMemberships.map)((m) => m.orgId)
  const schoolIds = [schoolMemberships.map](http://schoolMemberships.map)((m) => m.schoolId)
  const classIds = [classAssignments.map](http://classAssignments.map)((a) => a.classId)
  const studentIds = [linkedStudents.map](http://linkedStudents.map)((l) => l.studentId)

  // Determine effective role for the requested context
  let effectiveRole: Role = 'student' // Default lowest

  if (requestContext.orgId && orgMemberships.some((m) => m.orgId === requestContext.orgId)) {
    const membership = orgMemberships.find((m) => m.orgId === requestContext.orgId)
    effectiveRole = membership?.role as Role
  } else if (
    requestContext.schoolId &&
    schoolMemberships.some((m) => m.schoolId === requestContext.schoolId)
  ) {
    const membership = schoolMemberships.find((m) => m.schoolId === requestContext.schoolId)
    effectiveRole = membership?.role as Role
  } else if (linkedStudents.length > 0) {
    effectiveRole = 'parent'
  }

  return {
    userId,
    orgIds,
    schoolIds,
    classIds,
    studentIds,
    activeOrgId: requestContext.orgId,
    activeSchoolId: requestContext.schoolId,
    effectiveRole,
  }
}