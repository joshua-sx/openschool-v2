import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { accounts, people } from './identity'
import { tenants } from './tenancy'

export const PROVIDER_SECURITY_RECONCILIATION_STATUSES = [
  'pending',
  'processing',
  'completed',
  'failed',
  'dead_letter',
] as const

export type ProviderSecurityReconciliationStatus =
  (typeof PROVIDER_SECURITY_RECONCILIATION_STATUSES)[number]

export const providerSecurityReconciliationOutbox = pgTable(
  'provider_security_reconciliation_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    accountId: uuid('account_id')
      .references(() => accounts.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    action: text('action', { enum: ['reset_mfa'] }).notNull(),
    expectedSecurityVersion: bigint('expected_security_version', { mode: 'number' }).notNull(),
    requestId: text('request_id').notNull(),
    actorAccountId: uuid('actor_account_id')
      .references(() => accounts.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    actorPersonId: uuid('actor_person_id').notNull(),
    status: text('status', { enum: PROVIDER_SECURITY_RECONCILIATION_STATUSES })
      .default('pending')
      .notNull(),
    attemptCount: integer('attempt_count').default(0).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true }).defaultNow().notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    deletedFactorCount: integer('deleted_factor_count'),
    lastErrorCode: text('last_error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('provider_security_reconciliation_effect_unique').on(
      table.tenantId,
      table.accountId,
      table.action,
      table.expectedSecurityVersion
    ),
    foreignKey({
      name: 'provider_security_reconciliation_actor_person_fk',
      columns: [table.tenantId, table.actorPersonId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('provider_security_reconciliation_claim_idx').on(
      table.tenantId,
      table.status,
      table.availableAt,
      table.id
    ),
    check('provider_security_reconciliation_action_check', sql`${table.action} = 'reset_mfa'`),
    check(
      'provider_security_reconciliation_version_check',
      sql`${table.expectedSecurityVersion} > 0`
    ),
    check(
      'provider_security_reconciliation_request_check',
      sql`char_length(${table.requestId}) BETWEEN 1 AND 512`
    ),
    check('provider_security_reconciliation_attempt_check', sql`${table.attemptCount} >= 0`),
    check(
      'provider_security_reconciliation_status_check',
      sql`${table.status} IN ('pending', 'processing', 'completed', 'failed', 'dead_letter')`
    ),
    check(
      'provider_security_reconciliation_status_evidence_check',
      sql`(${table.status} = 'pending' AND ${table.attemptCount} = 0 AND ${table.lockedAt} IS NULL AND ${table.completedAt} IS NULL AND ${table.deletedFactorCount} IS NULL AND ${table.lastErrorCode} IS NULL)
          OR (${table.status} = 'processing' AND ${table.attemptCount} > 0 AND ${table.lockedAt} IS NOT NULL AND ${table.completedAt} IS NULL AND ${table.deletedFactorCount} IS NULL AND ${table.lastErrorCode} IS NULL)
          OR (${table.status} = 'completed' AND ${table.attemptCount} > 0 AND ${table.lockedAt} IS NULL AND ${table.completedAt} IS NOT NULL AND ${table.deletedFactorCount} >= 0 AND ${table.lastErrorCode} IS NULL)
          OR (${table.status} = 'failed' AND ${table.attemptCount} > 0 AND ${table.lockedAt} IS NULL AND ${table.completedAt} IS NULL AND ${table.deletedFactorCount} IS NULL AND ${table.lastErrorCode} ~ '^[A-Z][A-Z0-9_]{2,63}$')
          OR (${table.status} = 'dead_letter' AND ${table.attemptCount} > 0 AND ${table.lockedAt} IS NULL AND ${table.completedAt} IS NULL AND ${table.deletedFactorCount} IS NULL AND ${table.lastErrorCode} ~ '^[A-Z][A-Z0-9_]{2,63}$')`
    ),
    pgPolicy('provider_security_reconciliation_revoker_insert', {
      for: 'insert',
      to: 'openschool_identity_revoker',
      withCheck: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_identity_revoker'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND ${table.actorAccountId} = nullif(current_setting('app.account_id', true), '')::uuid
        AND ${table.actorPersonId} = nullif(current_setting('app.person_id', true), '')::uuid
        AND ${table.requestId} = nullif(current_setting('app.request_id', true), '')
        AND EXISTS (
          SELECT 1 FROM public.accounts AS target_account
          WHERE target_account.id = ${table.accountId}
            AND target_account.security_version = ${table.expectedSecurityVersion}
        )
      `,
    }),
    pgPolicy('provider_security_reconciliation_worker_select', {
      for: 'select',
      to: 'openschool_worker',
      using: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.job_type', true), '') = 'provider_mfa_reconciliation'
        AND nullif(current_setting('app.job_id', true), '') IS NOT NULL
        AND nullif(current_setting('app.request_id', true), '') IS NOT NULL
      `,
    }),
    pgPolicy('provider_security_reconciliation_worker_update', {
      for: 'update',
      to: 'openschool_worker',
      using: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.job_type', true), '') = 'provider_mfa_reconciliation'
        AND nullif(current_setting('app.job_id', true), '') IS NOT NULL
        AND nullif(current_setting('app.request_id', true), '') IS NOT NULL
      `,
      withCheck: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.job_type', true), '') = 'provider_mfa_reconciliation'
        AND nullif(current_setting('app.job_id', true), '') IS NOT NULL
        AND nullif(current_setting('app.request_id', true), '') IS NOT NULL
      `,
    }),
    pgPolicy('provider_security_reconciliation_resolver_select', {
      for: 'select',
      to: 'openschool_provider_security_resolver',
      using: sql`
        session_user = 'openschool_worker'
        AND current_user = 'openschool_provider_security_resolver'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.job_type', true), '') = 'provider_mfa_reconciliation'
        AND nullif(current_setting('app.job_id', true), '') IS NOT NULL
        AND nullif(current_setting('app.request_id', true), '') IS NOT NULL
      `,
    }),
    pgPolicy('provider_security_reconciliation_identity_resolver_select', {
      for: 'select',
      to: 'openschool_provider_security_resolver',
      using: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_provider_security_resolver'
        AND EXISTS (
          SELECT 1 FROM public.accounts AS verified_account
          WHERE verified_account.id = ${table.accountId}
            AND verified_account.identity_provider = nullif(current_setting('app.identity_provider', true), '')
            AND verified_account.provider_subject = nullif(current_setting('app.provider_subject', true), '')
        )
      `,
    }),
  ]
).enableRLS()

export type ProviderSecurityReconciliationOutboxRecord =
  typeof providerSecurityReconciliationOutbox.$inferSelect
