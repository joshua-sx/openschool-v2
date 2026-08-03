import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { educationOrganizations } from './education-organizations'
import { accountSessions, accounts, people } from './identity'
import { platformAccessGrants } from './platform'
import { schools } from './schools'
import { tenants } from './tenancy'

export const SUPPORT_ACCESS_KINDS = ['support', 'break_glass'] as const
export const SUPPORT_ACCESS_STATUSES = [
  'approved',
  'active',
  'closed',
  'revoked',
  'expired',
] as const
export const SUPPORT_ACCESS_SCOPE_TYPES = ['tenant', 'organization_subtree', 'school'] as const
export const SUPPORT_ACCESS_PURPOSES = ['customer_support', 'incident_response'] as const
export const SUPPORT_ACCESS_CAPABILITIES = [
  'support.schools.read',
  'support.students.read',
] as const
export const SUPPORT_ACCESS_REVIEW_STATUSES = ['not_due', 'pending', 'completed'] as const
export const SUPPORT_ACCESS_REVIEW_OUTCOMES = [
  'confirmed',
  'no_impact',
  'control_gap',
  'incident',
] as const

export type SupportAccessKind = (typeof SUPPORT_ACCESS_KINDS)[number]
export type SupportAccessStatus = (typeof SUPPORT_ACCESS_STATUSES)[number]
export type SupportAccessScopeType = (typeof SUPPORT_ACCESS_SCOPE_TYPES)[number]
export type SupportAccessPurpose = (typeof SUPPORT_ACCESS_PURPOSES)[number]
export type SupportAccessCapability = (typeof SUPPORT_ACCESS_CAPABILITIES)[number]
export type SupportAccessReviewStatus = (typeof SUPPORT_ACCESS_REVIEW_STATUSES)[number]
export type SupportAccessReviewOutcome = (typeof SUPPORT_ACCESS_REVIEW_OUTCOMES)[number]

/**
 * One single-use, purpose-bound authorization for a platform support Account to
 * enter exactly one Tenant scope. The grant is not a Tenant Affiliation.
 */
