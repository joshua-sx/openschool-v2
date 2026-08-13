import { appendAuditEventInTransaction, recordAuditAttempt } from '@openschool/audit'
import {
  type DatabaseTransaction,
  type DuplicatePersonCandidate,
  type TenantDatabaseContext,
  contactProfiles,
  people,
  personRelationships,
  schoolEnrollments,
  scoreDuplicatePersonCandidate,
  withPolicyTenantTransaction,
} from '@openschool/db'
import {
  type AllowedPolicyDecision,
  CAPABILITIES,
  type Capability,
  type PolicyContext,
} from '@openschool/rbac'
import { TRPCError } from '@trpc/server'
import { and, asc, desc, eq, ilike, isNull, lte, or, sql } from 'drizzle-orm'
import {
  assertDatabasePolicyContext,
  assertStudentSliceEnabled,
  toDatabasePolicyContext,
} from './database-context'

const MAX_CONTACTS = 100
const MAX_CANDIDATES = 10

export type GuardianRelationshipType = 'parent_of' | 'guardian_of' | 'emergency_contact_of'
export type DecisionAuthority = 'none' | 'shared' | 'sole' | 'limited'
export type PreferredContactMethod = 'email' | 'phone' | 'sms' | 'none'

export interface GuardianContact {
  relationshipId: string
  contactPersonId: string
  learnerPersonId: string
  displayName: string
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  preferredContactMethod: PreferredContactMethod
  relationshipType: GuardianRelationshipType
  legalAuthority: boolean
  decisionAuthority: DecisionAuthority
  emergencyPriority: number | null
  pickupAuthority: boolean
  portalEligible: boolean
  accountLinked: boolean
  invitationEligible: boolean
  status: 'active' | 'suspended' | 'revoked'
  isCurrent: boolean
  validFrom: Date
  validUntil: Date | null
  version: number
}

export interface NewContactPersonInput {
  kind: 'new'
  firstName: string
  lastName: string
  email?: string | null
  phone?: string | null
  preferredContactMethod: PreferredContactMethod
}

export interface ExistingContactPersonInput {
  kind: 'existing'
  personId: string
}

export interface CreateGuardianContactInput {
  learnerId: string
  contact: NewContactPersonInput | ExistingContactPersonInput
  relationshipType: GuardianRelationshipType
  legalAuthority: boolean
  decisionAuthority: DecisionAuthority
  emergencyPriority?: number | null
  pickupAuthority: boolean
  portalEligible: boolean
  issuanceReason: string
}

export interface UpdateGuardianContactInput {
  relationshipId: string
  expectedVersion: number
  legalAuthority: boolean
  decisionAuthority: DecisionAuthority
  emergencyPriority?: number | null
  pickupAuthority: boolean
  portalEligible: boolean
}

interface GuardianContactFunctionRow extends Record<string, unknown> {
  relationshipId: string
  contactPersonId: string
  learnerPersonId?: string
  version: number | string
  accountMembershipInvalidated: boolean
  occurredAt: Date | string
}

interface LearnerContactAnchor {
  personId: string
  schoolId: string
  current: boolean
}

function policyDenied(): never {
  throw new TRPCError({ code: 'NOT_FOUND', message: 'Learner not found' })
}

function assertContactDecision(
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  expectedCapability: Capability
): string {
  if (
    decision.capability !== expectedCapability ||
    !context.tenantId ||
    decision.queryConstraints.length === 0 ||
    decision.queryConstraints.length > 16 ||
    decision.queryConstraints.some(
      (constraint) => constraint.kind === 'platform' || constraint.tenantId !== context.tenantId
    )
  ) {
    policyDenied()
  }
  return context.tenantId
}

function normalizeName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ')
}

function normalizeEmail(value: string | null | undefined): string | null {
  return value?.normalize('NFKC').trim().toLocaleLowerCase('en') || null
}

function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.normalize('NFKC').trim()
  const digits = trimmed.replace(/\D/g, '')
  return digits ? `${trimmed.startsWith('+') ? '+' : ''}${digits}` : null
}

