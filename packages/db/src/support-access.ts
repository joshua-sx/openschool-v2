import { sql } from 'drizzle-orm'
import type {
  SupportAccessCapability,
  SupportAccessPurpose,
  SupportAccessReviewOutcome,
  SupportAccessScopeType,
} from './schema/support-access'
import type { DatabaseTransaction } from './tenant-transaction'

interface SupportAccessEffectRow extends Record<string, unknown> {
  supportGrantId: string
  status: string
  notificationId: string
  auditEventId: string
  occurredAt?: Date | string
  tenantId?: string
  validUntil?: Date | string
  reviewStatus?: string
}

export interface SupportAccessEffect {
  supportGrantId: string
  status: string
  notificationId: string
  auditEventId: string
  occurredAt?: string
  tenantId?: string
  validUntil?: string
  reviewStatus?: string
}

export interface SupportAccessScopeInput {
  scopeType: SupportAccessScopeType
  educationOrganizationId?: string
  schoolId?: string
}

export interface IssueSupportAccessGrantInput extends SupportAccessScopeInput {
  supportAccountId: string
  allowedCapabilities: readonly SupportAccessCapability[]
  purpose: SupportAccessPurpose
  ticketReference: string
  authorizationReason: string
  validUntil: string
}

export interface OpenBreakGlassAccessInput extends SupportAccessScopeInput {
  tenantId: string
  allowedCapabilities: readonly SupportAccessCapability[]
  ticketReference: string
  emergencyRuleReference: string
  authorizationReason: string
  validUntil: string
}

interface SupportAccessGrantSummaryRow extends Record<string, unknown> {
  supportGrantId: string
  supportAccountId: string
  supportAccountEmail: string
  kind: 'support' | 'break_glass'
  status: string
  scopeType: SupportAccessScopeType
  educationOrganizationId: string | null
  schoolId: string | null
  allowedCapabilities: SupportAccessCapability[]
  purpose: SupportAccessPurpose
  ticketReference: string
  authorizationReason: string
  validFrom: Date | string
  validUntil: Date | string
  openedAt: Date | string | null
  closedAt: Date | string | null
  closeReason: string | null
  revokedAt: Date | string | null
  revocationReason: string | null
  reviewStatus: string
  reviewOutcome: SupportAccessReviewOutcome | null
  reviewNotes: string | null
  createdAt: Date | string
}

export interface SupportAccessGrantSummary {
  supportGrantId: string
  supportAccountId: string
  supportAccountEmail: string
  kind: 'support' | 'break_glass'
  status: string
  scopeType: SupportAccessScopeType
  educationOrganizationId: string | null
  schoolId: string | null
  allowedCapabilities: readonly SupportAccessCapability[]
  purpose: SupportAccessPurpose
  ticketReference: string
  authorizationReason: string
  validFrom: string
  validUntil: string
  openedAt: string | null
  closedAt: string | null
  closeReason: string | null
  revokedAt: string | null
  revocationReason: string | null
  reviewStatus: string
  reviewOutcome: SupportAccessReviewOutcome | null
  reviewNotes: string | null
  createdAt: string
}

function instant(value: Date | string | undefined): string | undefined {
  if (value === undefined) return undefined
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error('Support Access returned an invalid instant')
  return parsed.toISOString()
}

function nullableInstant(value: Date | string | null): string | null {
  return value === null ? null : (instant(value) ?? null)
}

function effect(row: SupportAccessEffectRow | undefined): Readonly<SupportAccessEffect> {
  if (!row?.supportGrantId || !row.status || !row.notificationId || !row.auditEventId) {
    throw new Error('Support Access operation returned incomplete evidence')
  }
  const occurredAt = instant(row.occurredAt)
  const validUntil = instant(row.validUntil)
  return Object.freeze({
    supportGrantId: row.supportGrantId,
    status: row.status,
    notificationId: row.notificationId,
    auditEventId: row.auditEventId,
    ...(occurredAt ? { occurredAt } : {}),
    ...(row.tenantId ? { tenantId: row.tenantId } : {}),
    ...(validUntil ? { validUntil } : {}),
    ...(row.reviewStatus ? { reviewStatus: row.reviewStatus } : {}),
  })
}

export async function issueSupportAccessGrant(
  transaction: DatabaseTransaction,
  input: IssueSupportAccessGrantInput
): Promise<Readonly<SupportAccessEffect>> {
  const rows = await transaction.execute<SupportAccessEffectRow>(sql`
    select
      support_grant_id as "supportGrantId",
      tenant_id as "tenantId",
      status,
      valid_until as "validUntil",
      notification_id as "notificationId",
      audit_event_id as "auditEventId"
    from openschool_private.issue_support_access_grant(
      ${input.supportAccountId}::uuid,
      ${input.scopeType},
      ${input.educationOrganizationId ?? null}::uuid,
      ${input.schoolId ?? null}::uuid,
      ${JSON.stringify(input.allowedCapabilities)}::jsonb,
      ${input.purpose},
      ${input.ticketReference},
      ${input.authorizationReason},
      ${input.validUntil}::timestamptz
    )
  `)
  return effect(rows[0])
}

