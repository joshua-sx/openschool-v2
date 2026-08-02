import {
  type School,
  getDb,
  organizationTreeClosure,
  organizationTreeVersions,
  schoolGovernanceAssignments,
  schools,
} from '@openschool/db'
import {
  type AllowedPolicyDecision,
  CAPABILITIES,
  type Capability,
  type PolicyContext,
  type PolicyQueryConstraint,
} from '@openschool/rbac'
import { TRPCError } from '@trpc/server'
import { and, desc, eq, gt, isNull, lte, or } from 'drizzle-orm'

const MAX_ACCESSIBLE_SCHOOLS = 100
const MAX_POLICY_CONSTRAINTS = 16

function policyScopeDenied(): never {
  throw new TRPCError({ code: 'FORBIDDEN', message: 'POLICY_SCOPE_MISMATCH' })
}

function tenantPolicyConstraints(
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  expectedCapability: Capability
): readonly PolicyQueryConstraint[] {
  if (decision.capability !== expectedCapability) policyScopeDenied()
  if (!context.tenantId || decision.queryConstraints.length === 0) policyScopeDenied()
  if (decision.queryConstraints.length > MAX_POLICY_CONSTRAINTS) policyScopeDenied()
  for (const constraint of decision.queryConstraints) {
    if (constraint.kind === 'platform' || constraint.tenantId !== context.tenantId) {
      policyScopeDenied()
    }
  }
  return decision.queryConstraints
}

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

async function schoolsForConstraint(
  constraint: PolicyQueryConstraint,
  at: Date,
  schoolId?: string
): Promise<School[]> {
  if (constraint.kind === 'platform') return []
  const db = getDb()
  const schoolFilters = [eq(schools.tenantId, constraint.tenantId), eq(schools.status, 'active')]
  if (schoolId) schoolFilters.push(eq(schools.id, schoolId))

  switch (constraint.kind) {
    case 'tenant':
      return db
        .select()
        .from(schools)
        .where(and(...schoolFilters))
        .limit(schoolId ? 1 : MAX_ACCESSIBLE_SCHOOLS)
    case 'school':
      if (schoolId && schoolId !== constraint.schoolId) return []
      return db
        .select()
        .from(schools)
        .where(and(...schoolFilters, eq(schools.id, constraint.schoolId)))
        .limit(1)
    case 'organization_exact': {
      const rows = await db
        .select({ school: schools })
        .from(schools)
        .innerJoin(
          schoolGovernanceAssignments,
          and(
            eq(schoolGovernanceAssignments.tenantId, schools.tenantId),
            eq(schoolGovernanceAssignments.schoolId, schools.id),
            eq(schoolGovernanceAssignments.educationOrganizationId, constraint.organizationId),
            lte(schoolGovernanceAssignments.validFrom, at),
            or(
              isNull(schoolGovernanceAssignments.validUntil),
              gt(schoolGovernanceAssignments.validUntil, at)
            )
          )
        )
        .where(and(...schoolFilters))
        .limit(schoolId ? 1 : MAX_ACCESSIBLE_SCHOOLS)
      return rows.map(({ school }) => school)
    }
    case 'organization_subtree': {
      const treeVersionId = await getCurrentTreeVersionId(constraint.tenantId, at)
      if (!treeVersionId) return []
      const rows = await db
        .select({ school: schools })
        .from(schools)
        .innerJoin(
          schoolGovernanceAssignments,
          and(
            eq(schoolGovernanceAssignments.tenantId, schools.tenantId),
            eq(schoolGovernanceAssignments.schoolId, schools.id),
            lte(schoolGovernanceAssignments.validFrom, at),
            or(
              isNull(schoolGovernanceAssignments.validUntil),
              gt(schoolGovernanceAssignments.validUntil, at)
            )
          )
        )
        .innerJoin(
          organizationTreeClosure,
          and(
            eq(organizationTreeClosure.tenantId, schools.tenantId),
            eq(organizationTreeClosure.treeVersionId, treeVersionId),
            eq(organizationTreeClosure.ancestorOrganizationId, constraint.ancestorOrganizationId),
            eq(
              organizationTreeClosure.descendantOrganizationId,
              schoolGovernanceAssignments.educationOrganizationId
            )
          )
        )
        .where(and(...schoolFilters))
        .limit(schoolId ? 1 : MAX_ACCESSIBLE_SCHOOLS)
      return rows.map(({ school }) => school)
    }
    case 'class':
    case 'self':
    case 'linked_student':
      return []
  }
}

async function loadAuthorizedSchools(
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  expectedCapability: Capability,
  schoolId?: string
): Promise<School[]> {
  const constraints = tenantPolicyConstraints(context, decision, expectedCapability)
  const at = new Date()
  const rows = (
    await Promise.all(
      constraints.map((constraint) => schoolsForConstraint(constraint, at, schoolId))
    )
  ).flat()
  const unique = new Map(rows.map((school) => [school.id, school]))
  return [...unique.values()].slice(0, schoolId ? 1 : MAX_ACCESSIBLE_SCHOOLS)
}

/** Lists Schools through the exact constraints returned by the Policy Decision. */
export async function getAccessibleSchools(
  context: PolicyContext,
  decision: AllowedPolicyDecision
): Promise<School[]> {
  return loadAuthorizedSchools(context, decision, CAPABILITIES.SCHOOLS_READ)
}

/** Looks up one School without materializing a broader accessible-ID list. */
export async function getSchoolById(
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  schoolId: string,
  expectedCapability: Capability
): Promise<School | null> {
  const [school] = await loadAuthorizedSchools(context, decision, expectedCapability, schoolId)
  return school ?? null
}
