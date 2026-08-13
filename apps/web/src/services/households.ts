import { appendAuditEventInTransaction, recordAuditAttempt } from '@openschool/audit'
import {
  type DatabaseTransaction,
  type TenantDatabaseContext,
  householdAddresses,
  householdMemberships,
  households,
  people,
  schoolEnrollments,
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

export type MembershipKind = 'resident' | 'associated'
export type AddressType = 'residential' | 'mailing' | 'temporary' | 'other'

export interface AddressInput {
  addressType: AddressType
  label?: string | null
  line1: string
  line2?: string | null
  locality: string
  administrativeArea?: string | null
  postalCode?: string | null
  countryCode: string
  deliveryInstructions?: string | null
}

export interface HouseholdSummary {
  householdId: string
  displayName: string
  status: 'active' | 'closed'
  membership: {
    id: string
    kind: MembershipKind
    isPrimaryResidence: boolean
    isPrimaryMailing: boolean
    status: 'active' | 'ended'
    validFrom: Date
    validUntil: Date | null
    version: number
  }
  addresses: Array<{
    id: string
    addressKey: string
    version: number
    addressType: AddressType
    label: string | null
    line1: string
    line2: string | null
    locality: string
    administrativeArea: string | null
    postalCode: string | null
    countryCode: string
    deliveryInstructions: string | null
    isPrimary: boolean
    status: 'active' | 'ended'
    validFrom: Date
    validUntil: Date | null
  }>
  currentMembers: Array<{
    membershipId: string
    personId: string
    displayName: string
    kind: MembershipKind
    isLearner: boolean
    version: number
  }>
}

type HouseholdEvent =
  | 'household.create'
  | 'household.member.add'
  | 'household.member.revise'
  | 'household.member.end'
  | 'household.address.add'
  | 'household.address.revise'

interface FunctionRow extends Record<string, unknown> {
  householdId?: string
  membershipId?: string
  addressId?: string
  version?: number | string
}

function notFound(): never {
  throw new TRPCError({ code: 'NOT_FOUND', message: 'Household not found' })
}

function assertDecision(
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  capability: Capability
): string {
  if (
    decision.capability !== capability ||
    !context.tenantId ||
    decision.queryConstraints.length === 0 ||
    decision.queryConstraints.length > 16 ||
    decision.queryConstraints.some(
      (constraint) => constraint.kind === 'platform' || constraint.tenantId !== context.tenantId
    )
  ) {
    notFound()
  }
  return context.tenantId
}

function normalized(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ')
}

function normalizedAddress(value: AddressInput): string {
  return [
    value.line1,
    value.line2,
    value.locality,
    value.administrativeArea,
    value.postalCode,
    value.countryCode,
  ]
    .filter(Boolean)
    .map((part) => normalized(String(part)).toLocaleLowerCase('en'))
    .join('|')
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

function normalizeHouseholdError(error: unknown): unknown {
  if (error instanceof TRPCError) return error
  switch (databaseErrorCode(error)) {
    case '42501':
    case '23503':
      return new TRPCError({ code: 'NOT_FOUND', message: 'Household not found', cause: error })
    case '23P01':
    case '23505':
      return new TRPCError({
        code: 'CONFLICT',
        message: 'These household dates or primary preferences overlap existing records',
        cause: error,
      })
    case '40001':
      return new TRPCError({
        code: 'CONFLICT',
        message: 'The household changed. Refresh the learner record and try again.',
        cause: error,
      })
    case '22023':
    case '23514':
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: 'The household details or effective dates are invalid',
        cause: error,
      })
    default:
      return error
  }
}

