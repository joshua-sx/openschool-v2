import { eq, inArray } from 'drizzle-orm'
import { getDb, schools, type School } from '@openschool/db'
import type { TenantContext } from '@openschool/rbac'

/**
 * School Service
 *
 * Business logic for school operations with tenant access verification
 */

/**
 * Get all schools the user has access to
 */
export async function getAccessibleSchools(
  ctx: TenantContext
): Promise<School[]> {
  if (ctx.schoolIds.length === 0) {
    return []
  }

  const db = getDb()
  return await db
    .select()
    .from(schools)
    .where(inArray(schools.id, ctx.schoolIds))
}

/**
 * Get a single school by ID
 * Verifies the school belongs to the user's accessible schools
 */
export async function getSchoolById(
  ctx: TenantContext,
  schoolId: string
): Promise<School | null> {
  // Verify tenant access
  if (!ctx.schoolIds.includes(schoolId)) {
    return null
  }

  const db = getDb()
  const school = await db
    .select()
    .from(schools)
    .where(eq(schools.id, schoolId))
    .limit(1)
    .then((rows) => rows[0] ?? null)

  return school
}
