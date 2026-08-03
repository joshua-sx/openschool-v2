import {
  type DatabaseTransaction,
  accountLinks,
  accountSessions,
  accounts,
  affiliations,
  bindIdentityTenantResolutionContext,
  classes,
  educationOrganizations,
  organizationTreeClosure,
  organizationTreeVersions,
  parentStudent,
  people,
  personRelationships,
  roleTemplateAssignments,
  schoolGovernanceAssignments,
  schools,
  studentProfiles,
  students,
  tenants,
  usersOnOrg,
  usersOnSchool,
  withIdentityTransaction,
  withTenantTransaction,
} from '@openschool/db'
import { and, desc, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm'
import {
  MAX_CONTEXT_CACHE_TTL_MS,
  TENANT_CONTEXT_POLICY_VERSION,
  type TenantRequestContextCache,
  buildTenantContextCacheKey,
} from './context-cache'
import type { AssuranceLevel, VerifiedAccountIdentity } from './verified-identity'

type Database = DatabaseTransaction

export type TenantContextDenialReason =
  | 'UNAUTHENTICATED'
  | 'TOKEN_INVALID'
  | 'SESSION_REVOKED'
  | 'ACCOUNT_DISABLED'
  | 'CONTEXT_REQUIRED'
  | 'TENANT_DENIED'
  | 'ORG_DENIED'
  | 'SCHOOL_DENIED'
  | 'SCOPE_MISMATCH'
  | 'AFFILIATION_EXPIRED'
  | 'MFA_REQUIRED'
  | 'POLICY_DENIED'

export interface TenantContextSelectors {
  tenantId?: string
  educationOrganizationId?: string
  schoolId?: string
}

export interface TenantRequestMetadata {
  requestId: string
}

export interface TenantRequestContext {
  version: 1
  contextPolicyVersion: number
  accountId: string
  legacyUserId?: string
  personId: string
  tenantId: string
  tenantName: string
  sessionId: string
  membershipVersion: number
  securityVersion: number
  assuranceLevel: AssuranceLevel
  /** Newest provider-verified interactive authentication observed for this session. */
  reauthenticatedAt?: string
  activeEducationOrganizationId?: string
  activeEducationOrganizationName?: string
  activeSchoolId?: string
  activeSchoolName?: string
  roleTemplateKeys: readonly string[]
  requestId: string
  resolvedAt: string
  expiresAt: string
  legacyComparison: 'matched' | 'not_applicable' | 'observed_expansion'
}

export type LegacyComparisonMode = 'off' | 'observe' | 'enforce'

export interface TenantRequestContextResolverOptions {
  cache?: TenantRequestContextCache<TenantRequestContext>
  comparisonMode?: LegacyComparisonMode
  requiredAssuranceLevel?: AssuranceLevel
  at?: Date
}

export interface AvailableTenantContext {
  key: string
  tenantId: string
  tenantName: string
  educationOrganizationId?: string
  educationOrganizationName?: string
  schoolId?: string
  schoolName?: string
  roleTemplateKeys: readonly string[]
}

export class TenantRequestContextError extends Error {
  constructor(
    readonly reason: TenantContextDenialReason,
    message: string
  ) {
    super(message)
    this.name = 'TenantRequestContextError'
  }
}

interface AccountRecord {
  id: string
  legacyUserId: string | null
  status: 'active' | 'disabled' | 'deleted'
  membershipVersion: number
  securityVersion: number
}

interface EffectiveAssignment {
  affiliationId: string
  kind: string
  scopeType: 'tenant' | 'education_organization' | 'school' | 'class'
  educationOrganizationId: string | null
  schoolId: string | null
  classId: string | null
  affiliationValidFrom: Date
  affiliationValidUntil: Date | null
  roleTemplateKey: string
  roleValidFrom: Date
  roleValidUntil: Date | null
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_ASSIGNMENT_ROWS = 64
const MAX_CONTEXT_ROLE_KEYS = 32
const MAX_GUARDIAN_SCHOOLS = 50

function denial(reason: TenantContextDenialReason, message: string): never {
  throw new TenantRequestContextError(reason, message)
}

function isEffectivePeriod(validFrom: Date, validUntil: Date | null, at: Date): boolean {
  return validFrom.getTime() <= at.getTime() && (validUntil === null || at < validUntil)
}

function assuranceMeets(actual: AssuranceLevel, required: AssuranceLevel): boolean {
  return required === 'aal1' || actual === 'aal2'
}

function validateSelectors(selectors: TenantContextSelectors): void {
  if (selectors.tenantId && !UUID_PATTERN.test(selectors.tenantId)) {
    denial('TENANT_DENIED', 'Tenant selector is invalid')
  }
  if (selectors.educationOrganizationId && !UUID_PATTERN.test(selectors.educationOrganizationId)) {
    denial('ORG_DENIED', 'Education Organization selector is invalid')
  }
  if (selectors.schoolId && !UUID_PATTERN.test(selectors.schoolId)) {
    denial('SCHOOL_DENIED', 'School selector is invalid')
  }
}

async function resolveActiveAccount(
  db: Database,
  identity: VerifiedAccountIdentity
): Promise<AccountRecord> {
  const [account] = await db
    .select({
      id: accounts.id,
      legacyUserId: accounts.legacyUserId,
      status: accounts.status,
      membershipVersion: accounts.membershipVersion,
      securityVersion: accounts.securityVersion,
    })
    .from(accounts)
    .where(
      and(
        eq(accounts.identityProvider, identity.provider),
        eq(accounts.providerSubject, identity.subject)
      )
    )
    .limit(1)

  if (!account) denial('TENANT_DENIED', 'Verified identity has no provisioned OpenSchool Account')
  if (account.status !== 'active') denial('ACCOUNT_DISABLED', 'OpenSchool Account is disabled')
  return account
}

async function resolveAccountSession(
  db: Database,
  account: AccountRecord,
  identity: VerifiedAccountIdentity,
  at: Date
): Promise<Date | null> {
  const loadSession = () =>
    db
      .select({
        accountId: accountSessions.accountId,
        assuranceLevel: accountSessions.assuranceLevel,
        expiresAt: accountSessions.expiresAt,
        lastSeenAt: accountSessions.lastSeenAt,
        reauthenticatedAt: accountSessions.reauthenticatedAt,
        status: accountSessions.status,
        securityVersion: accountSessions.securityVersion,
      })
      .from(accountSessions)
      .where(eq(accountSessions.providerSessionId, identity.sessionId))
      .limit(1)

  let [session] = await loadSession()
  if (!session) {
    await db
      .insert(accountSessions)
      .values({
        accountId: account.id,
        providerSessionId: identity.sessionId,
        assuranceLevel: identity.assuranceLevel,
        securityVersion: account.securityVersion,
        authenticatedAt: new Date(identity.issuedAt),
        ...(identity.reauthenticatedAt
          ? { reauthenticatedAt: new Date(identity.reauthenticatedAt) }
          : {}),
        expiresAt: new Date(identity.expiresAt),
        lastSeenAt: at,
      })
      .onConflictDoNothing()
    const reloadedSessions = await loadSession()
    session = reloadedSessions[0]
  }

  if (
    !session ||
    session.accountId !== account.id ||
    session.status !== 'active' ||
    session.securityVersion !== account.securityVersion
  ) {
    denial('SESSION_REVOKED', 'Account session is revoked, expired, or version-stale')
  }

  const tokenExpiresAt = new Date(identity.expiresAt)
  const verifiedReauthenticatedAt = identity.reauthenticatedAt
    ? new Date(identity.reauthenticatedAt)
    : null
  const newestReauthenticatedAt =
    verifiedReauthenticatedAt &&
    (!session.reauthenticatedAt ||
      verifiedReauthenticatedAt.getTime() > session.reauthenticatedAt.getTime())
      ? verifiedReauthenticatedAt
      : session.reauthenticatedAt
  const lastSeenRefreshBoundary = at.getTime() - 60_000
  if (
    session.assuranceLevel !== identity.assuranceLevel ||
    session.expiresAt.getTime() !== tokenExpiresAt.getTime() ||
    newestReauthenticatedAt?.getTime() !== session.reauthenticatedAt?.getTime() ||
    session.lastSeenAt.getTime() <= lastSeenRefreshBoundary
  ) {
    await db
      .update(accountSessions)
      .set({
        assuranceLevel: identity.assuranceLevel,
        expiresAt: tokenExpiresAt,
        reauthenticatedAt: newestReauthenticatedAt,
        lastSeenAt: at,
        updatedAt: at,
      })
      .where(eq(accountSessions.providerSessionId, identity.sessionId))
  }
  return newestReauthenticatedAt
}

/** Registers or refreshes the revocable Account session for a verified identity. */
export async function registerVerifiedAccountSession(
  identity: VerifiedAccountIdentity,
  requestId = crypto.randomUUID(),
  at = new Date()
): Promise<void> {
  await withIdentityTransaction(
    {
      identityProvider: identity.provider,
      providerSubject: identity.subject,
      providerSessionId: identity.sessionId,
      requestId,
      assuranceLevel: identity.assuranceLevel,
    },
    async (database) => {
      const account = await resolveActiveAccount(database, identity)
      await resolveAccountSession(database, account, identity, at)
    }
  )
}

async function currentOrganizationTreeVersionId(
  db: Database,
  tenantId: string,
  at: Date
): Promise<string | null> {
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

async function isOrganizationAncestor(
  db: Database,
  tenantId: string,
  treeVersionId: string | null,
  ancestorId: string,
  descendantId: string
): Promise<boolean> {
  if (!treeVersionId) return false

  const [edge] = await db
    .select({ depth: organizationTreeClosure.depth })
    .from(organizationTreeClosure)
    .where(
      and(
        eq(organizationTreeClosure.tenantId, tenantId),
        eq(organizationTreeClosure.treeVersionId, treeVersionId),
        eq(organizationTreeClosure.ancestorOrganizationId, ancestorId),
        eq(organizationTreeClosure.descendantOrganizationId, descendantId)
      )
    )
    .limit(1)

  return Boolean(edge)
}

async function currentSchoolGovernanceOrganization(
  db: Database,
  tenantId: string,
  schoolId: string,
  at: Date
): Promise<string | null> {
  const [assignment] = await db
    .select({ organizationId: schoolGovernanceAssignments.educationOrganizationId })
    .from(schoolGovernanceAssignments)
    .where(
      and(
        eq(schoolGovernanceAssignments.tenantId, tenantId),
        eq(schoolGovernanceAssignments.schoolId, schoolId),
        lte(schoolGovernanceAssignments.validFrom, at),
        or(
          isNull(schoolGovernanceAssignments.validUntil),
          gt(schoolGovernanceAssignments.validUntil, at)
        )
      )
    )
    .limit(1)
  return assignment?.organizationId ?? null
}

async function loadGuardianSchoolIds(
  db: Database,
  tenantId: string,
  guardianPersonId: string,
  at: Date,
  limit = MAX_GUARDIAN_SCHOOLS + 1
): Promise<string[]> {
  await bindIdentityTenantResolutionContext(db, {
    tenantId,
    personId: guardianPersonId,
    queryConstraints: [{ kind: 'linked_student', tenantId, guardianPersonId }],
  })
  const relationships = await db
    .selectDistinct({ schoolId: students.schoolId })
    .from(personRelationships)
    .innerJoin(
      studentProfiles,
      and(
        eq(studentProfiles.tenantId, personRelationships.tenantId),
        eq(studentProfiles.personId, personRelationships.relatedPersonId),
        eq(studentProfiles.status, 'active')
      )
    )
    .innerJoin(
      students,
      and(
        eq(students.tenantId, studentProfiles.tenantId),
        eq(students.id, studentProfiles.legacyStudentId),
        eq(students.status, 'active')
      )
    )
    .where(
      and(
        eq(personRelationships.tenantId, tenantId),
        eq(personRelationships.subjectPersonId, guardianPersonId),
        inArray(personRelationships.type, ['guardian_of', 'parent_of']),
        eq(personRelationships.status, 'active'),
        lte(personRelationships.validFrom, at),
        or(isNull(personRelationships.validUntil), gt(personRelationships.validUntil, at))
      )
    )
    .limit(limit)

  return relationships.map(({ schoolId }) => schoolId)
}

async function loadActiveSchoolNames(
  db: Database,
  tenantId: string,
  personId: string,
  schoolIds: readonly string[]
): Promise<Array<{ id: string; name: string }>> {
  const rows: Array<{ id: string; name: string }> = []
  for (let offset = 0; offset < schoolIds.length; offset += 16) {
    const batch = schoolIds.slice(offset, offset + 16)
    await bindIdentityTenantResolutionContext(db, {
      tenantId,
      personId,
      queryConstraints: batch.map((schoolId) => ({ kind: 'school', tenantId, schoolId })),
    })
    rows.push(
      ...(await db
        .select({ id: schools.id, name: schools.name })
        .from(schools)
        .where(
          and(
            eq(schools.tenantId, tenantId),
            inArray(schools.id, batch),
            eq(schools.status, 'active')
          )
        ))
    )
  }
  return rows
}

async function loadLegacyRoleKeys(
  db: Database,
  legacyUserId: string,
  tenantId: string,
  selectedOrganizationId?: string,
  selectedSchoolId?: string
): Promise<Set<string>> {
  const [orgMemberships, schoolMemberships, guardianLinks] = await Promise.all([
    db
      .select({ organizationId: usersOnOrg.orgId, role: usersOnOrg.role })
      .from(usersOnOrg)
      .where(and(eq(usersOnOrg.tenantId, tenantId), eq(usersOnOrg.userId, legacyUserId))),
    db
      .select({ role: usersOnSchool.role, schoolId: usersOnSchool.schoolId })
      .from(usersOnSchool)
      .where(and(eq(usersOnSchool.tenantId, tenantId), eq(usersOnSchool.userId, legacyUserId))),
    db
      .select({ id: parentStudent.id })
      .from(parentStudent)
      .where(and(eq(parentStudent.tenantId, tenantId), eq(parentStudent.parentId, legacyUserId)))
      .limit(1),
  ])

  if (selectedOrganizationId) {
    const organizationRoles = orgMemberships
      .filter(({ organizationId }) => organizationId === selectedOrganizationId)
      .map(({ role }) => role)
    if (organizationRoles.length > 0) return new Set(organizationRoles)
  }
  if (selectedSchoolId) {
    const schoolRoles = schoolMemberships
      .filter(({ schoolId }) => schoolId === selectedSchoolId)
      .map(({ role }) => role)
    if (schoolRoles.length > 0) return new Set(schoolRoles)
  }
  if (guardianLinks.length > 0) return new Set(['parent'])

  // The legacy resolver selected the first remaining membership without a
  // deterministic ordering. An ambiguous fallback is not safe comparison
  // evidence, so it deliberately contributes no allow role.
  return new Set()
}

function computeContextExpiry(
  at: Date,
  identity: VerifiedAccountIdentity,
  linkValidUntil: Date | null,
  assignments: EffectiveAssignment[]
): Date {
  const boundaries = [
    at.getTime() + MAX_CONTEXT_CACHE_TTL_MS,
    new Date(identity.expiresAt).getTime(),
    linkValidUntil?.getTime(),
    ...assignments.flatMap((assignment) => [
      assignment.affiliationValidFrom > at ? assignment.affiliationValidFrom.getTime() : undefined,
      assignment.affiliationValidUntil?.getTime(),
      assignment.roleValidFrom > at ? assignment.roleValidFrom.getTime() : undefined,
      assignment.roleValidUntil?.getTime(),
    ]),
  ].filter((value): value is number => typeof value === 'number' && value > at.getTime())

  return new Date(Math.min(...boundaries))
}

async function resolveTenantRequestContextInTransaction(
  identity: VerifiedAccountIdentity,
  selectors: TenantContextSelectors,
  metadata: TenantRequestMetadata,
  options: TenantRequestContextResolverOptions,
  db: Database
): Promise<TenantRequestContext> {
  validateSelectors(selectors)
  const at = options.at ?? new Date()
  const comparisonMode = options.comparisonMode ?? 'enforce'
  const requiredAssurance = options.requiredAssuranceLevel ?? 'aal1'

  if (!assuranceMeets(identity.assuranceLevel, requiredAssurance)) {
    denial('MFA_REQUIRED', `${requiredAssurance} assurance is required`)
  }

  const account = await resolveActiveAccount(db, identity)
  const reauthenticatedAt = await resolveAccountSession(db, account, identity, at)

  const linkWhere = [
    eq(accountLinks.accountId, account.id),
    eq(accountLinks.status, 'active'),
    lte(accountLinks.validFrom, at),
    or(isNull(accountLinks.validUntil), gt(accountLinks.validUntil, at)),
    eq(people.status, 'active'),
  ]
  if (selectors.tenantId) linkWhere.push(eq(accountLinks.tenantId, selectors.tenantId))

  const links = await db
    .select({
      tenantId: accountLinks.tenantId,
      personId: accountLinks.personId,
      validUntil: accountLinks.validUntil,
    })
    .from(accountLinks)
    .innerJoin(
      people,
      and(eq(people.tenantId, accountLinks.tenantId), eq(people.id, accountLinks.personId))
    )
    .where(and(...linkWhere))
    .limit(2)

  if (links.length === 0) denial('TENANT_DENIED', 'No active Account Link matches the Tenant')
  if (links.length > 1) {
    denial(
      selectors.tenantId ? 'POLICY_DENIED' : 'CONTEXT_REQUIRED',
      selectors.tenantId
        ? 'Account has more than one active Account Link for the selected Tenant'
        : 'Account has more than one active Tenant context'
    )
  }
  const link = links[0]
  if (!link) denial('TENANT_DENIED', 'No active Account Link')

  const [tenant] = await db
    .select({ name: tenants.name, status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, link.tenantId))
    .limit(1)
  if (!tenant || tenant.status !== 'active') denial('TENANT_DENIED', 'Tenant is not active')

  const explicitCacheKey = buildTenantContextCacheKey({
    accountId: account.id,
    tenantId: link.tenantId,
    sessionId: identity.sessionId,
    membershipVersion: account.membershipVersion,
    securityVersion: account.securityVersion,
    assuranceLevel: identity.assuranceLevel,
    ...(reauthenticatedAt ? { reauthenticatedAt: reauthenticatedAt.toISOString() } : {}),
    policyVersion: TENANT_CONTEXT_POLICY_VERSION,
    comparisonMode,
    educationOrganizationId: selectors.educationOrganizationId,
    schoolId: selectors.schoolId,
  })
  const cached = options.cache?.get(explicitCacheKey, at)
  if (cached) {
    return Object.freeze({ ...cached, requestId: metadata.requestId })
  }

  const assignmentRows = await db
    .select({
      affiliationId: affiliations.id,
      kind: affiliations.kind,
      scopeType: affiliations.scopeType,
      educationOrganizationId: affiliations.educationOrganizationId,
      schoolId: affiliations.schoolId,
      classId: affiliations.classId,
      affiliationValidFrom: affiliations.validFrom,
      affiliationValidUntil: affiliations.validUntil,
      roleTemplateKey: roleTemplateAssignments.roleTemplateKey,
      roleValidFrom: roleTemplateAssignments.validFrom,
      roleValidUntil: roleTemplateAssignments.validUntil,
    })
    .from(affiliations)
    .innerJoin(
      roleTemplateAssignments,
      and(
        eq(roleTemplateAssignments.tenantId, affiliations.tenantId),
        eq(roleTemplateAssignments.affiliationId, affiliations.id),
        eq(roleTemplateAssignments.status, 'active'),
        lte(roleTemplateAssignments.validFrom, at),
        or(isNull(roleTemplateAssignments.validUntil), gt(roleTemplateAssignments.validUntil, at))
      )
    )
    .where(
      and(
        eq(affiliations.tenantId, link.tenantId),
        eq(affiliations.personId, link.personId),
        eq(affiliations.status, 'active'),
        lte(affiliations.validFrom, at),
        or(isNull(affiliations.validUntil), gt(affiliations.validUntil, at))
      )
    )
    .limit(MAX_ASSIGNMENT_ROWS + 1)

  if (assignmentRows.length > MAX_ASSIGNMENT_ROWS) {
    denial('POLICY_DENIED', 'Context assignment safety limit exceeded')
  }

  const currentAssignments = assignmentRows.filter(
    (assignment) =>
      isEffectivePeriod(assignment.affiliationValidFrom, assignment.affiliationValidUntil, at) &&
      isEffectivePeriod(assignment.roleValidFrom, assignment.roleValidUntil, at)
  )
  if (currentAssignments.length === 0) {
    denial('AFFILIATION_EXPIRED', 'No current Affiliation and Role Template assignment')
  }

  const classIds = [
    ...new Set(
      currentAssignments.map(({ classId }) => classId).filter((id): id is string => id !== null)
    ),
  ]
  const classSchools = new Map<string, string>()
  if (classIds.length > 0) {
    const rows = await db
      .select({ id: classes.id, schoolId: classes.schoolId })
      .from(classes)
      .where(and(eq(classes.tenantId, link.tenantId), inArray(classes.id, classIds)))
    for (const row of rows) classSchools.set(row.id, row.schoolId)
  }
  const hasTenantParentRole = currentAssignments.some(
    (assignment) => assignment.scopeType === 'tenant' && assignment.roleTemplateKey === 'parent'
  )
  const guardianSchoolIds = hasTenantParentRole
    ? await loadGuardianSchoolIds(db, link.tenantId, link.personId, at)
    : []
  if (guardianSchoolIds.length > MAX_GUARDIAN_SCHOOLS) {
    denial('POLICY_DENIED', 'Guardian School context safety limit exceeded')
  }

  let selectedOrganizationId = selectors.educationOrganizationId
  let selectedSchoolId = selectors.schoolId
  let selectedOrganizationName: string | undefined
  let selectedSchoolName: string | undefined

  if (!selectedOrganizationId && !selectedSchoolId) {
    const candidateKeys = new Set<string>()
    for (const assignment of currentAssignments) {
      if (assignment.scopeType === 'tenant') {
        if (assignment.roleTemplateKey !== 'parent' || guardianSchoolIds.length === 0) {
          candidateKeys.add('tenant')
        }
      }
      if (assignment.educationOrganizationId) {
        candidateKeys.add(`organization:${assignment.educationOrganizationId}`)
      }
      if (assignment.schoolId) candidateKeys.add(`school:${assignment.schoolId}`)
      if (assignment.classId) {
        const schoolId = classSchools.get(assignment.classId)
        if (schoolId) candidateKeys.add(`school:${schoolId}`)
      }
    }
    for (const schoolId of guardianSchoolIds) candidateKeys.add(`school:${schoolId}`)
    if (candidateKeys.size > 1) {
      denial('CONTEXT_REQUIRED', 'Account has more than one valid organization or School context')
    }
    const [candidate] = [...candidateKeys]
    if (!candidate) denial('AFFILIATION_EXPIRED', 'No selectable current context')
    if (candidate.startsWith('organization:')) selectedOrganizationId = candidate.slice(13)
    if (candidate.startsWith('school:')) selectedSchoolId = candidate.slice(7)
  }

  const resolvedCacheKey = buildTenantContextCacheKey({
    accountId: account.id,
    tenantId: link.tenantId,
    sessionId: identity.sessionId,
    membershipVersion: account.membershipVersion,
    securityVersion: account.securityVersion,
    assuranceLevel: identity.assuranceLevel,
    ...(reauthenticatedAt ? { reauthenticatedAt: reauthenticatedAt.toISOString() } : {}),
    policyVersion: TENANT_CONTEXT_POLICY_VERSION,
    comparisonMode,
    educationOrganizationId: selectedOrganizationId,
    schoolId: selectedSchoolId,
  })
  if (resolvedCacheKey !== explicitCacheKey) {
    const resolvedCached = options.cache?.get(resolvedCacheKey, at)
    if (resolvedCached) {
      return Object.freeze({ ...resolvedCached, requestId: metadata.requestId })
    }
  }

  let schoolGovernanceOrganizationId: string | null = null
  if (selectedSchoolId) {
    schoolGovernanceOrganizationId = await currentSchoolGovernanceOrganization(
      db,
      link.tenantId,
      selectedSchoolId,
      at
    )
    if (!schoolGovernanceOrganizationId) {
      denial('SCHOOL_DENIED', 'School has no current governance assignment')
    }
  }

  const treeVersionId = await currentOrganizationTreeVersionId(db, link.tenantId, at)
  if (selectedOrganizationId && schoolGovernanceOrganizationId) {
    const scopeMatches = await isOrganizationAncestor(
      db,
      link.tenantId,
      treeVersionId,
      selectedOrganizationId,
      schoolGovernanceOrganizationId
    )
    if (!scopeMatches) {
      denial('SCOPE_MISMATCH', 'Selected Education Organization does not govern the School')
    }
  }

  const organizationTargetId = selectedOrganizationId ?? schoolGovernanceOrganizationId
  const relevantAssignments: EffectiveAssignment[] = []
  const guardianSchoolAccess = selectedSchoolId
    ? guardianSchoolIds.includes(selectedSchoolId)
    : false
  for (const assignment of currentAssignments) {
    if (assignment.scopeType === 'tenant') {
      if (selectedSchoolId && assignment.roleTemplateKey === 'parent' && !guardianSchoolAccess) {
        continue
      }
      if (selectedOrganizationId && !selectedSchoolId && assignment.roleTemplateKey === 'parent') {
        continue
      }
      relevantAssignments.push(assignment)
      continue
    }
    if (selectedSchoolId && assignment.schoolId === selectedSchoolId) {
      relevantAssignments.push(assignment)
      continue
    }
    if (
      selectedSchoolId &&
      assignment.classId &&
      classSchools.get(assignment.classId) === selectedSchoolId
    ) {
      relevantAssignments.push(assignment)
      continue
    }
    if (organizationTargetId && assignment.educationOrganizationId) {
      const coversTarget = await isOrganizationAncestor(
        db,
        link.tenantId,
        treeVersionId,
        assignment.educationOrganizationId,
        organizationTargetId
      )
      if (coversTarget) relevantAssignments.push(assignment)
    }
  }

  const roleTemplateKeys = [
    ...new Set(relevantAssignments.map(({ roleTemplateKey }) => roleTemplateKey)),
  ].sort()
  if (roleTemplateKeys.length === 0) {
    denial(selectedSchoolId ? 'SCHOOL_DENIED' : 'ORG_DENIED', 'Selected scope has no current role')
  }
  if (roleTemplateKeys.length > MAX_CONTEXT_ROLE_KEYS) {
    denial('POLICY_DENIED', 'Context role safety limit exceeded')
  }

  if (selectedSchoolId) {
    // The scope is bound only after current Affiliations/Relationships prove
    // that this Account may select the School. Client selectors never bind RLS.
    await bindIdentityTenantResolutionContext(db, {
      tenantId: link.tenantId,
      personId: link.personId,
      queryConstraints: [{ kind: 'school', tenantId: link.tenantId, schoolId: selectedSchoolId }],
    })
    const [school] = await db
      .select({ name: schools.name, status: schools.status })
      .from(schools)
      .where(and(eq(schools.tenantId, link.tenantId), eq(schools.id, selectedSchoolId)))
      .limit(1)
    if (!school || school.status !== 'active') denial('SCHOOL_DENIED', 'School is not active')
    selectedSchoolName = school.name
  }

  if (selectedOrganizationId) {
    const [organization] = await db
      .select({ name: educationOrganizations.name, status: educationOrganizations.status })
      .from(educationOrganizations)
      .where(
        and(
          eq(educationOrganizations.tenantId, link.tenantId),
          eq(educationOrganizations.id, selectedOrganizationId)
        )
      )
      .limit(1)
    if (!organization || organization.status !== 'active') {
      denial('ORG_DENIED', 'Education Organization is not active')
    }
    selectedOrganizationName = organization.name
  }

  let legacyComparison: TenantRequestContext['legacyComparison'] = 'not_applicable'
  if (comparisonMode !== 'off' && account.legacyUserId) {
    const legacyRoleKeys = await loadLegacyRoleKeys(
      db,
      account.legacyUserId,
      link.tenantId,
      selectedOrganizationId,
      selectedSchoolId
    )
    const expansions = roleTemplateKeys.filter((key) => !legacyRoleKeys.has(key))
    legacyComparison = expansions.length === 0 ? 'matched' : 'observed_expansion'
    if (expansions.length > 0 && comparisonMode === 'enforce') {
      denial('POLICY_DENIED', `New context expands legacy roles: ${expansions.join(', ')}`)
    }
  }

  const expiresAt = computeContextExpiry(at, identity, link.validUntil, assignmentRows)
  const context = Object.freeze({
    version: 1 as const,
    contextPolicyVersion: TENANT_CONTEXT_POLICY_VERSION,
    accountId: account.id,
    ...(account.legacyUserId ? { legacyUserId: account.legacyUserId } : {}),
    personId: link.personId,
    tenantId: link.tenantId,
    tenantName: tenant.name,
    sessionId: identity.sessionId,
    membershipVersion: account.membershipVersion,
    securityVersion: account.securityVersion,
    assuranceLevel: identity.assuranceLevel,
    ...(reauthenticatedAt ? { reauthenticatedAt: reauthenticatedAt.toISOString() } : {}),
    ...(selectedOrganizationId ? { activeEducationOrganizationId: selectedOrganizationId } : {}),
    ...(selectedOrganizationName
      ? { activeEducationOrganizationName: selectedOrganizationName }
      : {}),
    ...(selectedSchoolId ? { activeSchoolId: selectedSchoolId } : {}),
    ...(selectedSchoolName ? { activeSchoolName: selectedSchoolName } : {}),
    roleTemplateKeys: Object.freeze(roleTemplateKeys),
    requestId: metadata.requestId,
    resolvedAt: at.toISOString(),
    expiresAt: expiresAt.toISOString(),
    legacyComparison,
  })

  options.cache?.set(resolvedCacheKey, context, {
    accountId: account.id,
    sessionId: identity.sessionId,
    expiresAt,
  })
  return context
}

export async function resolveTenantRequestContext(
  identity: VerifiedAccountIdentity,
  selectors: TenantContextSelectors,
  metadata: TenantRequestMetadata,
  options: TenantRequestContextResolverOptions = {}
): Promise<TenantRequestContext> {
  validateSelectors(selectors)
  const requiredAssurance = options.requiredAssuranceLevel ?? 'aal1'
  if (!assuranceMeets(identity.assuranceLevel, requiredAssurance)) {
    denial('MFA_REQUIRED', `${requiredAssurance} assurance is required`)
  }
  return withIdentityTransaction(
    {
      identityProvider: identity.provider,
      providerSubject: identity.subject,
      providerSessionId: identity.sessionId,
      requestId: metadata.requestId,
      assuranceLevel: identity.assuranceLevel,
    },
    (database) =>
      resolveTenantRequestContextInTransaction(identity, selectors, metadata, options, database)
  )
}

export async function revokeAccountSession(
  databaseContext: TenantRequestContext,
  input: {
    providerSessionId: string
    reason: string
    revokedByAccountId?: string
    at?: Date
  },
  cache?: TenantRequestContextCache<TenantRequestContext>
): Promise<void> {
  const reason = input.reason.trim()
  if (!reason) denial('POLICY_DENIED', 'Session revocation requires a reason')
  const at = input.at ?? new Date()

  cache?.invalidateSession(input.providerSessionId)
  await withTenantTransaction(databaseContext, async (tx) => {
    const [session] = await tx
      .select({ status: accountSessions.status })
      .from(accountSessions)
      .where(eq(accountSessions.providerSessionId, input.providerSessionId))
      .for('update')
    if (!session || session.status !== 'active') {
      denial('SESSION_REVOKED', 'Session is missing or already inactive')
    }
    await tx
      .update(accountSessions)
      .set({
        status: 'revoked',
        revokedAt: at,
        revokedByAccountId: input.revokedByAccountId,
        revocationReason: reason,
        updatedAt: at,
      })
      .where(eq(accountSessions.providerSessionId, input.providerSessionId))
  })
}

/**
 * Returns a deliberately bounded page of selectable contexts for the
 * CONTEXT_REQUIRED recovery UI. These options are selectors, not grants; the
 * full resolver validates the selected option again before use.
 */
export async function listAvailableTenantContexts(
  identity: VerifiedAccountIdentity,
  options: { at?: Date; limit?: number; requestId?: string } = {}
): Promise<AvailableTenantContext[]> {
  return withIdentityTransaction(
    {
      identityProvider: identity.provider,
      providerSubject: identity.subject,
      providerSessionId: identity.sessionId,
      requestId: options.requestId ?? crypto.randomUUID(),
      assuranceLevel: identity.assuranceLevel,
    },
    (database) => listAvailableTenantContextsInTransaction(identity, options, database)
  )
}

async function listAvailableTenantContextsInTransaction(
  identity: VerifiedAccountIdentity,
  options: { at?: Date; limit?: number },
  db: Database
): Promise<AvailableTenantContext[]> {
  const at = options.at ?? new Date()
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 50)
  const account = await resolveActiveAccount(db, identity)
  await resolveAccountSession(db, account, identity, at)

  const activeLinks = await db
    .select({ tenantId: accountLinks.tenantId, personId: accountLinks.personId })
    .from(accountLinks)
    .innerJoin(
      people,
      and(eq(people.tenantId, accountLinks.tenantId), eq(people.id, accountLinks.personId))
    )
    .where(
      and(
        eq(accountLinks.accountId, account.id),
        eq(accountLinks.status, 'active'),
        lte(accountLinks.validFrom, at),
        or(isNull(accountLinks.validUntil), gt(accountLinks.validUntil, at)),
        eq(people.status, 'active')
      )
    )
    .orderBy(accountLinks.tenantId, accountLinks.id)
    .limit(50)

  const linkCounts = new Map<string, number>()
  for (const link of activeLinks) {
    linkCounts.set(link.tenantId, (linkCounts.get(link.tenantId) ?? 0) + 1)
  }
  const results = new Map<string, AvailableTenantContext>()
  for (const link of activeLinks) {
    if ((linkCounts.get(link.tenantId) ?? 0) > 1) continue
    const [tenant] = await db
      .select({ name: tenants.name, status: tenants.status })
      .from(tenants)
      .where(eq(tenants.id, link.tenantId))
      .limit(1)
    if (!tenant || tenant.status !== 'active') continue

    const rows = await db
      .select({
        scopeType: affiliations.scopeType,
        educationOrganizationId: affiliations.educationOrganizationId,
        schoolId: affiliations.schoolId,
        classId: affiliations.classId,
        roleTemplateKey: roleTemplateAssignments.roleTemplateKey,
        affiliationValidFrom: affiliations.validFrom,
        affiliationValidUntil: affiliations.validUntil,
        roleValidFrom: roleTemplateAssignments.validFrom,
        roleValidUntil: roleTemplateAssignments.validUntil,
      })
      .from(affiliations)
      .innerJoin(
        roleTemplateAssignments,
        and(
          eq(roleTemplateAssignments.tenantId, affiliations.tenantId),
          eq(roleTemplateAssignments.affiliationId, affiliations.id),
          eq(roleTemplateAssignments.status, 'active'),
          lte(roleTemplateAssignments.validFrom, at),
          or(isNull(roleTemplateAssignments.validUntil), gt(roleTemplateAssignments.validUntil, at))
        )
      )
      .where(
        and(
          eq(affiliations.tenantId, link.tenantId),
          eq(affiliations.personId, link.personId),
          eq(affiliations.status, 'active'),
          lte(affiliations.validFrom, at),
          or(isNull(affiliations.validUntil), gt(affiliations.validUntil, at))
        )
      )
      .limit(MAX_ASSIGNMENT_ROWS + 1)
    if (rows.length > MAX_ASSIGNMENT_ROWS) {
      continue
    }

    const currentRows = rows.filter(
      (row) =>
        isEffectivePeriod(row.affiliationValidFrom, row.affiliationValidUntil, at) &&
        isEffectivePeriod(row.roleValidFrom, row.roleValidUntil, at)
    )
    const classIds = [
      ...new Set(
        currentRows.map(({ classId }) => classId).filter((id): id is string => id !== null)
      ),
    ]
    const classSchools = new Map<string, string>()
    if (classIds.length > 0) {
      const classRows = await db
        .select({ id: classes.id, schoolId: classes.schoolId })
        .from(classes)
        .where(and(eq(classes.tenantId, link.tenantId), inArray(classes.id, classIds)))
      for (const classRow of classRows) classSchools.set(classRow.id, classRow.schoolId)
    }
    const hasTenantParentRole = currentRows.some(
      (row) => row.scopeType === 'tenant' && row.roleTemplateKey === 'parent'
    )
    const guardianSchoolIds = hasTenantParentRole
      ? await loadGuardianSchoolIds(db, link.tenantId, link.personId, at)
      : []
    if (guardianSchoolIds.length > MAX_GUARDIAN_SCHOOLS) continue

    const optionRoles = new Map<string, Set<string>>()
    for (const row of currentRows) {
      if (
        row.scopeType === 'tenant' &&
        row.roleTemplateKey === 'parent' &&
        guardianSchoolIds.length > 0
      ) {
        for (const schoolId of guardianSchoolIds) {
          const key = `school:${schoolId}`
          const roles = optionRoles.get(key) ?? new Set<string>()
          roles.add(row.roleTemplateKey)
          optionRoles.set(key, roles)
        }
        continue
      }
      let key = 'tenant'
      if (row.educationOrganizationId) key = `organization:${row.educationOrganizationId}`
      if (row.schoolId) key = `school:${row.schoolId}`
      if (row.classId) {
        const schoolId = classSchools.get(row.classId)
        if (schoolId) key = `school:${schoolId}`
      }
      const roles = optionRoles.get(key) ?? new Set<string>()
      roles.add(row.roleTemplateKey)
      optionRoles.set(key, roles)
    }

    const organizationIds = [...optionRoles.keys()]
      .filter((key) => key.startsWith('organization:'))
      .map((key) => key.slice(13))
    const schoolIds = [...optionRoles.keys()]
      .filter((key) => key.startsWith('school:'))
      .map((key) => key.slice(7))
    const organizationRows =
      organizationIds.length > 0
        ? await db
            .select({ id: educationOrganizations.id, name: educationOrganizations.name })
            .from(educationOrganizations)
            .where(
              and(
                eq(educationOrganizations.tenantId, link.tenantId),
                inArray(educationOrganizations.id, organizationIds),
                eq(educationOrganizations.status, 'active')
              )
            )
        : []
    const schoolRows = await loadActiveSchoolNames(db, link.tenantId, link.personId, schoolIds)
    const organizationNames = new Map(organizationRows.map((row) => [row.id, row.name]))
    const schoolNames = new Map(schoolRows.map((row) => [row.id, row.name]))

    for (const [scopeKey, roles] of optionRoles) {
      const key = `${link.tenantId}:${scopeKey}`
      const roleTemplateKeys = Object.freeze([...roles].sort())
      if (roleTemplateKeys.length > MAX_CONTEXT_ROLE_KEYS) {
        continue
      }
      if (scopeKey === 'tenant') {
        results.set(key, {
          key,
          tenantId: link.tenantId,
          tenantName: tenant.name,
          roleTemplateKeys,
        })
      } else if (scopeKey.startsWith('organization:')) {
        const educationOrganizationId = scopeKey.slice(13)
        const educationOrganizationName = organizationNames.get(educationOrganizationId)
        if (educationOrganizationName) {
          results.set(key, {
            key,
            tenantId: link.tenantId,
            tenantName: tenant.name,
            educationOrganizationId,
            educationOrganizationName,
            roleTemplateKeys,
          })
        }
      } else if (scopeKey.startsWith('school:')) {
        const schoolId = scopeKey.slice(7)
        const schoolName = schoolNames.get(schoolId)
        if (schoolName) {
          results.set(key, {
            key,
            tenantId: link.tenantId,
            tenantName: tenant.name,
            schoolId,
            schoolName,
            roleTemplateKeys,
          })
        }
      }
    }
  }

  return [...results.values()]
    .sort((left, right) => {
      const leftLabel = left.schoolName ?? left.educationOrganizationName ?? left.tenantName
      const rightLabel = right.schoolName ?? right.educationOrganizationName ?? right.tenantName
      return leftLabel.localeCompare(rightLabel) || left.key.localeCompare(right.key)
    })
    .slice(0, limit)
}