async function recordFailure(
  error: unknown,
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  eventType: HouseholdEvent,
  targetId?: string
): Promise<never> {
  const normalizedError = normalizeHouseholdError(error)
  try {
    await recordAuditAttempt(databaseContext, context, decision, {
      eventType,
      outcome:
        normalizedError instanceof TRPCError && normalizedError.code === 'NOT_FOUND'
          ? 'denied'
          : 'failed',
      targetType: 'household',
      ...(targetId ? { targetId } : {}),
      dataClasses: ['student_personal'],
      change: { changedFields: ['operation'] },
    })
  } catch (auditError) {
    throw new AggregateError(
      [normalizedError, auditError],
      'Household mutation failed and its failure evidence could not be recorded'
    )
  }
  throw normalizedError
}

async function learnerPersonId(
  db: DatabaseTransaction,
  tenantId: string,
  learnerId: string,
  requireCurrent: boolean
): Promise<string> {
  const now = new Date().toISOString()
  const filters = [
    eq(schoolEnrollments.tenantId, tenantId),
    or(eq(schoolEnrollments.personId, learnerId), eq(schoolEnrollments.legacyStudentId, learnerId)),
  ]
  if (requireCurrent) {
    filters.push(
      eq(schoolEnrollments.status, 'enrolled'),
      lte(schoolEnrollments.validFrom, new Date(now)),
      or(
        isNull(schoolEnrollments.validUntil),
        sql`${schoolEnrollments.validUntil} > ${now}::timestamptz`
      )
    )
  }
  const [row] = await db
    .select({ personId: schoolEnrollments.personId })
    .from(schoolEnrollments)
    .where(and(...filters))
    .orderBy(desc(schoolEnrollments.validFrom), desc(schoolEnrollments.id))
    .limit(1)
  if (!row) notFound()
  return row.personId
}

async function loadHouseholds(
  db: DatabaseTransaction,
  tenantId: string,
  personId: string
): Promise<HouseholdSummary[]> {
  const memberships = await db
    .select({
      householdId: households.id,
      displayName: households.displayName,
      householdStatus: households.status,
      membershipId: householdMemberships.id,
      kind: householdMemberships.membershipKind,
      isPrimaryResidence: householdMemberships.isPrimaryResidence,
      isPrimaryMailing: householdMemberships.isPrimaryMailing,
      membershipStatus: householdMemberships.status,
      validFrom: householdMemberships.validFrom,
      validUntil: householdMemberships.validUntil,
      version: householdMemberships.version,
    })
    .from(householdMemberships)
    .innerJoin(
      households,
      and(
        eq(households.tenantId, householdMemberships.tenantId),
        eq(households.id, householdMemberships.householdId)
      )
    )
    .where(
      and(eq(householdMemberships.tenantId, tenantId), eq(householdMemberships.personId, personId))
    )
    .orderBy(
      asc(sql`CASE WHEN ${householdMemberships.status} = 'active' THEN 0 ELSE 1 END`),
      desc(householdMemberships.validFrom),
      asc(households.displayName),
      asc(householdMemberships.id)
    )
    .limit(100)

  const result: HouseholdSummary[] = []
  for (const membership of memberships) {
    const addresses = await db
      .select({
        id: householdAddresses.id,
        addressKey: householdAddresses.addressKey,
        version: householdAddresses.version,
        addressType: householdAddresses.addressType,
        label: householdAddresses.label,
        line1: householdAddresses.line1,
        line2: householdAddresses.line2,
        locality: householdAddresses.locality,
        administrativeArea: householdAddresses.administrativeArea,
        postalCode: householdAddresses.postalCode,
        countryCode: householdAddresses.countryCode,
        deliveryInstructions: householdAddresses.deliveryInstructions,
        isPrimary: householdAddresses.isPrimary,
        status: householdAddresses.status,
        validFrom: householdAddresses.validFrom,
        validUntil: householdAddresses.validUntil,
      })
      .from(householdAddresses)
      .where(
        and(
          eq(householdAddresses.tenantId, tenantId),
          eq(householdAddresses.householdId, membership.householdId)
        )
      )
      .orderBy(
        asc(sql`CASE WHEN ${householdAddresses.status} = 'active' THEN 0 ELSE 1 END`),
        desc(householdAddresses.validFrom),
        asc(householdAddresses.id)
      )
      .limit(100)
    const currentMembers = await db
      .select({
        membershipId: householdMemberships.id,
        personId: householdMemberships.personId,
        displayName: people.displayName,
        kind: householdMemberships.membershipKind,
        version: householdMemberships.version,
      })
      .from(householdMemberships)
      .innerJoin(
        people,
        and(
          eq(people.tenantId, householdMemberships.tenantId),
          eq(people.id, householdMemberships.personId)
        )
      )
      .where(
        and(
          eq(householdMemberships.tenantId, tenantId),
          eq(householdMemberships.householdId, membership.householdId),
          eq(householdMemberships.status, 'active'),
          lte(householdMemberships.validFrom, new Date()),
          or(
            isNull(householdMemberships.validUntil),
            sql`${householdMemberships.validUntil} > now()`
          )
        )
      )
      .orderBy(asc(people.displayName), asc(householdMemberships.id))
      .limit(100)
    result.push({
      householdId: membership.householdId,
      displayName: membership.displayName,
      status: membership.householdStatus,
      membership: {
        id: membership.membershipId,
        kind: membership.kind,
        isPrimaryResidence: membership.isPrimaryResidence,
        isPrimaryMailing: membership.isPrimaryMailing,
        status: membership.membershipStatus,
        validFrom: membership.validFrom,
        validUntil: membership.validUntil,
        version: membership.version,
      },
      addresses,
      currentMembers: currentMembers.map((member) => ({
        ...member,
        isLearner: member.personId === personId,
      })),
    })
  }
  return result
}

