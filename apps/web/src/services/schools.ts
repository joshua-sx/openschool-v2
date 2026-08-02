import {
  type School,
  getDb,
  organizationTreeClosure,
  organizationTreeVersions,
  schoolGovernanceAssignments,
  schools,
} from '@openschool/db'
import type { TenantContext } from '@openschool/rbac'
import { and, desc, eq, gt, isNull, lte, or } from 'drizzle-orm'

const MAX_ACCESSIBLE_SCHOOLS = 100

async function getCurrentTreeVersionId(tenantId: string, at: Date): Promise<string | null> {
  const db = getDb()
  const [treeVersion] = await db
    .select({ id: organizationTreeVersions.id })
    .from(organizationTreeVersions)
    .where(
      and(
        eq(organizationTreeVersions.tenantId, tenantId),
        lte(organizationTreeVersions.effectiveFrom, at)
      )
    )
    .orderBy(desc(organizationTreeVersions.effectiveFrom))
    .limit(1)

  return treeVersion?.id ?? null
}

/**
 * School Service
 *
 * Business logic for school operations with tenant access verification
 */

/**
 * Get all schools the user has access to
 */
export async function getAccessibleSchools(ctx: TenantContext): Promise<School[]> {
  const db = getDb()
  if (ctx.activeSchoolId) {
    return db
      .select()
      .from(schools)
      .where(
        and(
          eq(schools.tenantId, ctx.tenantId),
          eq(schools.id, ctx.activeSchoolId),
          eq(schools.status, 'active')
        )
      )
  }
  if (!ctx.activeEducationOrganizationId) return []

  const now = new Date()
  const treeVersionId = await getCurrentTreeVersionId(ctx.tenantId, now)
  if (!treeVersionId) return []

  const rows = await db
    .select({ school: schools })
    .from(schools)
    .innerJoin(
      schoolGovernanceAssignments,
      and(
        eq(schoolGovernanceAssignments.tenantId, schools.tenantId),
        eq(schoolGovernanceAssignments.schoolId, schools.id),
        lte(schoolGovernanceAssignments.validFrom, now),
        or(
          isNull(schoolGovernanceAssignments.validUntil),
          gt(schoolGovernanceAssignments.validUntil, now)
        )
      )
    )
    .innerJoin(
      organizationTreeClosure,
      and(
        eq(organizationTreeClosure.tenantId, schools.tenantId),
        eq(organizationTreeClosure.treeVersionId, treeVersionId),
        eq(organizationTreeClosure.ancestorOrganizationId, ctx.activeEducationOrganizationId),
        eq(
          organizationTreeClosure.descendantOrganizationId,
          schoolGovernanceAssignments.educationOrganizationId
        )
      )
    )
    .where(and(eq(schools.tenantId, ctx.tenantId), eq(schools.status, 'active')))
    .limit(MAX_ACCESSIBLE_SCHOOLS)

  return rows.map(({ school }) => school)
}

/**
 * Get a single school by ID
 * Verifies the school belongs to the user's accessible schools
 */
export async function getSchoolById(ctx: TenantContext, schoolId: string): Promise<School | null> {
  const db = getDb()
  if (ctx.activeSchoolId) {
    if (ctx.activeSchoolId !== schoolId) return null
    const [school] = await db
      .select()
      .from(schools)
      .where(
        and(
          eq(schools.tenantId, ctx.tenantId),
          eq(schools.id, schoolId),
          eq(schools.status, 'active')
        )
      )
      .limit(1)
    return school ?? null
  }
  if (!ctx.activeEducationOrganizationId) return null

  const now = new Date()
  const treeVersionId = await getCurrentTreeVersionId(ctx.tenantId, now)
  if (!treeVersionId) return null

  const [row] = await db
    .select({ school: schools })
    .from(schools)
    .innerJoin(
      schoolGovernanceAssignments,
      and(
        eq(schoolGovernanceAssignments.tenantId, schools.tenantId),
        eq(schoolGovernanceAssignments.schoolId, schools.id),
        lte(schoolGovernanceAssignments.validFrom, now),
        or(
          isNull(schoolGovernanceAssignments.validUntil),
          gt(schoolGovernanceAssignments.validUntil, now)
        )
      )
    )
    .innerJoin(
      organizationTreeClosure,
      and(
        eq(organizationTreeClosure.tenantId, schools.tenantId),
        eq(organizationTreeClosure.treeVersionId, treeVersionId),
        eq(organizationTreeClosure.ancestorOrganizationId, ctx.activeEducationOrganizationId),
        eq(
          organizationTreeClosure.descendantOrganizationId,
          schoolGovernanceAssignments.educationOrganizationId
        )
      )
    )
    .where(
      and(
        eq(schools.tenantId, ctx.tenantId),
        eq(schools.id, schoolId),
        eq(schools.status, 'active')
      )
    )
    .limit(1)

  return row?.school ?? null
}
