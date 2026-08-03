import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { accounts } from './identity'

export const PLATFORM_ROLE_TEMPLATE_KEYS = [
  'super_admin',
  'support_agent',
  'break_glass_operator',
] as const
export const PLATFORM_ACCESS_GRANT_STATUSES = ['active', 'revoked'] as const
export const PLATFORM_ACCESS_ISSUANCE_SOURCES = ['bootstrap', 'platform'] as const

export type PlatformRoleTemplateKey = (typeof PLATFORM_ROLE_TEMPLATE_KEYS)[number]
export type PlatformAccessGrantStatus = (typeof PLATFORM_ACCESS_GRANT_STATUSES)[number]
export type PlatformAccessIssuanceSource = (typeof PLATFORM_ACCESS_ISSUANCE_SOURCES)[number]

/**
 * Global platform authority is deliberately separate from Tenant People,
 * Affiliations, and role assignments. There are no application table grants;
 * reviewed SECURITY DEFINER functions are the only runtime access path.
 */
export const platformAccessGrants = pgTable(
  'platform_access_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .references(() => accounts.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    roleTemplateKey: text('role_template_key', { enum: PLATFORM_ROLE_TEMPLATE_KEYS }).notNull(),
    status: text('status', { enum: PLATFORM_ACCESS_GRANT_STATUSES }).default('active').notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).defaultNow().notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
    issuanceSource: text('issuance_source', {
      enum: PLATFORM_ACCESS_ISSUANCE_SOURCES,
    }).notNull(),
    issuedByAccountId: uuid('issued_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    issuanceReason: text('issuance_reason').notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByAccountId: uuid('revoked_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    revocationReason: text('revocation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('platform_access_grants_account_status_idx').on(
      table.accountId,
      table.status,
      table.validUntil,
      table.id
    ),
    check(
      'platform_access_grants_role_check',
      sql`${table.roleTemplateKey} IN ('super_admin', 'support_agent', 'break_glass_operator')`
    ),
    check('platform_access_grants_status_check', sql`${table.status} IN ('active', 'revoked')`),
    check(
      'platform_access_grants_issuance_source_check',
      sql`${table.issuanceSource} IN ('bootstrap', 'platform')`
    ),
    check(
      'platform_access_grants_period_check',
      sql`${table.validUntil} > ${table.validFrom} AND ${table.validUntil} <= ${table.validFrom} + interval '90 days'`
    ),
    check(
      'platform_access_grants_reason_check',
      sql`char_length(btrim(${table.issuanceReason})) BETWEEN 3 AND 512 AND (${table.revocationReason} IS NULL OR char_length(btrim(${table.revocationReason})) BETWEEN 3 AND 512)`
    ),
    check(
      'platform_access_grants_issuer_check',
      sql`(${table.issuanceSource} = 'bootstrap' AND ${table.issuedByAccountId} IS NULL) OR (${table.issuanceSource} = 'platform' AND ${table.issuedByAccountId} IS NOT NULL)`
    ),
    check(
      'platform_access_grants_revocation_check',
      sql`(${table.status} = 'active' AND ${table.revokedAt} IS NULL AND ${table.revokedByAccountId} IS NULL AND ${table.revocationReason} IS NULL) OR (${table.status} = 'revoked' AND ${table.revokedAt} IS NOT NULL AND ${table.revokedByAccountId} IS NOT NULL AND ${table.revocationReason} IS NOT NULL)`
    ),
  ]
)

export type PlatformAccessGrant = typeof platformAccessGrants.$inferSelect
export type NewPlatformAccessGrant = typeof platformAccessGrants.$inferInsert