export async function getLearnerHouseholds(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  learnerId: string
): Promise<HouseholdSummary[]> {
  assertStudentSliceEnabled()
  assertDatabasePolicyContext(databaseContext, context)
  const tenantId = assertDecision(context, decision, CAPABILITIES.HOUSEHOLDS_READ)
  return withPolicyTenantTransaction(
    databaseContext,
    toDatabasePolicyContext(decision),
    async (db) =>
      loadHouseholds(db, tenantId, await learnerPersonId(db, tenantId, learnerId, false))
  )
}

export async function findHouseholdMemberCandidates(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  learnerId: string,
  query: string
): Promise<Array<{ personId: string; displayName: string }>> {
  assertStudentSliceEnabled()
  assertDatabasePolicyContext(databaseContext, context)
  const tenantId = assertDecision(context, decision, CAPABILITIES.HOUSEHOLDS_MANAGE)
  const search = normalized(query).toLocaleLowerCase('en')
  if (search.length < 2) return []
  return withPolicyTenantTransaction(
    databaseContext,
    toDatabasePolicyContext(decision),
    async (db) => {
      const anchorPersonId = await learnerPersonId(db, tenantId, learnerId, true)
      return db
        .selectDistinct({ personId: people.id, displayName: people.displayName })
        .from(schoolEnrollments)
        .innerJoin(
          people,
          and(
            eq(people.tenantId, schoolEnrollments.tenantId),
            eq(people.id, schoolEnrollments.personId)
          )
        )
        .where(
          and(
            eq(schoolEnrollments.tenantId, tenantId),
            eq(schoolEnrollments.status, 'enrolled'),
            lte(schoolEnrollments.validFrom, new Date()),
            or(isNull(schoolEnrollments.validUntil), sql`${schoolEnrollments.validUntil} > now()`),
            sql`${people.id} <> ${anchorPersonId}::uuid`,
            ilike(people.normalizedDisplayName, `%${search}%`)
          )
        )
        .orderBy(asc(people.displayName), asc(people.id))
        .limit(10)
    }
  )
}

interface CreateHouseholdInput {
  learnerId: string
  displayName: string
  address: AddressInput
  isPrimaryResidence: boolean
  isPrimaryMailing: boolean
  effectiveAt: Date
  reason: string
}

