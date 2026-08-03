import { appendAuditEventInTransaction, recordAuditAttempt } from '@openschool/audit'
import {
  generateInvitationToken,
  hashInvitationToken,
  normalizeInvitationEmail,
  sealInvitationToken,
} from '@openschool/auth/server'
import { getInvitationDeliveryEnv } from '@openschool/config/server'
import {
  type AccountInvitation,
  type DatabaseTransaction,
  type TenantDatabaseContext,
  accountInvitations,
  accountLinks,
  accounts,
  classes,
  educationOrganizations,
  invitationDeliveryOutbox,
  people,
  schools,
  withPolicyTenantTransaction,
} from '@openschool/db'
import { type AllowedPolicyDecision, CAPABILITIES, type PolicyContext } from '@openschool/rbac'
import { TRPCError } from '@trpc/server'
import { and, eq, sql } from 'drizzle-orm'
import { assertDatabasePolicyContext, toDatabasePolicyContext } from './database-context'

const MIN_INVITATION_LIFETIME_MS = 15 * 60 * 1000
const MAX_INVITATION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
const DEFAULT_INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000

export type InvitationRoleTemplateKey =
  | 'org_admin'
  | 'org_viewer'
  | 'school_admin'
  | 'staff'
  | 'teacher'
  | 'parent'
  | 'student'

export type InvitationAffiliationKind =
  | 'student'
  | 'guardian'
  | 'employee'
  | 'teacher'
  | 'administrator'
  | 'member'

export type InvitationScope =
  | Readonly<{ type: 'tenant' }>
  | Readonly<{ type: 'education_organization'; educationOrganizationId: string }>
  | Readonly<{ type: 'school'; schoolId: string }>
  | Readonly<{ type: 'class'; classId: string }>

export interface IssueAccountInvitationInput {
  personId: string
  intendedEmail: string
  affiliationKind: InvitationAffiliationKind
  scope: InvitationScope
  roleTemplateKeys: readonly InvitationRoleTemplateKey[]
  issuanceReason: string
  expiresAt?: Date
  affiliationValidUntil?: Date
}

export interface IssuedAccountInvitation {
  invitationId: string
  deliveryId: string
  expiresAt: Date
  status: 'pending'
}

const ROLE_SCOPE: Readonly<Record<InvitationRoleTemplateKey, InvitationScope['type']>> = {
  org_admin: 'education_organization',
  org_viewer: 'education_organization',
  school_admin: 'school',
  staff: 'school',
  teacher: 'class',
  parent: 'school',
  student: 'school',
}

const ROLE_AFFILIATION: Readonly<Record<InvitationRoleTemplateKey, InvitationAffiliationKind>> = {
  org_admin: 'administrator',
  org_viewer: 'member',
  school_admin: 'administrator',
  staff: 'employee',
  teacher: 'teacher',
  parent: 'guardian',
  student: 'student',
}

const ROLE_DELEGATION: Readonly<Record<string, readonly InvitationRoleTemplateKey[]>> = {
  org_admin: ['org_admin', 'org_viewer', 'school_admin', 'staff', 'teacher', 'parent', 'student'],
  school_admin: ['school_admin', 'staff', 'teacher', 'parent', 'student'],
}

function invitationDenied(message: string): never {
  throw new TRPCError({ code: 'FORBIDDEN', message })
}

function validateInvitationApproval(
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  input: IssueAccountInvitationInput,
  at: Date
): { intendedEmail: string; expiresAt: Date; roleTemplateKey: InvitationRoleTemplateKey } {
  if (decision.capability !== CAPABILITIES.ACCOUNTS_INVITE) {
    invitationDenied('INVITATION_CAPABILITY_MISMATCH')
  }
  if (input.roleTemplateKeys.length !== 1) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'INVITATION_ONE_ROLE_REQUIRED' })
  }
  const roleTemplateKey = input.roleTemplateKeys[0]
  if (!roleTemplateKey) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'INVITATION_ROLE_REQUIRED' })
  }
  const canDelegate = context.roleTemplateKeys.some((issuerRole) =>
    ROLE_DELEGATION[issuerRole]?.includes(roleTemplateKey)
  )
  if (!canDelegate) invitationDenied('INVITATION_ROLE_ESCALATION_DENIED')
  if (ROLE_SCOPE[roleTemplateKey] !== input.scope.type) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'INVITATION_ROLE_SCOPE_MISMATCH' })
  }
  if (ROLE_AFFILIATION[roleTemplateKey] !== input.affiliationKind) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'INVITATION_AFFILIATION_MISMATCH' })
  }

  const intendedEmail = normalizeInvitationEmail(input.intendedEmail)
  const expiresAt = input.expiresAt ?? new Date(at.getTime() + DEFAULT_INVITATION_LIFETIME_MS)
  const lifetime = expiresAt.getTime() - at.getTime()
  if (lifetime < MIN_INVITATION_LIFETIME_MS || lifetime > MAX_INVITATION_LIFETIME_MS) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'INVITATION_EXPIRY_OUT_OF_RANGE' })
  }
  if (input.affiliationValidUntil && input.affiliationValidUntil <= expiresAt) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'INVITATION_AFFILIATION_EXPIRES_TOO_SOON' })
  }
  return { intendedEmail, expiresAt, roleTemplateKey }
}

