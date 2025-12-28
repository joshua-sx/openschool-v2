import { getDb, organizations, schools, usersOnOrg, usersOnSchool } from '@openschool/db'
import { TRPCError } from '@trpc/server'
import { logAuditEvent } from '@openschool/audit'
import type { TenantContext } from '@openschool/rbac'

interface BootstrapOrganizationParams {
  userId: string
  orgName: string
  schoolName: string
  slug?: string // Optional, we can generate it
}

export async function bootstrapOrganization(
  params: BootstrapOrganizationParams
) {
  const db = getDb()

  // Generate slugs (simple version for now)
  const orgSlug = params.slug || params.orgName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).substring(2, 7)
  const schoolSlug = params.schoolName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).substring(2, 7)

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Create Organization
      const [org] = await tx
        .insert(organizations)
        .values({
          name: params.orgName,
          slug: orgSlug,
          settings: {},
        })
        .returning()

      if (!org) throw new Error('Failed to create organization')

      // 2. Create School
      const [school] = await tx
        .insert(schools)
        .values({
          orgId: org.id,
          name: params.schoolName,
          slug: schoolSlug,
          status: 'active',
          academicYear: new Date().getFullYear().toString(),
        })
        .returning()

      if (!school) throw new Error('Failed to create school')

      // 3. Add User as Org Admin
      await tx.insert(usersOnOrg).values({
        userId: params.userId,
        orgId: org.id,
        role: 'org_admin',
      })

      // 4. Add User as School Admin
      await tx.insert(usersOnSchool).values({
        userId: params.userId,
        schoolId: school.id,
        role: 'school_admin',
      })

      return { org, school }
    })

    // Log success outside transaction (best effort)
    // We construct a mock context because this is a bootstrap event
    const mockContext: TenantContext = {
      userId: params.userId,
      orgIds: [result.org.id],
      schoolIds: [result.school.id],
      classIds: [],
      studentIds: [],
      activeOrgId: result.org.id,
      activeSchoolId: result.school.id,
      effectiveRole: 'org_admin',
    }

    await logAuditEvent(mockContext, {
      action: 'create',
      resource: 'organization',
      resourceId: result.org.id,
      newValues: { name: params.orgName, schoolName: params.schoolName },
    })

    return result
  } catch (error) {
    console.error('Bootstrap failed:', error)
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to create organization. Please try again.',
      cause: error,
    })
  }
}