async function successfulAudit(
  db: DatabaseTransaction,
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  eventType: HouseholdEvent,
  targetId: string,
  changedFields: string[],
  version?: number | string
): Promise<void> {
  await appendAuditEventInTransaction(db, databaseContext, context, decision, {
    eventType,
    outcome: 'succeeded',
    targetType: 'household',
    targetId,
    dataClasses: ['student_personal'],
    change: { changedFields },
    purpose: 'household_record_maintenance',
    outbox: {
      topic: 'audit.event.committed',
      deduplicationKey: `${eventType}:${databaseContext.requestId}:${targetId}:${String(version ?? 1)}`,
    },
  })
}

export async function createHousehold(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  input: CreateHouseholdInput
): Promise<HouseholdSummary[]> {
  assertStudentSliceEnabled()
  assertDatabasePolicyContext(databaseContext, context)
  const tenantId = assertDecision(context, decision, CAPABILITIES.HOUSEHOLDS_MANAGE)
  const householdId = crypto.randomUUID()
  try {
    return await withPolicyTenantTransaction(
      databaseContext,
      toDatabasePolicyContext(decision),
      async (db) => {
        const personId = await learnerPersonId(db, tenantId, input.learnerId, true)
        const rows = await db.execute<FunctionRow>(sql`
        select household_id as "householdId", membership_id as "membershipId", address_id as "addressId"
        from openschool_private.create_household(
          ${householdId}::uuid, ${crypto.randomUUID()}::uuid, ${crypto.randomUUID()}::uuid,
          ${crypto.randomUUID()}::uuid, ${crypto.randomUUID()}::uuid, ${personId}::uuid,
          ${normalized(input.displayName)}, ${normalized(input.displayName).toLocaleLowerCase('en')},
          ${input.address.addressType}, ${input.address.label ?? null}, ${normalized(input.address.line1)},
          ${input.address.line2 ?? null}, ${normalized(input.address.locality)},
          ${input.address.administrativeArea ?? null}, ${input.address.postalCode ?? null},
          ${input.address.countryCode.toUpperCase()}, ${normalizedAddress(input.address)},
          ${input.address.deliveryInstructions ?? null}, ${input.isPrimaryResidence},
          ${input.isPrimaryMailing}, ${input.effectiveAt.toISOString()}::timestamptz, ${input.reason.trim()}
        )
      `)
        if (!rows[0]?.householdId) throw new Error('HOUSEHOLD_CREATE_FAILED')
        await successfulAudit(
          db,
          databaseContext,
          context,
          decision,
          'household.create',
          householdId,
          ['displayName', 'membership', 'address', 'primaryResidence', 'primaryMailing']
        )
        return loadHouseholds(db, tenantId, personId)
      }
    )
  } catch (error) {
    return recordFailure(error, databaseContext, context, decision, 'household.create', householdId)
  }
}

interface MemberInput {
  learnerId: string
  householdId: string
  personId: string
  membershipKind: MembershipKind
  isPrimaryResidence: boolean
  isPrimaryMailing: boolean
  effectiveAt: Date
  reason: string
}

export async function addHouseholdMember(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  input: MemberInput
): Promise<HouseholdSummary[]> {
  assertStudentSliceEnabled()
  assertDatabasePolicyContext(databaseContext, context)
  const tenantId = assertDecision(context, decision, CAPABILITIES.HOUSEHOLDS_MANAGE)
  const membershipId = crypto.randomUUID()
  try {
    return await withPolicyTenantTransaction(
      databaseContext,
      toDatabasePolicyContext(decision),
      async (db) => {
        const learnerId = await learnerPersonId(db, tenantId, input.learnerId, true)
        const rows = await db.execute<FunctionRow>(sql`
        select membership_id as "membershipId", version
        from openschool_private.add_household_member(
          ${membershipId}::uuid, ${crypto.randomUUID()}::uuid, ${input.householdId}::uuid,
          ${input.personId}::uuid, ${input.membershipKind}, ${input.isPrimaryResidence},
          ${input.isPrimaryMailing}, ${input.effectiveAt.toISOString()}::timestamptz, ${input.reason.trim()}
        )
      `)
        if (!rows[0]?.membershipId) throw new Error('HOUSEHOLD_MEMBER_ADD_FAILED')
        await successfulAudit(
          db,
          databaseContext,
          context,
          decision,
          'household.member.add',
          input.householdId,
          ['member', 'membershipKind', 'primaryResidence', 'primaryMailing', 'validFrom']
        )
        return loadHouseholds(db, tenantId, learnerId)
      }
    )
  } catch (error) {
    return recordFailure(
      error,
      databaseContext,
      context,
      decision,
      'household.member.add',
      input.householdId
    )
  }
}