function databaseErrorCode(error: unknown): string | null {
  let current = error
  const visited = new Set<object>()
  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== 'object' || visited.has(current)) return null
    visited.add(current)
    const candidate = current as { cause?: unknown; code?: unknown }
    if (typeof candidate.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return candidate.code
    }
    current = candidate.cause
  }
  return null
}

export function normalizeGuardianContactError(error: unknown): unknown {
  if (error instanceof TRPCError) return error
  switch (databaseErrorCode(error)) {
    case '42501':
    case '23503':
      return new TRPCError({ code: 'NOT_FOUND', message: 'Contact not found', cause: error })
    case '23P01':
    case '23505':
      return new TRPCError({
        code: 'CONFLICT',
        message: 'This contact already has a current relationship with the learner',
        cause: error,
      })
    case '40001':
      return new TRPCError({
        code: 'CONFLICT',
        message: 'The contact changed. Refresh the learner record and try again.',
        cause: error,
      })
    case '22023':
    case '23514':
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: 'The contact or relationship details are invalid',
        cause: error,
      })
    default:
      return error
  }
}

async function recordContactFailure(
  error: unknown,
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  eventType: 'guardian.contact.create' | 'guardian.contact.update' | 'guardian.contact.end',
  targetId?: string
): Promise<never> {
  const normalized = normalizeGuardianContactError(error)
  try {
    await recordAuditAttempt(databaseContext, context, decision, {
      eventType,
      outcome:
        normalized instanceof TRPCError && normalized.code === 'NOT_FOUND' ? 'denied' : 'failed',
      targetType: 'person.relationship',
      ...(targetId ? { targetId } : {}),
      dataClasses: ['safeguarding'],
      change: { changedFields: ['operation'] },
    })
  } catch (auditError) {
    throw new AggregateError(
      [normalized, auditError],
      'Guardian contact mutation failed and its failure evidence could not be recorded'
    )
  }
  throw normalized
}

async function resolveLearnerAnchor(
  db: DatabaseTransaction,
  tenantId: string,
  learnerId: string,
  requireCurrent: boolean
): Promise<LearnerContactAnchor> {
  const at = new Date()
  const filters = [
    eq(schoolEnrollments.tenantId, tenantId),
    or(eq(schoolEnrollments.personId, learnerId), eq(schoolEnrollments.legacyStudentId, learnerId)),
  ]
  if (requireCurrent) {
    filters.push(
      eq(schoolEnrollments.status, 'enrolled'),
      lte(schoolEnrollments.validFrom, at),
      or(isNull(schoolEnrollments.validUntil), sql`${schoolEnrollments.validUntil} > ${at}`)
    )
  }
  const [enrollment] = await db
    .select({
      personId: schoolEnrollments.personId,
      schoolId: schoolEnrollments.schoolId,
      current: sql<boolean>`
        ${schoolEnrollments.status} = 'enrolled'
        AND ${schoolEnrollments.validFrom} <= ${at}
        AND (${schoolEnrollments.validUntil} IS NULL OR ${schoolEnrollments.validUntil} > ${at})
      `,
    })
    .from(schoolEnrollments)
    .where(and(...filters))
    .orderBy(desc(schoolEnrollments.validFrom), desc(schoolEnrollments.id))
    .limit(1)
  if (!enrollment) policyDenied()
  return enrollment
}

