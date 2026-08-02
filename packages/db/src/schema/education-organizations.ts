import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { organizations } from './organizations'
import { schools } from './schools'
import { tenants } from './tenancy'

export const educationOrganizations = pgTable(
  'education_organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    legacyOrganizationId: uuid('legacy_organization_id'),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    type: text('type', {
      enum: ['ministry', 'school_board', 'district', 'network', 'region', 'other'],
    }).notNull(),
    status: text('status', { enum: ['active', 'archived'] })
      .default('active')
      .notNull(),
    settings: jsonb('settings').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('education_organizations_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('education_organizations_tenant_id_slug_unique').on(table.tenantId, table.slug),
    unique('education_organizations_legacy_organization_id_unique').on(table.legacyOrganizationId),
    foreignKey({
      name: 'education_organizations_legacy_organization_fk',
      columns: [table.tenantId, table.legacyOrganizationId],
      foreignColumns: [organizations.tenantId, organizations.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('education_organizations_tenant_type_idx').on(table.tenantId, table.type),
    check(
      'education_organizations_type_check',
      sql`${table.type} IN ('ministry', 'school_board', 'district', 'network', 'region', 'other')`
    ),
    check('education_organizations_status_check', sql`${table.status} IN ('active', 'archived')`),
  ]
)

export const organizationTreeVersions = pgTable(
  'organization_tree_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    version: integer('version').notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('organization_tree_versions_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('organization_tree_versions_tenant_id_version_unique').on(table.tenantId, table.version),
    unique('organization_tree_versions_tenant_effective_from_unique').on(
      table.tenantId,
      table.effectiveFrom
    ),
    index('organization_tree_versions_effective_lookup_idx').on(
      table.tenantId,
      table.effectiveFrom
    ),
    check('organization_tree_versions_version_positive', sql`${table.version} > 0`),
  ]
)

export const organizationTreeNodes = pgTable(
  'organization_tree_nodes',
  {
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    treeVersionId: uuid('tree_version_id').notNull(),
    organizationId: uuid('organization_id').notNull(),
    parentOrganizationId: uuid('parent_organization_id'),
  },
  (table) => [
    primaryKey({
      name: 'organization_tree_nodes_pk',
      columns: [table.tenantId, table.treeVersionId, table.organizationId],
    }),
    foreignKey({
      name: 'organization_tree_nodes_version_fk',
      columns: [table.tenantId, table.treeVersionId],
      foreignColumns: [organizationTreeVersions.tenantId, organizationTreeVersions.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'organization_tree_nodes_organization_fk',
      columns: [table.tenantId, table.organizationId],
      foreignColumns: [educationOrganizations.tenantId, educationOrganizations.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'organization_tree_nodes_parent_fk',
      columns: [table.tenantId, table.parentOrganizationId],
      foreignColumns: [educationOrganizations.tenantId, educationOrganizations.id],
    }).onDelete('restrict'),
    index('organization_tree_nodes_parent_idx').on(
      table.tenantId,
      table.treeVersionId,
      table.parentOrganizationId
    ),
    check(
      'organization_tree_nodes_not_self_parent',
      sql`${table.parentOrganizationId} IS NULL OR ${table.parentOrganizationId} <> ${table.organizationId}`
    ),
  ]
)

export const organizationTreeClosure = pgTable(
  'organization_tree_closure',
  {
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    treeVersionId: uuid('tree_version_id').notNull(),
    ancestorOrganizationId: uuid('ancestor_organization_id').notNull(),
    descendantOrganizationId: uuid('descendant_organization_id').notNull(),
    depth: integer('depth').notNull(),
  },
  (table) => [
    primaryKey({
      name: 'organization_tree_closure_pk',
      columns: [
        table.tenantId,
        table.treeVersionId,
        table.ancestorOrganizationId,
        table.descendantOrganizationId,
      ],
    }),
    foreignKey({
      name: 'organization_tree_closure_version_fk',
      columns: [table.tenantId, table.treeVersionId],
      foreignColumns: [organizationTreeVersions.tenantId, organizationTreeVersions.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'organization_tree_closure_ancestor_fk',
      columns: [table.tenantId, table.ancestorOrganizationId],
      foreignColumns: [educationOrganizations.tenantId, educationOrganizations.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'organization_tree_closure_descendant_fk',
      columns: [table.tenantId, table.descendantOrganizationId],
      foreignColumns: [educationOrganizations.tenantId, educationOrganizations.id],
    }).onDelete('restrict'),
    index('organization_tree_closure_descendants_idx').on(
      table.tenantId,
      table.treeVersionId,
      table.ancestorOrganizationId,
      table.depth,
      table.descendantOrganizationId
    ),
    index('organization_tree_closure_ancestors_idx').on(
      table.tenantId,
      table.treeVersionId,
      table.descendantOrganizationId,
      table.depth,
      table.ancestorOrganizationId
    ),
    check('organization_tree_closure_depth_nonnegative', sql`${table.depth} >= 0`),
    check(
      'organization_tree_closure_self_depth',
      sql`(${table.ancestorOrganizationId} = ${table.descendantOrganizationId}) = (${table.depth} = 0)`
    ),
  ]
)

export const schoolGovernanceAssignments = pgTable(
  'school_governance_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'restrict', onUpdate: 'restrict' })
      .notNull(),
    schoolId: uuid('school_id').notNull(),
    educationOrganizationId: uuid('education_organization_id').notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('school_governance_assignments_tenant_id_id_unique').on(table.tenantId, table.id),
    foreignKey({
      name: 'school_governance_assignments_school_fk',
      columns: [table.tenantId, table.schoolId],
      foreignColumns: [schools.tenantId, schools.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'school_governance_assignments_organization_fk',
      columns: [table.tenantId, table.educationOrganizationId],
      foreignColumns: [educationOrganizations.tenantId, educationOrganizations.id],
    }).onDelete('restrict'),
    index('school_governance_assignments_effective_lookup_idx').on(
      table.tenantId,
      table.schoolId,
      table.validFrom,
      table.validUntil
    ),
    check(
      'school_governance_assignments_valid_period',
      sql`${table.validUntil} IS NULL OR ${table.validUntil} > ${table.validFrom}`
    ),
  ]
)

export type EducationOrganization = typeof educationOrganizations.$inferSelect
export type NewEducationOrganization = typeof educationOrganizations.$inferInsert
export type OrganizationTreeVersion = typeof organizationTreeVersions.$inferSelect
export type NewOrganizationTreeVersion = typeof organizationTreeVersions.$inferInsert
export type OrganizationTreeNode = typeof organizationTreeNodes.$inferSelect
export type NewOrganizationTreeNode = typeof organizationTreeNodes.$inferInsert
export type OrganizationTreeClosureEdge = typeof organizationTreeClosure.$inferSelect
export type NewOrganizationTreeClosureEdge = typeof organizationTreeClosure.$inferInsert
export type SchoolGovernanceAssignment = typeof schoolGovernanceAssignments.$inferSelect
export type NewSchoolGovernanceAssignment = typeof schoolGovernanceAssignments.$inferInsert
