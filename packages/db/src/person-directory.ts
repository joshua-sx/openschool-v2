import { and, eq, ne, or } from 'drizzle-orm'
import { people, personMergeEvidence } from './schema'
import type { DatabaseTransaction } from './tenant-transaction'

export interface EffectiveRecord {
  status: string
  validFrom: Date | null
  validUntil: Date | null
}

export interface PersonCandidate {
  id: string
  tenantId: string
  displayName: string
  normalizedDisplayName: string
  dateOfBirth: string | null
  normalizedEmail: string | null
}

export interface DuplicatePersonCandidate extends PersonCandidate {
  score: number
  reasons: Array<'same_email' | 'same_name' | 'same_date_of_birth'>
}

export interface FindDuplicatePersonInput {
  tenantId: string
  displayName: string
  email?: string | null
  dateOfBirth?: string | null
  excludePersonId?: string
}

export interface RecordPersonMergeProposalInput {
  tenantId: string
  sourcePersonId: string
  targetPersonId: string
  reason: string
  evidence: Record<string, unknown>
  recordedByAccountId: string
}

export class PersonDirectoryError extends Error {
  constructor(
    readonly code: 'invalid_merge' | 'person_not_found',
    message: string
  ) {
    super(message)
    this.name = 'PersonDirectoryError'
  }
}

export function normalizePersonName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en')
}

export function normalizePersonEmail(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en')
}

/**
 * Half-open effective periods prevent a grant ending at an instant from also
 * authorizing at that instant. Only `active` records ever authorize.
 */
export function isEffectiveRecord(record: EffectiveRecord, at = new Date()): boolean {
  if (record.status !== 'active' || record.validFrom === null) {
    return false
  }

  return (
    record.validFrom.getTime() <= at.getTime() &&
    (record.validUntil === null || at.getTime() < record.validUntil.getTime())
  )
}

export function scoreDuplicatePersonCandidate(
  candidate: PersonCandidate,
  input: FindDuplicatePersonInput
): DuplicatePersonCandidate {
  const normalizedName = normalizePersonName(input.displayName)
  const normalizedEmail = input.email ? normalizePersonEmail(input.email) : null
  const reasons: DuplicatePersonCandidate['reasons'] = []
  let score = 0

  if (normalizedEmail !== null && candidate.normalizedEmail === normalizedEmail) {
    reasons.push('same_email')
    score += 60
  }
  if (candidate.normalizedDisplayName === normalizedName) {
    reasons.push('same_name')
    score += 25
  }
  if (input.dateOfBirth && candidate.dateOfBirth === input.dateOfBirth) {
    reasons.push('same_date_of_birth')
    score += 25
  }

  return { ...candidate, reasons, score: Math.min(score, 100) }
}

/**
 * Returns candidates from exactly one Tenant. Matching is deliberately
 * suggestive: only an explicit, evidenced proposal can begin a merge.
 */
export async function findDuplicatePersonCandidates(
  tx: DatabaseTransaction,
  input: FindDuplicatePersonInput
): Promise<DuplicatePersonCandidate[]> {
  const normalizedName = normalizePersonName(input.displayName)
  const normalizedEmail = input.email ? normalizePersonEmail(input.email) : null
  const match = normalizedEmail
    ? or(
        eq(people.normalizedDisplayName, normalizedName),
        eq(people.normalizedEmail, normalizedEmail)
      )
    : eq(people.normalizedDisplayName, normalizedName)
  const exclude = input.excludePersonId ? ne(people.id, input.excludePersonId) : undefined

  const candidates = await tx
    .select({
      id: people.id,
      tenantId: people.tenantId,
      displayName: people.displayName,
      normalizedDisplayName: people.normalizedDisplayName,
      dateOfBirth: people.dateOfBirth,
      normalizedEmail: people.normalizedEmail,
    })
    .from(people)
    .where(and(eq(people.tenantId, input.tenantId), match, exclude))

  return candidates
    .map((candidate) => scoreDuplicatePersonCandidate(candidate, input))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
}

export async function recordPersonMergeProposal(
  tx: DatabaseTransaction,
  input: RecordPersonMergeProposalInput
): Promise<string> {
  if (input.sourcePersonId === input.targetPersonId) {
    throw new PersonDirectoryError('invalid_merge', 'A Person cannot be merged into itself')
  }
  if (input.reason.trim().length === 0) {
    throw new PersonDirectoryError('invalid_merge', 'A merge proposal requires a reason')
  }

  const candidates = await tx
    .select({ id: people.id })
    .from(people)
    .where(
      and(
        eq(people.tenantId, input.tenantId),
        or(eq(people.id, input.sourcePersonId), eq(people.id, input.targetPersonId))
      )
    )

  if (new Set(candidates.map(({ id }) => id)).size !== 2) {
    throw new PersonDirectoryError(
      'person_not_found',
      'Both merge candidates must exist in the same Tenant'
    )
  }

  const [proposal] = await tx
    .insert(personMergeEvidence)
    .values({
      tenantId: input.tenantId,
      sourcePersonId: input.sourcePersonId,
      targetPersonId: input.targetPersonId,
      reason: input.reason.trim(),
      evidence: input.evidence,
      recordedByAccountId: input.recordedByAccountId,
    })
    .returning({ id: personMergeEvidence.id })

  if (!proposal) {
    throw new Error('Person merge proposal insert returned no row')
  }
  return proposal.id
}