async function loadContacts(
  db: DatabaseTransaction,
  tenantId: string,
  learnerPersonId: string
): Promise<GuardianContact[]> {
  const at = new Date()
  const rows = await db
    .select({
      relationshipId: personRelationships.id,
      contactPersonId: personRelationships.subjectPersonId,
      learnerPersonId: personRelationships.relatedPersonId,
      displayName: people.displayName,
      firstName: people.firstName,
      lastName: people.lastName,
      email: people.email,
      phone: contactProfiles.phone,
      preferredContactMethod: contactProfiles.preferredContactMethod,
      relationshipType: personRelationships.type,
      legalAuthority: personRelationships.legalAuthority,
      decisionAuthority: personRelationships.decisionAuthority,
      emergencyPriority: personRelationships.emergencyPriority,
      pickupAuthority: personRelationships.pickupAuthority,
      portalEligible: personRelationships.portalEligible,
      accountLinked: sql<boolean>`EXISTS (
        SELECT 1
        FROM public.account_links AS link
        WHERE link.tenant_id = ${tenantId}::uuid
          AND link.person_id = ${personRelationships.subjectPersonId}
          AND link.status = 'active'
          AND link.valid_from <= ${at}
          AND (link.valid_until IS NULL OR link.valid_until > ${at})
      )`,
      status: personRelationships.status,
      isCurrent: sql<boolean>`
        ${personRelationships.status} = 'active'
        AND ${personRelationships.validFrom} <= ${at}
        AND (
          ${personRelationships.validUntil} IS NULL
          OR ${personRelationships.validUntil} > ${at}
        )
      `,
      validFrom: personRelationships.validFrom,
      validUntil: personRelationships.validUntil,
      version: personRelationships.version,
    })
    .from(personRelationships)
    .innerJoin(
      people,
      and(
        eq(people.tenantId, personRelationships.tenantId),
        eq(people.id, personRelationships.subjectPersonId)
      )
    )
    .leftJoin(
      contactProfiles,
      and(
        eq(contactProfiles.tenantId, personRelationships.tenantId),
        eq(contactProfiles.personId, personRelationships.subjectPersonId)
      )
    )
    .where(
      and(
        eq(personRelationships.tenantId, tenantId),
        eq(personRelationships.relatedPersonId, learnerPersonId)
      )
    )
    .orderBy(
      asc(sql`CASE WHEN ${personRelationships.status} = 'active' THEN 0 ELSE 1 END`),
      asc(personRelationships.emergencyPriority),
      asc(people.displayName),
      asc(personRelationships.id)
    )
    .limit(MAX_CONTACTS)

  return rows.map((row) => ({
    ...row,
    relationshipType: row.relationshipType as GuardianRelationshipType,
    decisionAuthority: row.decisionAuthority as DecisionAuthority,
    preferredContactMethod: (row.preferredContactMethod ?? 'none') as PreferredContactMethod,
    invitationEligible:
      row.isCurrent && row.portalEligible && Boolean(row.email) && !row.accountLinked,
  }))
}

export async function getGuardianContacts(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  learnerId: string
): Promise<GuardianContact[]> {
  assertStudentSliceEnabled()
  assertDatabasePolicyContext(databaseContext, context)
  const tenantId = assertContactDecision(context, decision, CAPABILITIES.GUARDIAN_CONTACTS_READ)
  return withPolicyTenantTransaction(
    databaseContext,
    toDatabasePolicyContext(decision),
    async (db) => {
      const learner = await resolveLearnerAnchor(db, tenantId, learnerId, false)
      return loadContacts(db, tenantId, learner.personId)
    }
  )
}

export async function findGuardianContactCandidates(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  learnerId: string,
  query: string
): Promise<DuplicatePersonCandidate[]> {
  assertStudentSliceEnabled()
  assertDatabasePolicyContext(databaseContext, context)
  const tenantId = assertContactDecision(context, decision, CAPABILITIES.GUARDIAN_CONTACTS_MANAGE)
  const normalizedQuery = query.normalize('NFKC').trim().toLocaleLowerCase('en')
  if (normalizedQuery.length < 2) return []

  return withPolicyTenantTransaction(
    databaseContext,
    toDatabasePolicyContext(decision),
    async (db) => {
      const learner = await resolveLearnerAnchor(db, tenantId, learnerId, true)
      const candidates = await db
        .selectDistinct({
          id: people.id,
          tenantId: people.tenantId,
          displayName: people.displayName,
          normalizedDisplayName: people.normalizedDisplayName,
          dateOfBirth: people.dateOfBirth,
          normalizedEmail: people.normalizedEmail,
        })
        .from(personRelationships)
        .innerJoin(
          people,
          and(
            eq(people.tenantId, personRelationships.tenantId),
            eq(people.id, personRelationships.subjectPersonId)
          )
        )
        .where(
          and(
            eq(personRelationships.tenantId, tenantId),
            sql`${personRelationships.subjectPersonId} <> ${learner.personId}::uuid`,
            or(
              ilike(people.normalizedDisplayName, `%${normalizedQuery}%`),
              ilike(people.normalizedEmail, `%${normalizedQuery}%`)
            ),
            sql`NOT EXISTS (
              SELECT 1
              FROM public.person_relationships AS existing
              WHERE existing.tenant_id = ${tenantId}::uuid
                AND existing.subject_person_id = ${personRelationships.subjectPersonId}
                AND existing.related_person_id = ${learner.personId}::uuid
                AND existing.status = 'active'
                AND existing.valid_from <= now()
                AND (existing.valid_until IS NULL OR existing.valid_until > now())
            )`
          )
        )
        .orderBy(asc(people.normalizedDisplayName), asc(people.id))
        .limit(MAX_CANDIDATES)

      return candidates.map((candidate) =>
        scoreDuplicatePersonCandidate(candidate, {
          tenantId,
          displayName: normalizedQuery,
          email: normalizedQuery.includes('@') ? normalizedQuery : null,
        })
      )
    }
  )
}