function scopeColumns(scope: InvitationScope) {
  switch (scope.type) {
    case 'tenant':
      return {}
    case 'education_organization':
      return { educationOrganizationId: scope.educationOrganizationId }
    case 'school':
      return { schoolId: scope.schoolId }
    case 'class':
      return { classId: scope.classId }
  }
}

async function assertInvitationScopeAvailable(
  tx: DatabaseTransaction,
  tenantId: string,
  scope: InvitationScope
): Promise<void> {
  const columns = scopeColumns(scope)
  const result = await tx.execute<Record<string, unknown> & { allowed: boolean }>(sql`
    select public.openschool_invitation_scope_allows(
      ${tenantId}::uuid,
      ${scope.type}::text,
      ${'educationOrganizationId' in columns ? columns.educationOrganizationId : null}::uuid,
      ${'schoolId' in columns ? columns.schoolId : null}::uuid,
      ${'classId' in columns ? columns.classId : null}::uuid
    ) as "allowed"
  `)
  if (result[0]?.allowed !== true) invitationDenied('INVITATION_SCOPE_DENIED')

  if (scope.type === 'education_organization') {
    const [organization] = await tx
      .select({ status: educationOrganizations.status })
      .from(educationOrganizations)
      .where(
        and(
          eq(educationOrganizations.tenantId, tenantId),
          eq(educationOrganizations.id, scope.educationOrganizationId)
        )
      )
      .limit(1)
    if (organization?.status !== 'active') invitationDenied('INVITATION_SCOPE_UNAVAILABLE')
  }
  if (scope.type === 'school') {
    const [school] = await tx
      .select({ status: schools.status })
      .from(schools)
      .where(and(eq(schools.tenantId, tenantId), eq(schools.id, scope.schoolId)))
      .limit(1)
    if (school?.status !== 'active') invitationDenied('INVITATION_SCOPE_UNAVAILABLE')
  }
  if (scope.type === 'class') {
    const [schoolClass] = await tx
      .select({ status: classes.status })
      .from(classes)
      .where(and(eq(classes.tenantId, tenantId), eq(classes.id, scope.classId)))
      .limit(1)
    if (schoolClass?.status !== 'active') invitationDenied('INVITATION_SCOPE_UNAVAILABLE')
  }
}

async function recordInvitationFailure(
  error: unknown,
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  eventType: 'account.invite' | 'account.manage',
  targetId?: string
): Promise<never> {
  try {
    await recordAuditAttempt(databaseContext, context, decision, {
      eventType,
      outcome: error instanceof TRPCError && error.code === 'FORBIDDEN' ? 'denied' : 'failed',
      targetType: 'account.invitation',
      ...(targetId ? { targetId } : {}),
      dataClasses: ['credential'],
      change: { changedFields: ['operation'] },
    })
  } catch (auditError) {
    throw new AggregateError(
      [error, auditError],
      'Invitation operation failed and its failure evidence could not be recorded'
    )
  }
  throw error
}

