import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
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

const householdReadPolicy = (tenantId: unknown, householdId: unknown) => sql`
  ${tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '')
    IN ('tenant.households.read', 'tenant.households.manage')
  AND public.openschool_household_read_scope_allows(${tenantId}, ${householdId})
`

const householdManagerPolicy = (tenantId: unknown, householdId: unknown) => sql`
  session_user = 'openschool_runtime'
  AND current_user = 'openschool_household_manager'
  AND ${tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
  AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.households.manage'
  AND public.openschool_household_manage_scope_allows(${tenantId}, ${householdId})
`

export const households = pgTable(
  'households',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    displayName: text('display_name').notNull(),
    normalizedDisplayName: text('normalized_display_name').notNull(),
    status: text('status', { enum: ['active', 'closed'] })
      .default('active')
      .notNull(),
    version: bigint('version', { mode: 'number' }).default(1).notNull(),
    createdByAccountId: uuid('created_by_account_id')
      .references(() => accounts.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    creationReason: text('creation_reason').notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedByAccountId: uuid('closed_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    closureReason: text('closure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('households_tenant_id_id_unique').on(table.tenantId, table.id),
    index('households_tenant_status_name_idx').on(
      table.tenantId,
      table.status,
      table.normalizedDisplayName,
      table.id
    ),
    check(
      'households_name_check',
      sql`char_length(btrim(${table.displayName})) BETWEEN 1 AND 160 AND char_length(btrim(${table.normalizedDisplayName})) BETWEEN 1 AND 160`
    ),
    check('households_status_check', sql`${table.status} IN ('active', 'closed')`),
    check('households_version_positive', sql`${table.version} > 0`),
    check(
      'households_creation_reason_check',
      sql`char_length(btrim(${table.creationReason})) BETWEEN 3 AND 512`
    ),
    check(
      'households_closure_evidence_check',
      sql`${table.status} <> 'closed' OR (${table.closedAt} IS NOT NULL AND ${table.closedByAccountId} IS NOT NULL AND char_length(btrim(${table.closureReason})) BETWEEN 3 AND 512)`
    ),
    pgPolicy('households_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: householdReadPolicy(table.tenantId, table.id),
    }),
    pgPolicy('households_runtime_insert_deny', {
      for: 'insert',
      to: 'openschool_runtime',
      withCheck: sql`false`,
    }),
    pgPolicy('households_runtime_update_deny', {
      for: 'update',
      to: 'openschool_runtime',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('households_runtime_delete_deny', {
      for: 'delete',
      to: 'openschool_runtime',
      using: sql`false`,
    }),
    pgPolicy('households_manager_select', {
      for: 'select',
      to: 'openschool_household_manager',
      using: householdManagerPolicy(table.tenantId, table.id),
    }),
    pgPolicy('households_manager_insert', {
      for: 'insert',
      to: 'openschool_household_manager',
      withCheck: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_household_manager'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.households.manage'
      `,
    }),
    pgPolicy('households_manager_update', {
      for: 'update',
      to: 'openschool_household_manager',
      using: householdManagerPolicy(table.tenantId, table.id),
      withCheck: householdManagerPolicy(table.tenantId, table.id),
    }),
    pgPolicy('households_manager_delete_deny', {
      for: 'delete',
      to: 'openschool_household_manager',
      using: sql`false`,
    }),
  ]
).enableRLS()

export const householdAddresses = pgTable(
  'household_addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    householdId: uuid('household_id').notNull(),
    addressKey: uuid('address_key').notNull(),
    version: integer('version').default(1).notNull(),
    addressType: text('address_type', {
      enum: ['residential', 'mailing', 'temporary', 'other'],
    }).notNull(),
    label: text('label'),
    line1: text('line1').notNull(),
    line2: text('line2'),
    locality: text('locality').notNull(),
    administrativeArea: text('administrative_area'),
    postalCode: text('postal_code'),
    countryCode: text('country_code').notNull(),
    normalizedAddress: text('normalized_address').notNull(),
    deliveryInstructions: text('delivery_instructions'),
    isPrimary: boolean('is_primary').default(false).notNull(),
    status: text('status', { enum: ['active', 'ended'] })
      .default('active')
      .notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    issuedByAccountId: uuid('issued_by_account_id')
      .references(() => accounts.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    issuanceReason: text('issuance_reason').notNull(),
    endedByAccountId: uuid('ended_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    endReason: text('end_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('household_addresses_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('household_addresses_tenant_key_version_unique').on(
      table.tenantId,
      table.addressKey,
      table.version
    ),
    foreignKey({
      name: 'household_addresses_tenant_household_fk',
      columns: [table.tenantId, table.householdId],
      foreignColumns: [households.tenantId, households.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('household_addresses_household_effective_idx').on(
      table.tenantId,
      table.householdId,
      table.status,
      table.validFrom,
      table.validUntil,
      table.id
    ),
    check(
      'household_addresses_type_check',
      sql`${table.addressType} IN ('residential', 'mailing', 'temporary', 'other')`
    ),
    check('household_addresses_country_code_check', sql`${table.countryCode} ~ '^[A-Z]{2}$'`),
    check(
      'household_addresses_required_text_check',
      sql`char_length(btrim(${table.line1})) BETWEEN 1 AND 200 AND char_length(btrim(${table.locality})) BETWEEN 1 AND 120 AND char_length(btrim(${table.normalizedAddress})) BETWEEN 3 AND 600`
    ),
    check(
      'household_addresses_valid_period_check',
      sql`${table.validUntil} IS NULL OR ${table.validUntil} > ${table.validFrom}`
    ),
    check(
      'household_addresses_end_evidence_check',
      sql`${table.status} <> 'ended' OR (${table.validUntil} IS NOT NULL AND ${table.endedByAccountId} IS NOT NULL AND char_length(btrim(${table.endReason})) BETWEEN 3 AND 512)`
    ),
    check('household_addresses_version_positive', sql`${table.version} > 0`),
    pgPolicy('household_addresses_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: householdReadPolicy(table.tenantId, table.householdId),
    }),
    pgPolicy('household_addresses_runtime_insert_deny', {
      for: 'insert',
      to: 'openschool_runtime',
      withCheck: sql`false`,
    }),
    pgPolicy('household_addresses_runtime_update_deny', {
      for: 'update',
      to: 'openschool_runtime',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('household_addresses_runtime_delete_deny', {
      for: 'delete',
      to: 'openschool_runtime',
      using: sql`false`,
    }),
    pgPolicy('household_addresses_manager_select', {
      for: 'select',
      to: 'openschool_household_manager',
      using: householdManagerPolicy(table.tenantId, table.householdId),
    }),
    pgPolicy('household_addresses_manager_insert', {
      for: 'insert',
      to: 'openschool_household_manager',
      withCheck: householdManagerPolicy(table.tenantId, table.householdId),
    }),
    pgPolicy('household_addresses_manager_update', {
      for: 'update',
      to: 'openschool_household_manager',
      using: householdManagerPolicy(table.tenantId, table.householdId),
      withCheck: householdManagerPolicy(table.tenantId, table.householdId),
    }),
    pgPolicy('household_addresses_manager_delete_deny', {
      for: 'delete',
      to: 'openschool_household_manager',
      using: sql`false`,
    }),
  ]
).enableRLS()

export const householdMemberships = pgTable(
  'household_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    householdId: uuid('household_id').notNull(),
    personId: uuid('person_id').notNull(),
    membershipKey: uuid('membership_key').notNull(),
    version: integer('version').default(1).notNull(),
    membershipKind: text('membership_kind', { enum: ['resident', 'associated'] }).notNull(),
    isPrimaryResidence: boolean('is_primary_residence').default(false).notNull(),
    isPrimaryMailing: boolean('is_primary_mailing').default(false).notNull(),
    status: text('status', { enum: ['active', 'ended'] })
      .default('active')
      .notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    issuedByAccountId: uuid('issued_by_account_id')
      .references(() => accounts.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    issuanceReason: text('issuance_reason').notNull(),
    endedByAccountId: uuid('ended_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    endReason: text('end_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('household_memberships_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('household_memberships_tenant_key_version_unique').on(
      table.tenantId,
      table.membershipKey,
      table.version
    ),
    foreignKey({
      name: 'household_memberships_tenant_household_fk',
      columns: [table.tenantId, table.householdId],
      foreignColumns: [households.tenantId, households.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'household_memberships_tenant_person_fk',
      columns: [table.tenantId, table.personId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('household_memberships_household_effective_idx').on(
      table.tenantId,
      table.householdId,
      table.status,
      table.validFrom,
      table.validUntil,
      table.id
    ),
    index('household_memberships_person_effective_idx').on(
      table.tenantId,
      table.personId,
      table.status,
      table.validFrom,
      table.validUntil,
      table.id
    ),
    check(
      'household_memberships_kind_check',
      sql`${table.membershipKind} IN ('resident', 'associated')`
    ),
    check(
      'household_memberships_primary_requires_resident',
      sql`(NOT ${table.isPrimaryResidence} AND NOT ${table.isPrimaryMailing}) OR ${table.membershipKind} = 'resident'`
    ),
    check(
      'household_memberships_valid_period_check',
      sql`${table.validUntil} IS NULL OR ${table.validUntil} > ${table.validFrom}`
    ),
    check(
      'household_memberships_end_evidence_check',
      sql`${table.status} <> 'ended' OR (${table.validUntil} IS NOT NULL AND ${table.endedByAccountId} IS NOT NULL AND char_length(btrim(${table.endReason})) BETWEEN 3 AND 512)`
    ),
    check('household_memberships_version_positive', sql`${table.version} > 0`),
    pgPolicy('household_memberships_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '')
          IN ('tenant.households.read', 'tenant.households.manage')
        AND public.openschool_household_member_read_scope_allows(
          ${table.tenantId}, ${table.householdId}, ${table.personId}
        )
      `,
    }),
    pgPolicy('household_memberships_runtime_insert_deny', {
      for: 'insert',
      to: 'openschool_runtime',
      withCheck: sql`false`,
    }),
    pgPolicy('household_memberships_runtime_update_deny', {
      for: 'update',
      to: 'openschool_runtime',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('household_memberships_runtime_delete_deny', {
      for: 'delete',
      to: 'openschool_runtime',
      using: sql`false`,
    }),
    pgPolicy('household_memberships_manager_select', {
      for: 'select',
      to: 'openschool_household_manager',
      using: sql`
        ${householdManagerPolicy(table.tenantId, table.householdId)}
        AND public.openschool_household_person_manage_scope_allows(
          ${table.tenantId}, ${table.personId}
        )
      `,
    }),
    pgPolicy('household_memberships_manager_insert', {
      for: 'insert',
      to: 'openschool_household_manager',
      withCheck: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_household_manager'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.households.manage'
        AND public.openschool_household_person_manage_scope_allows(
          ${table.tenantId}, ${table.personId}
        )
      `,
    }),
    pgPolicy('household_memberships_manager_update', {
      for: 'update',
      to: 'openschool_household_manager',
      using: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_household_manager'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.households.manage'
        AND public.openschool_household_person_manage_scope_allows(
          ${table.tenantId}, ${table.personId}
        )
      `,
      withCheck: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_household_manager'
        AND ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.households.manage'
        AND public.openschool_household_person_manage_scope_allows(
          ${table.tenantId}, ${table.personId}
        )
      `,
    }),
    pgPolicy('household_memberships_manager_delete_deny', {
      for: 'delete',
      to: 'openschool_household_manager',
      using: sql`false`,
    }),
  ]
).enableRLS()

export type Household = typeof households.$inferSelect
export type HouseholdAddress = typeof householdAddresses.$inferSelect
export type HouseholdMembership = typeof householdMemberships.$inferSelect