export async function createGuardianContact(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  input: CreateGuardianContactInput
): Promise<GuardianContact[]> {
  assertStudentSliceEnabled()
  assertDatabasePolicyContext(databaseContext, context)
  const tenantId = assertContactDecision(context, decision, CAPABILITIES.GUARDIAN_CONTACTS_MANAGE)
  const relationshipId = crypto.randomUUID()
  const contactPersonId =
    input.contact.kind === 'new' ? crypto.randomUUID() : input.contact.personId
  const validFrom = new Date()
  const contact = input.contact.kind === 'new' ? input.contact : null
  const firstName = contact ? normalizeName(contact.firstName) : null
  const lastName = contact ? normalizeName(contact.lastName) : null
  const displayName = firstName && lastName ? `${firstName} ${lastName}` : null
  const email = normalizeEmail(contact?.email)
  const phone = contact?.phone?.normalize('NFKC').trim() || null
  const normalizedPhone = normalizePhone(phone)

  try {
    return await withPolicyTenantTransaction(
      databaseContext,
      toDatabasePolicyContext(decision),
      async (db) => {
        const learner = await resolveLearnerAnchor(db, tenantId, input.learnerId, true)
        const rows = await db.execute<GuardianContactFunctionRow>(sql`
          select
            relationship_id as "relationshipId",
            contact_person_id as "contactPersonId",
            version,
            account_membership_invalidated as "accountMembershipInvalidated",
            occurred_at as "occurredAt"
          from openschool_private.create_guardian_contact(
            ${relationshipId}::uuid,
            ${contactPersonId}::uuid,
            ${learner.personId}::uuid,
            ${input.contact.kind === 'new'}::boolean,
            ${displayName},
            ${displayName?.toLocaleLowerCase('en') ?? null},
            ${firstName},
            ${lastName},
            ${email},
            ${email},
            ${phone},
            ${normalizedPhone},
            ${contact?.preferredContactMethod ?? 'none'},
            ${input.relationshipType},
            ${input.legalAuthority},
            ${input.decisionAuthority},
            ${input.emergencyPriority ?? null}::integer,
            ${input.pickupAuthority},
            ${input.portalEligible},
            ${validFrom.toISOString()}::timestamp with time zone,
            ${input.issuanceReason.trim()}
          )
        `)
        if (!rows[0]) throw new Error('GUARDIAN_CONTACT_CREATE_FAILED')
        await appendAuditEventInTransaction(db, databaseContext, context, decision, {
          eventType: 'guardian.contact.create',
          outcome: 'succeeded',
          targetType: 'person.relationship',
          targetId: relationshipId,
          dataClasses: ['safeguarding'],
          change: {
            changedFields: [
              'relationshipType',
              'legalAuthority',
              'decisionAuthority',
              'emergencyPriority',
              'pickupAuthority',
              'portalEligibility',
              'invitationEligibility',
            ],
          },
          purpose: 'guardian_contact_maintenance',
          outbox: {
            topic: 'audit.event.committed',
            deduplicationKey: `guardian.contact.create:${databaseContext.requestId}:${relationshipId}`,
          },
        })
        return loadContacts(db, tenantId, learner.personId)
      }
    )
  } catch (error) {
    return recordContactFailure(
      error,
      databaseContext,
      context,
      decision,
      'guardian.contact.create',
      relationshipId
    )
  }
}