export async function issueAccountInvitation(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  input: IssueAccountInvitationInput,
  at = new Date()
): Promise<IssuedAccountInvitation> {
  assertDatabasePolicyContext(databaseContext, context)
  const approval = validateInvitationApproval(context, decision, input, at)
  const environment = getInvitationDeliveryEnv()
  const invitationId = crypto.randomUUID()
  const deliveryId = crypto.randomUUID()
  const token = generateInvitationToken()
  const tokenHash = hashInvitationToken(token)
  const sealed = sealInvitationToken(
    token,
    { tenantId: databaseContext.tenantId, invitationId, deliveryId },
    {
      activeKeyId: environment.INVITATION_TOKEN_ENCRYPTION_KEY_ID,
      keys: environment.INVITATION_TOKEN_ENCRYPTION_KEYS,
    }
  )

  try {
    return await withPolicyTenantTransaction(
      databaseContext,
      toDatabasePolicyContext(decision),
      async (tx) => {
        await assertInvitationScopeAvailable(tx, databaseContext.tenantId, input.scope)
        const [person] = await tx
          .select({ normalizedEmail: people.normalizedEmail, status: people.status })
          .from(people)
          .where(and(eq(people.tenantId, databaseContext.tenantId), eq(people.id, input.personId)))
          .limit(1)
        if (!person || person.status !== 'active') invitationDenied('INVITATION_PERSON_UNAVAILABLE')
        if (person.normalizedEmail && person.normalizedEmail !== approval.intendedEmail) {
          invitationDenied('INVITATION_PERSON_EMAIL_MISMATCH')
        }

        const [existingLink] = await tx
          .select({ id: accountLinks.id })
          .from(accountLinks)
          .where(
            and(
              eq(accountLinks.tenantId, databaseContext.tenantId),
              eq(accountLinks.personId, input.personId)
            )
          )
          .limit(1)
        if (existingLink) throw new TRPCError({ code: 'CONFLICT', message: 'ACCOUNT_LINK_EXISTS' })

        const [existingAccount] = await tx
          .select({ providerSubject: accounts.providerSubject })
          .from(accounts)
          .where(sql`lower(btrim(${accounts.primaryEmail})) = ${approval.intendedEmail}`)
          .limit(1)

        await tx.insert(accountInvitations).values({
          id: invitationId,
          tenantId: databaseContext.tenantId,
          personId: input.personId,
          intendedEmail: approval.intendedEmail,
          identityProvider: 'supabase',
          intendedProviderSubject: existingAccount?.providerSubject,
          tokenHash,
          tokenVersion: 1,
          affiliationKind: input.affiliationKind,
          scopeType: input.scope.type,
          ...scopeColumns(input.scope),
          roleTemplateKeys: [approval.roleTemplateKey],
          ...(input.affiliationValidUntil
            ? { affiliationValidUntil: input.affiliationValidUntil }
            : {}),
          status: 'pending',
          expiresAt: approval.expiresAt,
          issuedByAccountId: databaseContext.accountId,
          issuanceReason: input.issuanceReason.trim(),
          createdAt: at,
          updatedAt: at,
        })
        await tx.insert(invitationDeliveryOutbox).values({
          id: deliveryId,
          tenantId: databaseContext.tenantId,
          invitationId,
          recipientEmail: approval.intendedEmail,
          ...sealed,
          status: 'pending',
          availableAt: at,
          createdAt: at,
          updatedAt: at,
        })
        await appendAuditEventInTransaction(tx, databaseContext, context, decision, {
          eventType: 'account.invite',
          outcome: 'succeeded',
          targetType: 'account.invitation',
          targetId: invitationId,
          dataClasses: ['credential'],
          change: {
            changedFields: ['affiliation', 'delivery', 'roleAssignment', 'status'],
          },
          purpose: 'account_onboarding',
          outbox: {
            topic: 'audit.event.committed',
            deduplicationKey: `account.invite:${databaseContext.requestId}:${invitationId}`,
          },
        })
        return Object.freeze({
          invitationId,
          deliveryId,
          expiresAt: approval.expiresAt,
          status: 'pending' as const,
        })
      }
    )
  } catch (error) {
    return recordInvitationFailure(
      error,
      databaseContext,
      context,
      decision,
      'account.invite',
      invitationId
    )
  }
}

export async function cancelAccountInvitation(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  invitationId: string,
  reason: string,
  at = new Date()
): Promise<AccountInvitation> {
  assertDatabasePolicyContext(databaseContext, context)
  if (decision.capability !== CAPABILITIES.ACCOUNTS_MANAGE) {
    invitationDenied('INVITATION_CAPABILITY_MISMATCH')
  }
  const cancellationReason = reason.trim()
  if (!cancellationReason) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'INVITATION_CANCELLATION_REASON_REQUIRED' })
  }

  try {
    return await withPolicyTenantTransaction(
      databaseContext,
      toDatabasePolicyContext(decision),
      async (tx) => {
        const [invitation] = await tx
          .select()
          .from(accountInvitations)
          .where(
            and(
              eq(accountInvitations.tenantId, databaseContext.tenantId),
              eq(accountInvitations.id, invitationId)
            )
          )
          .for('update')
          .limit(1)
        if (!invitation) throw new TRPCError({ code: 'NOT_FOUND', message: 'INVITATION_NOT_FOUND' })
        if (invitation.status !== 'pending') {
          throw new TRPCError({ code: 'CONFLICT', message: 'INVITATION_NOT_PENDING' })
        }
        const [cancelled] = await tx
          .update(accountInvitations)
          .set({
            status: 'cancelled',
            cancelledAt: at,
            cancelledByAccountId: databaseContext.accountId,
            cancellationReason,
            updatedAt: at,
          })
          .where(eq(accountInvitations.id, invitationId))
          .returning()
        if (!cancelled) throw new TRPCError({ code: 'CONFLICT', message: 'INVITATION_CHANGED' })
        await appendAuditEventInTransaction(tx, databaseContext, context, decision, {
          eventType: 'account.manage',
          outcome: 'succeeded',
          targetType: 'account.invitation',
          targetId: invitationId,
          dataClasses: ['credential'],
          change: { changedFields: ['status'] },
          purpose: 'account_onboarding',
          outbox: {
            topic: 'audit.event.committed',
            deduplicationKey: `account.invitation.cancel:${databaseContext.requestId}:${invitationId}`,
          },
        })
        return cancelled
      }
    )
  } catch (error) {
    return recordInvitationFailure(
      error,
      databaseContext,
      context,
      decision,
      'account.manage',
      invitationId
    )
  }
}
