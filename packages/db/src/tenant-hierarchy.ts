import { and, eq } from 'drizzle-orm'
import { type OrganizationTreeNodeInput, buildOrganizationClosure } from './organization-tree'
import { organizationTreeClosure, organizationTreeNodes, organizationTreeVersions } from './schema'
import type { DatabaseTransaction } from './tenant-transaction'

export interface OrganizationTreeVersionInput {
  id: string
  tenantId: string
  version: number
  effectiveFrom: Date
  reason: string
  nodes: readonly OrganizationTreeNodeInput[]
}

/**
 * Persists and seals one immutable Organization Tree version.
 *
 * The database guards require nodes and closure edges to be written before the
 * version row. Deferred foreign keys make the whole version visible atomically
 * at commit; once the version exists, later inserts, updates, and deletes fail.
 */
export async function insertOrganizationTreeVersion(
  tx: DatabaseTransaction,
  input: OrganizationTreeVersionInput
): Promise<'created' | 'already_exists'> {
  const existingVersion = await tx
    .select({ id: organizationTreeVersions.id })
    .from(organizationTreeVersions)
    .where(
      and(
        eq(organizationTreeVersions.tenantId, input.tenantId),
        eq(organizationTreeVersions.id, input.id)
      )
    )
    .limit(1)

  if (existingVersion.length > 0) {
    return 'already_exists'
  }

  const closure = buildOrganizationClosure(input.nodes)

  await tx.insert(organizationTreeNodes).values(
    input.nodes.map((node) => ({
      tenantId: input.tenantId,
      treeVersionId: input.id,
      organizationId: node.organizationId,
      parentOrganizationId: node.parentOrganizationId,
    }))
  )
  await tx.insert(organizationTreeClosure).values(
    closure.map((edge) => ({
      tenantId: input.tenantId,
      treeVersionId: input.id,
      ...edge,
    }))
  )
  await tx.insert(organizationTreeVersions).values({
    id: input.id,
    tenantId: input.tenantId,
    version: input.version,
    effectiveFrom: input.effectiveFrom,
    reason: input.reason,
  })

  return 'created'
}