export async function updateGuardianContact(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  input: UpdateGuardianContactInput
): Promise<GuardianContact[]> {
  assertStudentSliceEnabled()
  assertDatabasePolicyContext(databaseContext, context)
  const tenantId = assertContactDecision(context, decision, CAPABILITIES.GUARDIAN_CONTACTS_MANAGE)
  try {
    return await withPolicyTenantTransaction(
      databaseContext,
      toDatabasePolicyContext(decision),
      async (db) => {
        const rows = await db.execute<GuardianContactFunctionRow>(sql`
          select
            relationship_id as "relationshipId",
            contact_person_id as "contactPersonId",
            learner_person_id as "learnerPersonId",
            version,
            account_membership_invalidated as "accountMembershipInvalidated",
            occurred_at as "occurredAt"
          from openschool_private.update_guardian_contact(
            ${input.relationshipId}::uuid,
            ${input.expectedVersion}::bigint,
            ${input.legalAuthority},
            ${input.decisionAuthority},
            ${input.emergencyPriority ?? null}::integer,
            ${input.pickupAuthority},
            ${input.portalEligible}
          )
        `)
        const row = rows[0]
        if (!row?.learnerPersonId) policyDenied()
        await appendAuditEventInTransaction(db, databaseContext, context, decision, {
          eventType: 'guardian.contact.update',
          outcome: 'succeeded',
          targetType: 'person.relationship',
          targetId: input.relationshipId,
          dataClasses: ['safeguarding'],
          change: {
            changedFields: [
              'legalAuthority',
              'decisionAuthority',
              'emergencyPriority',
              'pickupAuthority',
              'portalEligibility',
              'invitationEligibility',
            ],
          },
          purpose: 'guardian_contact_maintenance',
          outbox: {
            topic: 'audit.event.committed',
            deduplicationKey: `guardian.contact.update:${databaseContext.requestId}:${input.relationshipId}:${row.version}`,
          },
        })
        return loadContacts(db, tenantId, row.learnerPersonId)
      }
    )
  } catch (error) {
    return recordContactFailure(
      error,
      databaseContext,
      context,
      decision,
      'guardian.contact.update',
      input.relationshipId
    )
  }
}

export async function endGuardianContact(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  relationshipId: string,
  expectedVersion: number,
  reason: string
): Promise<GuardianContact[]> {
  assertStudentSliceEnabled()
  assertDatabasePolicyContext(databaseContext, context)
  const tenantId = assertContactDecision(context, decision, CAPABILITIES.GUARDIAN_CONTACTS_MANAGE)
  try {
    return await withPolicyTenantTransaction(
      databaseContext,
      toDatabasePolicyContext(decision),
      async (db) => {
        const rows = await db.execute<GuardianContactFunctionRow>(sql`
          select
            relationship_id as "relationshipId",
            contact_person_id as "contactPersonId",
            learner_person_id as "learnerPersonId",
            version,
            account_membership_invalidated as "accountMembershipInvalidated",
            occurred_at as "occurredAt"
          from openschool_private.end_guardian_contact(
            ${relationshipId}::uuid,
            ${expectedVersion}::bigint,
            ${reason.trim()},
            ${new Date().toISOString()}::timestamp with time zone
          )
        `)
        const row = rows[0]
        if (!row?.learnerPersonId) policyDenied()
        await appendAuditEventInTransaction(db, databaseContext, context, decision, {
          eventType: 'guardian.contact.end',
          outcome: 'succeeded',
          targetType: 'person.relationship',
          targetId: relationshipId,
          dataClasses: ['safeguarding'],
          change: {
            changedFields: ['status', 'validUntil', 'portalEligibility', 'invitationEligibility'],
          },
          purpose: 'guardian_contact_maintenance',
          outbox: {
            topic: 'audit.event.committed',
            deduplicationKey: `guardian.contact.end:${databaseContext.requestId}:${relationshipId}:${row.version}`,
          },
        })
        return loadContacts(db, tenantId, row.learnerPersonId)
      }
    )
  } catch (error) {
    return recordContactFailure(
      error,
      databaseContext,
      context,
      decision,
      'guardian.contact.end',
      relationshipId
    )
  }
}