export async function revokeSupportAccessGrant(
  transaction: DatabaseTransaction,
  supportGrantId: string,
  reason: string
): Promise<Readonly<SupportAccessEffect>> {
  const rows = await transaction.execute<SupportAccessEffectRow>(sql`
    select
      support_grant_id as "supportGrantId",
      status,
      notification_id as "notificationId",
      audit_event_id as "auditEventId",
      occurred_at as "occurredAt"
    from openschool_private.revoke_support_access_grant(
      ${supportGrantId}::uuid,
      ${reason}
    )
  `)
  return effect(rows[0])
}

export async function reviewSupportAccessGrant(
  transaction: DatabaseTransaction,
  supportGrantId: string,
  outcome: SupportAccessReviewOutcome,
  notes: string
): Promise<Readonly<SupportAccessEffect>> {
  const rows = await transaction.execute<SupportAccessEffectRow>(sql`
    select
      support_grant_id as "supportGrantId",
      review_status as "reviewStatus",
      review_status as status,
      notification_id as "notificationId",
      audit_event_id as "auditEventId",
      occurred_at as "occurredAt"
    from openschool_private.review_support_access_grant(
      ${supportGrantId}::uuid,
      ${outcome},
      ${notes}
    )
  `)
  return effect(rows[0])
}

export async function openBreakGlassAccess(
  transaction: DatabaseTransaction,
  input: OpenBreakGlassAccessInput
): Promise<Readonly<SupportAccessEffect>> {
  const rows = await transaction.execute<SupportAccessEffectRow>(sql`
    select
      support_grant_id as "supportGrantId",
      tenant_id as "tenantId",
      status,
      valid_until as "validUntil",
      notification_id as "notificationId",
      audit_event_id as "auditEventId"
    from openschool_private.open_break_glass_access(
      ${input.tenantId}::uuid,
      ${input.scopeType},
      ${input.educationOrganizationId ?? null}::uuid,
      ${input.schoolId ?? null}::uuid,
      ${JSON.stringify(input.allowedCapabilities)}::jsonb,
      ${input.ticketReference},
      ${input.emergencyRuleReference},
      ${input.authorizationReason},
      ${input.validUntil}::timestamptz
    )
  `)
  return effect(rows[0])
}

export async function expireSupportAccessGrant(
  transaction: DatabaseTransaction,
  supportGrantId: string
): Promise<Readonly<SupportAccessEffect>> {
  const rows = await transaction.execute<SupportAccessEffectRow>(sql`
    select
      support_grant_id as "supportGrantId",
      status,
      notification_id as "notificationId",
      audit_event_id as "auditEventId",
      occurred_at as "occurredAt"
    from openschool_private.expire_support_access_grant(${supportGrantId}::uuid)
  `)
  return effect(rows[0])
}

export async function closeSupportAccess(
  transaction: DatabaseTransaction,
  tenantId: string,
  supportGrantId: string,
  reason: string
): Promise<Readonly<SupportAccessEffect>> {
  const rows = await transaction.execute<SupportAccessEffectRow>(sql`
    select
      support_grant_id as "supportGrantId",
      status,
      notification_id as "notificationId",
      audit_event_id as "auditEventId",
      occurred_at as "occurredAt"
    from openschool_private.close_support_access(
      ${tenantId}::uuid,
      ${supportGrantId}::uuid,
      ${reason}
    )
  `)
  return effect(rows[0])
}

export async function listSupportAccessGrants(
  transaction: DatabaseTransaction,
  limit = 50
): Promise<readonly Readonly<SupportAccessGrantSummary>[]> {
  const rows = await transaction.execute<SupportAccessGrantSummaryRow>(sql`
    select
      support_grant_id as "supportGrantId",
      support_account_id as "supportAccountId",
      support_account_email as "supportAccountEmail",
      kind,
      status,
      scope_type as "scopeType",
      education_organization_id as "educationOrganizationId",
      school_id as "schoolId",
      allowed_capabilities as "allowedCapabilities",
      purpose,
      ticket_reference as "ticketReference",
      authorization_reason as "authorizationReason",
      valid_from as "validFrom",
      valid_until as "validUntil",
      opened_at as "openedAt",
      closed_at as "closedAt",
      close_reason as "closeReason",
      revoked_at as "revokedAt",
      revocation_reason as "revocationReason",
      review_status as "reviewStatus",
      review_outcome as "reviewOutcome",
      review_notes as "reviewNotes",
      created_at as "createdAt"
    from openschool_private.list_support_access_grants(${limit})
  `)
  return Object.freeze(
    rows.map((row) =>
      Object.freeze({
        supportGrantId: row.supportGrantId,
        supportAccountId: row.supportAccountId,
        supportAccountEmail: row.supportAccountEmail,
        kind: row.kind,
        status: row.status,
        scopeType: row.scopeType,
        educationOrganizationId: row.educationOrganizationId,
        schoolId: row.schoolId,
        allowedCapabilities: Object.freeze([...row.allowedCapabilities]),
        purpose: row.purpose,
        ticketReference: row.ticketReference,
        authorizationReason: row.authorizationReason,
        validFrom: instant(row.validFrom) as string,
        validUntil: instant(row.validUntil) as string,
        openedAt: nullableInstant(row.openedAt),
        closedAt: nullableInstant(row.closedAt),
        closeReason: row.closeReason,
        revokedAt: nullableInstant(row.revokedAt),
        revocationReason: row.revocationReason,
        reviewStatus: row.reviewStatus,
        reviewOutcome: row.reviewOutcome,
        reviewNotes: row.reviewNotes,
        createdAt: instant(row.createdAt) as string,
      })
    )
  )
}