interface ReviseMemberInput extends Omit<MemberInput, 'householdId' | 'personId'> {
  membershipId: string
  expectedVersion: number
}

export async function reviseHouseholdMember(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  input: ReviseMemberInput
): Promise<HouseholdSummary[]> {
  assertStudentSliceEnabled()
  assertDatabasePolicyContext(databaseContext, context)
  const tenantId = assertDecision(context, decision, CAPABILITIES.HOUSEHOLDS_MANAGE)
  try {
    return await withPolicyTenantTransaction(
      databaseContext,
      toDatabasePolicyContext(decision),
      async (db) => {
        const personId = await learnerPersonId(db, tenantId, input.learnerId, true)
        const rows = await db.execute<FunctionRow>(sql`
        select membership_id as "membershipId", version
        from openschool_private.revise_household_member(
          ${input.membershipId}::uuid, ${crypto.randomUUID()}::uuid, ${input.expectedVersion}::integer,
          ${input.membershipKind}, ${input.isPrimaryResidence}, ${input.isPrimaryMailing},
          ${input.effectiveAt.toISOString()}::timestamptz, ${input.reason.trim()}
        )
      `)
        const row = rows[0]
        if (!row?.membershipId) notFound()
        await successfulAudit(
          db,
          databaseContext,
          context,
          decision,
          'household.member.revise',
          input.membershipId,
          ['membershipKind', 'primaryResidence', 'primaryMailing', 'validFrom'],
          row.version
        )
        return loadHouseholds(db, tenantId, personId)
      }
    )
  } catch (error) {
    return recordFailure(
      error,
      databaseContext,
      context,
      decision,
      'household.member.revise',
      input.membershipId
    )
  }
}

export async function endHouseholdMember(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  input: Pick<
    ReviseMemberInput,
    'learnerId' | 'membershipId' | 'expectedVersion' | 'effectiveAt' | 'reason'
  >
): Promise<HouseholdSummary[]> {
  assertStudentSliceEnabled()
  assertDatabasePolicyContext(databaseContext, context)
  const tenantId = assertDecision(context, decision, CAPABILITIES.HOUSEHOLDS_MANAGE)
  try {
    return await withPolicyTenantTransaction(
      databaseContext,
      toDatabasePolicyContext(decision),
      async (db) => {
        const personId = await learnerPersonId(db, tenantId, input.learnerId, true)
        const rows = await db.execute<FunctionRow>(sql`
        select membership_id as "membershipId", version
        from openschool_private.end_household_member(
          ${input.membershipId}::uuid, ${input.expectedVersion}::integer,
          ${input.effectiveAt.toISOString()}::timestamptz, ${input.reason.trim()}
        )
      `)
        const row = rows[0]
        if (!row?.membershipId) notFound()
        await successfulAudit(
          db,
          databaseContext,
          context,
          decision,
          'household.member.end',
          input.membershipId,
          ['status', 'validUntil'],
          row.version
        )
        return loadHouseholds(db, tenantId, personId)
      }
    )
  } catch (error) {
    return recordFailure(
      error,
      databaseContext,
      context,
      decision,
      'household.member.end',
      input.membershipId
    )
  }
}

interface AddAddressInput extends AddressInput {
  learnerId: string
  householdId: string
  isPrimary: boolean
  effectiveAt: Date
  reason: string
}