export const supportAccessGrants = pgTable(
  'support_access_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    supportAccountId: uuid('support_account_id')
      .references(() => accounts.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    platformAccessGrantId: uuid('platform_access_grant_id')
      .references(() => platformAccessGrants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    kind: text('kind', { enum: SUPPORT_ACCESS_KINDS }).notNull(),
    status: text('status', { enum: SUPPORT_ACCESS_STATUSES }).default('approved').notNull(),
    scopeType: text('scope_type', { enum: SUPPORT_ACCESS_SCOPE_TYPES }).notNull(),
    educationOrganizationId: uuid('education_organization_id'),
    schoolId: uuid('school_id'),
    allowedCapabilities: jsonb('allowed_capabilities').$type<SupportAccessCapability[]>().notNull(),
    purpose: text('purpose', { enum: SUPPORT_ACCESS_PURPOSES }).notNull(),
    ticketReference: text('ticket_reference').notNull(),
    emergencyRuleReference: text('emergency_rule_reference'),
    authorizedByAccountId: uuid('authorized_by_account_id')
      .references(() => accounts.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    authorizedByPersonId: uuid('authorized_by_person_id'),
    authorizationReason: text('authorization_reason').notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).defaultNow().notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
    boundAccountSessionId: uuid('bound_account_session_id').references(() => accountSessions.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedByAccountId: uuid('closed_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    closedByPersonId: uuid('closed_by_person_id'),
    closeReason: text('close_reason'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByAccountId: uuid('revoked_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    revokedByPersonId: uuid('revoked_by_person_id'),
    revocationReason: text('revocation_reason'),
    reviewStatus: text('review_status', { enum: SUPPORT_ACCESS_REVIEW_STATUSES })
      .default('not_due')
      .notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedByAccountId: uuid('reviewed_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    reviewedByPersonId: uuid('reviewed_by_person_id'),
    reviewOutcome: text('review_outcome', { enum: SUPPORT_ACCESS_REVIEW_OUTCOMES }),
    reviewNotes: text('review_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('support_access_grants_tenant_id_id_unique').on(table.tenantId, table.id),
    foreignKey({
      name: 'support_access_grants_tenant_organization_fk',
      columns: [table.tenantId, table.educationOrganizationId],
      foreignColumns: [educationOrganizations.tenantId, educationOrganizations.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'support_access_grants_tenant_school_fk',
      columns: [table.tenantId, table.schoolId],
      foreignColumns: [schools.tenantId, schools.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'support_access_grants_tenant_authorizer_person_fk',
      columns: [table.tenantId, table.authorizedByPersonId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'support_access_grants_tenant_closer_person_fk',
      columns: [table.tenantId, table.closedByPersonId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'support_access_grants_tenant_revoker_person_fk',
      columns: [table.tenantId, table.revokedByPersonId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'support_access_grants_tenant_reviewer_person_fk',
      columns: [table.tenantId, table.reviewedByPersonId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('support_access_grants_resolve_idx').on(
      table.tenantId,
      table.supportAccountId,
      table.status,
      table.validUntil,
      table.id
    ),
    index('support_access_grants_review_idx').on(
      table.tenantId,
      table.reviewStatus,
      table.updatedAt,
      table.id
    ),
    check('support_access_grants_kind_check', sql`${table.kind} IN ('support', 'break_glass')`),
    check(
      'support_access_grants_status_check',
      sql`${table.status} IN ('approved', 'active', 'closed', 'revoked', 'expired')`
    ),
    check(
      'support_access_grants_scope_check',
      sql`(${table.scopeType} = 'tenant' AND ${table.educationOrganizationId} IS NULL AND ${table.schoolId} IS NULL)
          OR (${table.scopeType} = 'organization_subtree' AND ${table.educationOrganizationId} IS NOT NULL AND ${table.schoolId} IS NULL)
          OR (${table.scopeType} = 'school' AND ${table.educationOrganizationId} IS NULL AND ${table.schoolId} IS NOT NULL)`
    ),
    check(
      'support_access_grants_capabilities_check',
      sql`jsonb_typeof(${table.allowedCapabilities}) = 'array'
          AND jsonb_array_length(${table.allowedCapabilities}) BETWEEN 1 AND 2
          AND ${table.allowedCapabilities} <@ '["support.schools.read", "support.students.read"]'::jsonb
          AND (jsonb_array_length(${table.allowedCapabilities}) = 1
            OR (${table.allowedCapabilities} ? 'support.schools.read'
              AND ${table.allowedCapabilities} ? 'support.students.read'))`
    ),
    check(
      'support_access_grants_purpose_check',
      sql`${table.purpose} IN ('customer_support', 'incident_response')
          AND (${table.kind} <> 'break_glass' OR ${table.purpose} = 'incident_response')`
    ),
    check(
      'support_access_grants_reference_check',
      sql`char_length(btrim(${table.ticketReference})) BETWEEN 3 AND 128
          AND char_length(btrim(${table.authorizationReason})) BETWEEN 3 AND 512
          AND (${table.emergencyRuleReference} IS NULL OR char_length(btrim(${table.emergencyRuleReference})) BETWEEN 3 AND 128)
          AND (${table.closeReason} IS NULL OR char_length(btrim(${table.closeReason})) BETWEEN 3 AND 512)
          AND (${table.revocationReason} IS NULL OR char_length(btrim(${table.revocationReason})) BETWEEN 3 AND 512)
          AND (${table.reviewNotes} IS NULL OR char_length(btrim(${table.reviewNotes})) BETWEEN 3 AND 2048)`
    ),
    check(
      'support_access_grants_authorizer_check',
      sql`(${table.kind} = 'support' AND ${table.authorizedByPersonId} IS NOT NULL AND ${table.emergencyRuleReference} IS NULL)
          OR (${table.kind} = 'break_glass' AND ${table.authorizedByPersonId} IS NULL AND ${table.emergencyRuleReference} IS NOT NULL)`
    ),
    check(
      'support_access_grants_period_check',
      sql`${table.validUntil} > ${table.validFrom}
          AND ((${table.kind} = 'support' AND ${table.validUntil} <= ${table.validFrom} + interval '8 hours')
            OR (${table.kind} = 'break_glass' AND ${table.validUntil} <= ${table.validFrom} + interval '30 minutes'))`
    ),
    check(
      'support_access_grants_state_evidence_check',
      sql`(${table.status} = 'approved' AND ${table.boundAccountSessionId} IS NULL AND ${table.openedAt} IS NULL AND ${table.closedAt} IS NULL AND ${table.closedByAccountId} IS NULL AND ${table.closedByPersonId} IS NULL AND ${table.closeReason} IS NULL AND ${table.revokedAt} IS NULL AND ${table.reviewStatus} = 'not_due')
          OR (${table.status} = 'active' AND ${table.boundAccountSessionId} IS NOT NULL AND ${table.openedAt} IS NOT NULL AND ${table.closedAt} IS NULL AND ${table.revokedAt} IS NULL AND ${table.reviewStatus} = 'not_due')
          OR (${table.status} IN ('closed', 'expired') AND ${table.revokedAt} IS NULL AND ${table.closedAt} IS NOT NULL AND ${table.closeReason} IS NOT NULL AND ${table.reviewStatus} IN ('pending', 'completed'))
          OR (${table.status} = 'revoked' AND ${table.revokedAt} IS NOT NULL AND ${table.revokedByAccountId} IS NOT NULL AND ${table.revokedByPersonId} IS NOT NULL AND ${table.revocationReason} IS NOT NULL AND ${table.reviewStatus} IN ('pending', 'completed'))`
    ),
    check(
      'support_access_grants_review_evidence_check',
      sql`(${table.reviewStatus} IN ('not_due', 'pending') AND ${table.reviewedAt} IS NULL AND ${table.reviewedByAccountId} IS NULL AND ${table.reviewedByPersonId} IS NULL AND ${table.reviewOutcome} IS NULL AND ${table.reviewNotes} IS NULL)
          OR (${table.reviewStatus} = 'completed' AND ${table.reviewedAt} IS NOT NULL AND ${table.reviewedByAccountId} IS NOT NULL AND ${table.reviewedByPersonId} IS NOT NULL AND ${table.reviewOutcome} IN ('confirmed', 'no_impact', 'control_gap', 'incident') AND ${table.reviewNotes} IS NOT NULL)`
    ),
    pgPolicy('support_access_grants_manager_select', {
      for: 'select',
      to: 'openschool_support_grant_manager',
      using: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid`,
    }),
    pgPolicy('support_access_grants_manager_insert', {
      for: 'insert',
      to: 'openschool_support_grant_manager',
      withCheck: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid`,
    }),
    pgPolicy('support_access_grants_manager_update', {
      for: 'update',
      to: 'openschool_support_grant_manager',
      using: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid`,
      withCheck: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid`,
    }),
    pgPolicy('support_access_grants_resolver_select', {
      for: 'select',
      to: 'openschool_support_access_resolver',
      using: sql`${table.id} = nullif(current_setting('app.support_grant_id', true), '')::uuid`,
    }),
    pgPolicy('support_access_grants_resolver_update', {
      for: 'update',
      to: 'openschool_support_access_resolver',
      using: sql`${table.id} = nullif(current_setting('app.support_grant_id', true), '')::uuid`,
      withCheck: sql`${table.id} = nullif(current_setting('app.support_grant_id', true), '')::uuid`,
    }),
    pgPolicy('support_access_grants_worker_select', {
      for: 'select',
      to: 'openschool_worker',
      using: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.job_type', true), '') = 'support_access_expiry'`,
    }),
    pgPolicy('support_access_grants_worker_update', {
      for: 'update',
      to: 'openschool_worker',
      using: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.job_type', true), '') = 'support_access_expiry'`,
      withCheck: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.job_type', true), '') = 'support_access_expiry'`,
    }),
  ]
).enableRLS()

export const SUPPORT_ACCESS_NOTIFICATION_EVENTS = [
  'approved',
  'opened',
  'used',
  'closed',
  'revoked',
  'expired',
  'reviewed',
  'break_glass_opened',
] as const

export const supportAccessNotifications = pgTable(
  'support_access_notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    supportGrantId: uuid('support_grant_id').notNull(),
    operationId: uuid('operation_id').notNull(),
    event: text('event', { enum: SUPPORT_ACCESS_NOTIFICATION_EVENTS }).notNull(),
    actorAccountId: uuid('actor_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    audience: text('audience', { enum: ['tenant_security_admins'] })
      .default('tenant_security_admins')
      .notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('support_access_notifications_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('support_access_notifications_operation_unique').on(
      table.tenantId,
      table.supportGrantId,
      table.event,
      table.operationId
    ),
    foreignKey({
      name: 'support_access_notifications_grant_fk',
      columns: [table.tenantId, table.supportGrantId],
      foreignColumns: [supportAccessGrants.tenantId, supportAccessGrants.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('support_access_notifications_tenant_time_idx').on(
      table.tenantId,
      table.occurredAt,
      table.id
    ),
    check(
      'support_access_notifications_event_check',
      sql`${table.event} IN ('approved', 'opened', 'used', 'closed', 'revoked', 'expired', 'reviewed', 'break_glass_opened')`
    ),
    check(
      'support_access_notifications_audience_check',
      sql`${table.audience} = 'tenant_security_admins'`
    ),
    pgPolicy('support_access_notifications_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.support.grants.manage'`,
    }),
    pgPolicy('support_access_notifications_manager_insert', {
      for: 'insert',
      to: 'openschool_support_grant_manager',
      withCheck: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid`,
    }),
    pgPolicy('support_access_notifications_resolver_insert', {
      for: 'insert',
      to: 'openschool_support_access_resolver',
      withCheck: sql`${table.supportGrantId} = nullif(current_setting('app.support_grant_id', true), '')::uuid`,
    }),
    pgPolicy('support_access_notifications_worker_insert', {
      for: 'insert',
      to: 'openschool_worker',
      withCheck: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.job_type', true), '') = 'support_access_expiry'`,
    }),
    pgPolicy('support_access_notifications_worker_select', {
      for: 'select',
      to: 'openschool_worker',
      using: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.job_type', true), '') = 'support_notification_delivery'`,
    }),
  ]
).enableRLS()

export const SUPPORT_NOTIFICATION_OUTBOX_STATUSES = [
  'pending',
  'processing',
  'delivered',
  'failed',
  'dead_letter',
] as const

export const supportNotificationOutbox = pgTable(
  'support_notification_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    notificationId: uuid('notification_id').notNull(),
    status: text('status', { enum: SUPPORT_NOTIFICATION_OUTBOX_STATUSES })
      .default('pending')
      .notNull(),
    attemptCount: integer('attempt_count').default(0).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true }).defaultNow().notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('support_notification_outbox_notification_unique').on(
      table.tenantId,
      table.notificationId
    ),
    foreignKey({
      name: 'support_notification_outbox_notification_fk',
      columns: [table.tenantId, table.notificationId],
      foreignColumns: [supportAccessNotifications.tenantId, supportAccessNotifications.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('support_notification_outbox_claim_idx').on(
      table.tenantId,
      table.status,
      table.availableAt,
      table.id
    ),
    check('support_notification_outbox_attempt_check', sql`${table.attemptCount} >= 0`),
    check(
      'support_notification_outbox_status_check',
      sql`${table.status} IN ('pending', 'processing', 'delivered', 'failed', 'dead_letter')`
    ),
    check(
      'support_notification_outbox_state_check',
      sql`(${table.status} = 'pending' AND ${table.attemptCount} = 0 AND ${table.lockedAt} IS NULL AND ${table.deliveredAt} IS NULL AND ${table.lastErrorCode} IS NULL)
          OR (${table.status} = 'processing' AND ${table.attemptCount} > 0 AND ${table.lockedAt} IS NOT NULL AND ${table.deliveredAt} IS NULL AND ${table.lastErrorCode} IS NULL)
          OR (${table.status} = 'delivered' AND ${table.attemptCount} > 0 AND ${table.lockedAt} IS NULL AND ${table.deliveredAt} IS NOT NULL AND ${table.lastErrorCode} IS NULL)
          OR (${table.status} IN ('failed', 'dead_letter') AND ${table.attemptCount} > 0 AND ${table.lockedAt} IS NULL AND ${table.deliveredAt} IS NULL AND ${table.lastErrorCode} ~ '^[A-Z][A-Z0-9_]{2,63}$')`
    ),
    pgPolicy('support_notification_outbox_manager_insert', {
      for: 'insert',
      to: 'openschool_support_grant_manager',
      withCheck: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid`,
    }),
    pgPolicy('support_notification_outbox_resolver_insert', {
      for: 'insert',
      to: 'openschool_support_access_resolver',
      withCheck: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.support_grant_id', true), '') IS NOT NULL`,
    }),
    pgPolicy('support_notification_outbox_worker_select', {
      for: 'select',
      to: 'openschool_worker',
      using: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.job_type', true), '') = 'support_notification_delivery'`,
    }),
    pgPolicy('support_notification_outbox_worker_update', {
      for: 'update',
      to: 'openschool_worker',
      using: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.job_type', true), '') = 'support_notification_delivery'`,
      withCheck: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.job_type', true), '') = 'support_notification_delivery'`,
    }),
  ]
).enableRLS()

export type SupportAccessGrant = typeof supportAccessGrants.$inferSelect
export type NewSupportAccessGrant = typeof supportAccessGrants.$inferInsert
export type SupportAccessNotification = typeof supportAccessNotifications.$inferSelect
export type SupportNotificationOutboxRecord = typeof supportNotificationOutbox.$inferSelect

/** Version anchor carried by invalidation without embedding grant details. */
export const SUPPORT_ACCESS_CONTEXT_VERSION = 1 satisfies number
export type SupportAccessContextVersion = typeof SUPPORT_ACCESS_CONTEXT_VERSION
