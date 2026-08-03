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
import { classes } from './classes'
import { educationOrganizations } from './education-organizations'
import { accounts, people } from './identity'
import { schools } from './schools'
import { tenants } from './tenancy'

export const INVITATION_STATUSES = ['pending', 'accepted', 'cancelled', 'expired'] as const
export const INVITATION_DELIVERY_STATUSES = [
  'pending',
  'processing',
  'delivered',
  'failed',
  'dead_letter',
] as const

export type InvitationStatus = (typeof INVITATION_STATUSES)[number]
export type InvitationDeliveryStatus = (typeof INVITATION_DELIVERY_STATUSES)[number]

export const accountInvitations = pgTable(
  'account_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    personId: uuid('person_id').notNull(),
    intendedEmail: text('intended_email').notNull(),
    identityProvider: text('identity_provider').default('supabase').notNull(),
    intendedProviderSubject: text('intended_provider_subject'),
    tokenHash: text('token_hash').notNull(),
    tokenVersion: integer('token_version').default(1).notNull(),
    affiliationKind: text('affiliation_kind', {
      enum: ['student', 'guardian', 'employee', 'teacher', 'administrator', 'member'],
    }).notNull(),
    scopeType: text('scope_type', {
      enum: ['tenant', 'education_organization', 'school', 'class'],
    }).notNull(),
    educationOrganizationId: uuid('education_organization_id'),
    schoolId: uuid('school_id'),
    classId: uuid('class_id'),
    roleTemplateKeys: jsonb('role_template_keys').$type<string[]>().notNull(),
    affiliationValidUntil: timestamp('affiliation_valid_until', { withTimezone: true }),
    status: text('status', { enum: INVITATION_STATUSES }).default('pending').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    issuedByAccountId: uuid('issued_by_account_id')
      .references(() => accounts.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    issuanceReason: text('issuance_reason').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedByAccountId: uuid('accepted_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    acceptedProviderSubject: text('accepted_provider_subject'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledByAccountId: uuid('cancelled_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    cancellationReason: text('cancellation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('account_invitations_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('account_invitations_token_hash_unique').on(table.tokenHash),
    foreignKey({
      name: 'account_invitations_tenant_person_fk',
      columns: [table.tenantId, table.personId],
      foreignColumns: [people.tenantId, people.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'account_invitations_tenant_organization_fk',
      columns: [table.tenantId, table.educationOrganizationId],
      foreignColumns: [educationOrganizations.tenantId, educationOrganizations.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'account_invitations_tenant_school_fk',
      columns: [table.tenantId, table.schoolId],
      foreignColumns: [schools.tenantId, schools.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'account_invitations_tenant_class_fk',
      columns: [table.tenantId, table.classId],
      foreignColumns: [classes.tenantId, classes.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('account_invitations_tenant_status_expiry_idx').on(
      table.tenantId,
      table.status,
      table.expiresAt,
      table.id
    ),
    index('account_invitations_tenant_person_status_idx').on(
      table.tenantId,
      table.personId,
      table.status,
      table.id
    ),
    check(
      'account_invitations_email_normalized_check',
      sql`${table.intendedEmail} = lower(btrim(${table.intendedEmail})) AND char_length(${table.intendedEmail}) BETWEEN 3 AND 320 AND ${table.intendedEmail} ~ '^[^[:space:]@]+@[^[:space:]@]+$'`
    ),
    check(
      'account_invitations_identity_check',
      sql`char_length(${table.identityProvider}) BETWEEN 1 AND 128 AND (${table.intendedProviderSubject} IS NULL OR char_length(${table.intendedProviderSubject}) BETWEEN 1 AND 512)`
    ),
    check(
      'account_invitations_token_check',
      sql`${table.tokenVersion} = 1 AND ${table.tokenHash} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      'account_invitations_scope_check',
      sql`(${table.scopeType} = 'tenant' AND ${table.educationOrganizationId} IS NULL AND ${table.schoolId} IS NULL AND ${table.classId} IS NULL)
          OR (${table.scopeType} = 'education_organization' AND ${table.educationOrganizationId} IS NOT NULL AND ${table.schoolId} IS NULL AND ${table.classId} IS NULL)
          OR (${table.scopeType} = 'school' AND ${table.educationOrganizationId} IS NULL AND ${table.schoolId} IS NOT NULL AND ${table.classId} IS NULL)
          OR (${table.scopeType} = 'class' AND ${table.educationOrganizationId} IS NULL AND ${table.schoolId} IS NULL AND ${table.classId} IS NOT NULL)`
    ),
    check(
      'account_invitations_roles_check',
      sql`jsonb_typeof(${table.roleTemplateKeys}) = 'array'
          AND jsonb_array_length(${table.roleTemplateKeys}) BETWEEN 1 AND 8
          AND NOT jsonb_path_exists(${table.roleTemplateKeys}, '$[*] ? (@.type() != "string")')
          AND ${table.roleTemplateKeys} <@ '["org_admin", "org_viewer", "school_admin", "staff", "teacher", "parent", "student"]'::jsonb
          AND (
            (${table.scopeType} = 'tenant' AND ${table.roleTemplateKeys} <@ '["parent"]'::jsonb)
            OR (${table.scopeType} = 'education_organization' AND ${table.roleTemplateKeys} <@ '["org_admin", "org_viewer"]'::jsonb)
            OR (${table.scopeType} = 'school' AND ${table.roleTemplateKeys} <@ '["school_admin", "staff", "parent", "student"]'::jsonb)
            OR (${table.scopeType} = 'class' AND ${table.roleTemplateKeys} <@ '["teacher"]'::jsonb)
          )`
    ),
    check(
      'account_invitations_period_check',
      sql`${table.expiresAt} > ${table.createdAt} AND (${table.affiliationValidUntil} IS NULL OR ${table.affiliationValidUntil} > ${table.createdAt})`
    ),
    check(
      'account_invitations_status_evidence_check',
      sql`(${table.status} = 'pending' AND ${table.acceptedAt} IS NULL AND ${table.acceptedByAccountId} IS NULL AND ${table.acceptedProviderSubject} IS NULL AND ${table.cancelledAt} IS NULL AND ${table.cancelledByAccountId} IS NULL AND ${table.cancellationReason} IS NULL)
          OR (${table.status} = 'accepted' AND ${table.acceptedAt} IS NOT NULL AND ${table.acceptedByAccountId} IS NOT NULL AND ${table.acceptedProviderSubject} IS NOT NULL AND ${table.cancelledAt} IS NULL AND ${table.cancelledByAccountId} IS NULL AND ${table.cancellationReason} IS NULL)
          OR (${table.status} = 'cancelled' AND ${table.acceptedAt} IS NULL AND ${table.acceptedByAccountId} IS NULL AND ${table.acceptedProviderSubject} IS NULL AND ${table.cancelledAt} IS NOT NULL AND ${table.cancelledByAccountId} IS NOT NULL AND nullif(btrim(${table.cancellationReason}), '') IS NOT NULL)
          OR (${table.status} = 'expired' AND ${table.acceptedAt} IS NULL AND ${table.acceptedByAccountId} IS NULL AND ${table.acceptedProviderSubject} IS NULL AND ${table.cancelledAt} IS NULL AND ${table.cancelledByAccountId} IS NULL AND ${table.cancellationReason} IS NULL)`
    ),
    pgPolicy('account_invitations_runtime_select', {
      for: 'select',
      to: 'openschool_runtime',
      using: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') IN (
          'tenant.accounts.invite', 'tenant.accounts.manage'
        )
        AND public.openschool_invitation_scope_allows(
          ${table.tenantId}, ${table.scopeType}, ${table.educationOrganizationId},
          ${table.schoolId}, ${table.classId}
        )
      `,
    }),
    pgPolicy('account_invitations_runtime_insert', {
      for: 'insert',
      to: 'openschool_runtime',
      withCheck: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND ${table.issuedByAccountId} = nullif(current_setting('app.account_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.accounts.invite'
        AND public.openschool_invitation_scope_allows(
          ${table.tenantId}, ${table.scopeType}, ${table.educationOrganizationId},
          ${table.schoolId}, ${table.classId}
        )
      `,
    }),
    pgPolicy('account_invitations_runtime_update', {
      for: 'update',
      to: 'openschool_runtime',
      using: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.accounts.manage'
        AND public.openschool_invitation_scope_allows(
          ${table.tenantId}, ${table.scopeType}, ${table.educationOrganizationId},
          ${table.schoolId}, ${table.classId}
        )
      `,
      withCheck: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND ${table.cancelledByAccountId} = nullif(current_setting('app.account_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.accounts.manage'
        AND public.openschool_invitation_scope_allows(
          ${table.tenantId}, ${table.scopeType}, ${table.educationOrganizationId},
          ${table.schoolId}, ${table.classId}
        )
      `,
    }),
    pgPolicy('account_invitations_runtime_delete_deny', {
      for: 'delete',
      to: 'openschool_runtime',
      using: sql`false`,
    }),
    pgPolicy('account_invitations_worker_select', {
      for: 'select',
      to: 'openschool_worker',
      using: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid`,
    }),
    // FORCE RLS also applies to a non-superuser table owner. These policies are
    // reachable only while the runtime session is inside the reviewed
    // SECURITY DEFINER acceptance function (current_user then differs from
    // session_user); a direct runtime query can never satisfy that boundary.
    pgPolicy('account_invitations_acceptance_select', {
      for: 'select',
      to: 'public',
      using: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_invitation_acceptor'
      `,
    }),
    pgPolicy('account_invitations_acceptance_update', {
      for: 'update',
      to: 'public',
      using: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_invitation_acceptor'
        AND ${table.status} = 'pending'
        AND ${table.expiresAt} > now()
        AND ${table.identityProvider} = nullif(current_setting('app.identity_provider', true), '')
        AND ${table.intendedEmail} = lower(btrim(nullif(current_setting('app.identity_email', true), '')))
        AND (
          ${table.intendedProviderSubject} IS NULL
          OR ${table.intendedProviderSubject} = nullif(current_setting('app.provider_subject', true), '')
        )
      `,
      withCheck: sql`
        session_user = 'openschool_runtime'
        AND current_user = 'openschool_invitation_acceptor'
        AND ${table.status} = 'accepted'
        AND ${table.acceptedProviderSubject} = nullif(current_setting('app.provider_subject', true), '')
        AND EXISTS (
          SELECT 1 FROM public.accounts AS accepted_account
          WHERE accepted_account.id = ${table.acceptedByAccountId}
            AND accepted_account.identity_provider = nullif(current_setting('app.identity_provider', true), '')
            AND accepted_account.provider_subject = nullif(current_setting('app.provider_subject', true), '')
            AND lower(btrim(accepted_account.primary_email)) = lower(btrim(nullif(current_setting('app.identity_email', true), '')))
            AND accepted_account.status = 'active'
        )
      `,
    }),
  ]
).enableRLS()

export const invitationDeliveryOutbox = pgTable(
  'invitation_delivery_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    invitationId: uuid('invitation_id').notNull(),
    recipientEmail: text('recipient_email').notNull(),
    encryptionKeyId: text('encryption_key_id'),
    tokenCiphertext: text('token_ciphertext'),
    tokenIv: text('token_iv'),
    tokenAuthTag: text('token_auth_tag'),
    status: text('status', { enum: INVITATION_DELIVERY_STATUSES }).default('pending').notNull(),
    attemptCount: integer('attempt_count').default(0).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true }).defaultNow().notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('invitation_delivery_invitation_unique').on(table.tenantId, table.invitationId),
    foreignKey({
      name: 'invitation_delivery_invitation_fk',
      columns: [table.tenantId, table.invitationId],
      foreignColumns: [accountInvitations.tenantId, accountInvitations.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('invitation_delivery_claim_idx').on(
      table.tenantId,
      table.status,
      table.availableAt,
      table.id
    ),
    check(
      'invitation_delivery_email_normalized_check',
      sql`${table.recipientEmail} = lower(btrim(${table.recipientEmail})) AND char_length(${table.recipientEmail}) BETWEEN 3 AND 320`
    ),
    check(
      'invitation_delivery_encryption_check',
      sql`(
            ${table.status} IN ('pending', 'processing', 'failed')
            AND ${table.encryptionKeyId} ~ '^[A-Za-z0-9_.-]{1,64}$'
            AND ${table.tokenCiphertext} ~ '^[A-Za-z0-9_-]{16,1024}$'
            AND ${table.tokenIv} ~ '^[A-Za-z0-9_-]{16}$'
            AND ${table.tokenAuthTag} ~ '^[A-Za-z0-9_-]{22}$'
          ) OR (
            ${table.status} IN ('delivered', 'dead_letter')
            AND ${table.encryptionKeyId} IS NULL
            AND ${table.tokenCiphertext} IS NULL
            AND ${table.tokenIv} IS NULL
            AND ${table.tokenAuthTag} IS NULL
          )`
    ),
    check('invitation_delivery_attempt_nonnegative', sql`${table.attemptCount} >= 0`),
    check(
      'invitation_delivery_status_check',
      sql`${table.status} IN ('pending', 'processing', 'delivered', 'failed', 'dead_letter')`
    ),
    pgPolicy('invitation_delivery_runtime_insert', {
      for: 'insert',
      to: 'openschool_runtime',
      withCheck: sql`
        ${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid
        AND nullif(current_setting('app.policy_capability', true), '') = 'tenant.accounts.invite'
        AND EXISTS (
          SELECT 1 FROM public.account_invitations AS invitation
          WHERE invitation.tenant_id = ${table.tenantId}
            AND invitation.id = ${table.invitationId}
            AND invitation.issued_by_account_id = nullif(current_setting('app.account_id', true), '')::uuid
            AND invitation.status = 'pending'
        )
      `,
    }),
    pgPolicy('invitation_delivery_runtime_select_deny', {
      for: 'select',
      to: 'openschool_runtime',
      using: sql`false`,
    }),
    pgPolicy('invitation_delivery_runtime_update_deny', {
      for: 'update',
      to: 'openschool_runtime',
      using: sql`false`,
      withCheck: sql`false`,
    }),
    pgPolicy('invitation_delivery_runtime_delete_deny', {
      for: 'delete',
      to: 'openschool_runtime',
      using: sql`false`,
    }),
    pgPolicy('invitation_delivery_worker_select', {
      for: 'select',
      to: 'openschool_worker',
      using: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid`,
    }),
    pgPolicy('invitation_delivery_worker_update', {
      for: 'update',
      to: 'openschool_worker',
      using: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid`,
      withCheck: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid`,
    }),
    pgPolicy('invitation_delivery_worker_insert_deny', {
      for: 'insert',
      to: 'openschool_worker',
      withCheck: sql`false`,
    }),
    pgPolicy('invitation_delivery_worker_delete_deny', {
      for: 'delete',
      to: 'openschool_worker',
      using: sql`false`,
    }),
  ]
).enableRLS()

export type AccountInvitation = typeof accountInvitations.$inferSelect
export type NewAccountInvitation = typeof accountInvitations.$inferInsert
export type InvitationDeliveryOutboxRecord = typeof invitationDeliveryOutbox.$inferSelect
export type NewInvitationDeliveryOutboxRecord = typeof invitationDeliveryOutbox.$inferInsert
