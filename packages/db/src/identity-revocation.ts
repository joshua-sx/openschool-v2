import { sql } from 'drizzle-orm'
import type { DatabaseTransaction } from './tenant-transaction'

export const IDENTITY_REVOCATION_ACTIONS = [
  'account_session_revoke',
  'account_sessions_revoke',
  'account_disable',
  'account_mfa_reset',
  'affiliation_revoke',
  'role_revoke',
] as const

export type IdentityRevocationAction = (typeof IDENTITY_REVOCATION_ACTIONS)[number]

export interface IdentityRevocationInput {
  action: IdentityRevocationAction
  targetId: string
  reason: string
}

export interface IdentityRevocationEffect {
  affectedAccountId: string
  affectedSessionId: string | null
  membershipVersion: number
  securityVersion: number
  affectedSessionCount: number
  occurredAt: Date
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface RevocationRow extends Record<string, unknown> {
  affectedAccountId: string
  affectedSessionId: string | null
  membershipVersion: number | string
  securityVersion: number | string
  affectedSessionCount: number | string
  occurredAt: Date | string
}

function positiveVersion(name: string, value: number | string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`IDENTITY_REVOCATION_${name}_INVALID`)
  }
  return parsed
}

function revocationTime(value: unknown): Date {
  if (!(value instanceof Date) && (typeof value !== 'string' || value.trim().length === 0)) {
    throw new Error('IDENTITY_REVOCATION_TIME_INVALID')
  }
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('IDENTITY_REVOCATION_TIME_INVALID')
  }
  return parsed
}

/** Calls the sole database authority allowed to mutate live identity access. */
export async function applyIdentityRevocation(
  tx: DatabaseTransaction,
  input: IdentityRevocationInput
): Promise<readonly IdentityRevocationEffect[]> {
  if (!IDENTITY_REVOCATION_ACTIONS.includes(input.action)) {
    throw new Error('IDENTITY_REVOCATION_ACTION_INVALID')
  }
  if (!UUID.test(input.targetId)) throw new Error('IDENTITY_REVOCATION_TARGET_INVALID')
  const reason = input.reason.trim()
  if (reason.length < 3 || reason.length > 512) {
    throw new Error('IDENTITY_REVOCATION_REASON_INVALID')
  }

  const rows = await tx.execute<RevocationRow>(sql`
    select
      affected_account_id as "affectedAccountId",
      affected_session_id as "affectedSessionId",
      membership_version as "membershipVersion",
      security_version as "securityVersion",
      affected_session_count as "affectedSessionCount",
      occurred_at as "occurredAt"
    from openschool_private.apply_identity_revocation_with_reconciliation(
      ${input.action}::text,
      ${input.targetId}::uuid,
      ${reason}::text
    )
  `)

  return Object.freeze(
    rows.map((row) => {
      const affectedSessionCount = Number(row.affectedSessionCount)
      const occurredAt = revocationTime(row.occurredAt)
      if (!UUID.test(row.affectedAccountId)) {
        throw new Error('IDENTITY_REVOCATION_ACCOUNT_INVALID')
      }
      if (!Number.isSafeInteger(affectedSessionCount) || affectedSessionCount < 0) {
        throw new Error('IDENTITY_REVOCATION_SESSION_COUNT_INVALID')
      }
      return Object.freeze({
        affectedAccountId: row.affectedAccountId,
        affectedSessionId: row.affectedSessionId,
        membershipVersion: positiveVersion('MEMBERSHIP_VERSION', row.membershipVersion),
        securityVersion: positiveVersion('SECURITY_VERSION', row.securityVersion),
        affectedSessionCount,
        occurredAt,
      })
    })
  )
}

/** Uses mutation evidence when present and otherwise reads the transaction's database clock. */
export async function identityRevocationOccurredAt(
  tx: DatabaseTransaction,
  effects: readonly IdentityRevocationEffect[]
): Promise<Date> {
  const mutationTime = effects[0]?.occurredAt
  if (mutationTime) return new Date(mutationTime.getTime())
  const [clock] = await tx.execute<Record<string, unknown> & { occurredAt: Date | string }>(sql`
    select statement_timestamp() as "occurredAt"
  `)
  return revocationTime(clock?.occurredAt)
}