export async function addHouseholdAddress(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  input: AddAddressInput
): Promise<HouseholdSummary[]> {
  assertStudentSliceEnabled()
  assertDatabasePolicyContext(databaseContext, context)
  const tenantId = assertDecision(context, decision, CAPABILITIES.HOUSEHOLDS_MANAGE)
  const addressId = crypto.randomUUID()
  try {
    return await withPolicyTenantTransaction(
      databaseContext,
      toDatabasePolicyContext(decision),
      async (db) => {
        const personId = await learnerPersonId(db, tenantId, input.learnerId, true)
        const rows = await db.execute<FunctionRow>(sql`
        select address_id as "addressId", version from openschool_private.add_household_address(
          ${addressId}::uuid, ${crypto.randomUUID()}::uuid, ${input.householdId}::uuid,
          ${input.addressType}, ${input.label ?? null}, ${normalized(input.line1)}, ${input.line2 ?? null},
          ${normalized(input.locality)}, ${input.administrativeArea ?? null}, ${input.postalCode ?? null},
          ${input.countryCode.toUpperCase()}, ${normalizedAddress(input)}, ${input.deliveryInstructions ?? null},
          ${input.isPrimary}, ${input.effectiveAt.toISOString()}::timestamptz, ${input.reason.trim()}
        )
      `)
        if (!rows[0]?.addressId) notFound()
        await successfulAudit(
          db,
          databaseContext,
          context,
          decision,
          'household.address.add',
          input.householdId,
          ['address', 'addressType', 'isPrimary', 'validFrom']
        )
        return loadHouseholds(db, tenantId, personId)
      }
    )
  } catch (error) {
    return recordFailure(
      error,
      databaseContext,
      context,
      decision,
      'household.address.add',
      input.householdId
    )
  }
}

interface ReviseAddressInput extends AddressInput {
  learnerId: string
  addressId: string
  expectedVersion: number
  isPrimary: boolean
  effectiveAt: Date
  reason: string
}

export async function reviseHouseholdAddress(
  databaseContext: TenantDatabaseContext,
  context: PolicyContext,
  decision: AllowedPolicyDecision,
  input: ReviseAddressInput
): Promise<HouseholdSummary[]> {
  assertStudentSliceEnabled()
  assertDatabasePolicyContext(databaseContext, context)
  const tenantId = assertDecision(context, decision, CAPABILITIES.HOUSEHOLDS_MANAGE)
  try {
    return await withPolicyTenantTransaction(
      databaseContext,
      toDatabasePolicyContext(decision),
      async (db) => {
        const personId = await learnerPersonId(db, tenantId, input.learnerId, true)
        const rows = await db.execute<FunctionRow>(sql`
        select address_id as "addressId", version from openschool_private.revise_household_address(
          ${input.addressId}::uuid, ${crypto.randomUUID()}::uuid, ${input.expectedVersion}::integer,
          ${input.addressType}, ${input.label ?? null}, ${normalized(input.line1)}, ${input.line2 ?? null},
          ${normalized(input.locality)}, ${input.administrativeArea ?? null}, ${input.postalCode ?? null},
          ${input.countryCode.toUpperCase()}, ${normalizedAddress(input)}, ${input.deliveryInstructions ?? null},
          ${input.isPrimary}, ${input.effectiveAt.toISOString()}::timestamptz, ${input.reason.trim()}
        )
      `)
        const row = rows[0]
        if (!row?.addressId) notFound()
        await successfulAudit(
          db,
          databaseContext,
          context,
          decision,
          'household.address.revise',
          input.addressId,
          ['address', 'addressType', 'isPrimary', 'validFrom'],
          row.version
        )
        return loadHouseholds(db, tenantId, personId)
      }
    )
  } catch (error) {
    return recordFailure(
      error,
      databaseContext,
      context,
      decision,
      'household.address.revise',
      input.addressId
    )
  }
}
