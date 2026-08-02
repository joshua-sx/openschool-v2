export interface OrganizationTreeNodeInput {
  organizationId: string
  parentOrganizationId: string | null
}

export interface OrganizationClosureEdge {
  ancestorOrganizationId: string
  descendantOrganizationId: string
  depth: number
}

export interface EffectiveTreeVersion {
  id: string
  effectiveFrom: Date
}

export interface EffectiveSchoolGovernance {
  id: string
  schoolId: string
  educationOrganizationId: string
  validFrom: Date
  validUntil: Date | null
}

export type OrganizationTreeValidationCode =
  | 'duplicate_organization'
  | 'missing_parent'
  | 'self_parent'
  | 'cycle'
  | 'invalid_root_count'
  | 'missing_organization'

export class OrganizationTreeValidationError extends Error {
  constructor(
    readonly code: OrganizationTreeValidationCode,
    message: string
  ) {
    super(message)
    this.name = 'OrganizationTreeValidationError'
  }
}

function indexNodes(nodes: readonly OrganizationTreeNodeInput[]): Map<string, string | null> {
  const parents = new Map<string, string | null>()

  for (const node of nodes) {
    if (parents.has(node.organizationId)) {
      throw new OrganizationTreeValidationError(
        'duplicate_organization',
        `Organization ${node.organizationId} appears more than once in the tree version`
      )
    }
    if (node.organizationId === node.parentOrganizationId) {
      throw new OrganizationTreeValidationError(
        'self_parent',
        `Organization ${node.organizationId} cannot be its own parent`
      )
    }
    parents.set(node.organizationId, node.parentOrganizationId)
  }

  for (const [organizationId, parentOrganizationId] of parents) {
    if (parentOrganizationId !== null && !parents.has(parentOrganizationId)) {
      throw new OrganizationTreeValidationError(
        'missing_parent',
        `Organization ${organizationId} references missing parent ${parentOrganizationId}`
      )
    }
  }

  return parents
}

export function buildOrganizationClosure(
  nodes: readonly OrganizationTreeNodeInput[]
): OrganizationClosureEdge[] {
  const parents = indexNodes(nodes)
  const edges: OrganizationClosureEdge[] = []

  for (const organizationId of parents.keys()) {
    const path = new Set<string>()
    let ancestorId: string | null = organizationId
    let depth = 0

    while (ancestorId !== null) {
      if (path.has(ancestorId)) {
        throw new OrganizationTreeValidationError(
          'cycle',
          `Organization tree contains a cycle involving ${ancestorId}`
        )
      }
      path.add(ancestorId)
      edges.push({
        ancestorOrganizationId: ancestorId,
        descendantOrganizationId: organizationId,
        depth,
      })
      ancestorId = parents.get(ancestorId) ?? null
      depth += 1
    }
  }

  const rootCount = nodes.filter((node) => node.parentOrganizationId === null).length
  if (rootCount !== 1) {
    throw new OrganizationTreeValidationError(
      'invalid_root_count',
      `Organization Tree version must contain exactly one root; found ${rootCount}`
    )
  }

  return edges.sort(
    (left, right) =>
      left.ancestorOrganizationId.localeCompare(right.ancestorOrganizationId) ||
      left.depth - right.depth ||
      left.descendantOrganizationId.localeCompare(right.descendantOrganizationId)
  )
}

export function moveOrganization(
  nodes: readonly OrganizationTreeNodeInput[],
  organizationId: string,
  parentOrganizationId: string | null
): OrganizationTreeNodeInput[] {
  if (!nodes.some((node) => node.organizationId === organizationId)) {
    throw new OrganizationTreeValidationError(
      'missing_organization',
      `Cannot move missing organization ${organizationId}`
    )
  }

  const moved = nodes.map((node) =>
    node.organizationId === organizationId ? { ...node, parentOrganizationId } : { ...node }
  )
  buildOrganizationClosure(moved)
  return moved
}

export function getDescendantOrganizationIds(
  edges: readonly OrganizationClosureEdge[],
  ancestorOrganizationId: string,
  includeSelf = false
): string[] {
  return edges
    .filter(
      (edge) =>
        edge.ancestorOrganizationId === ancestorOrganizationId && (includeSelf || edge.depth > 0)
    )
    .sort((left, right) => left.depth - right.depth)
    .map((edge) => edge.descendantOrganizationId)
}

export function getSiblingOrganizationIds(
  nodes: readonly OrganizationTreeNodeInput[],
  organizationId: string
): string[] {
  const node = nodes.find((candidate) => candidate.organizationId === organizationId)
  if (!node) {
    throw new OrganizationTreeValidationError(
      'missing_organization',
      `Cannot find siblings for missing organization ${organizationId}`
    )
  }

  return nodes
    .filter(
      (candidate) =>
        candidate.organizationId !== organizationId &&
        candidate.parentOrganizationId === node.parentOrganizationId
    )
    .map((candidate) => candidate.organizationId)
    .sort()
}

export function resolveTreeVersionAt(
  versions: readonly EffectiveTreeVersion[],
  at: Date
): EffectiveTreeVersion | null {
  return (
    versions
      .filter((version) => version.effectiveFrom.getTime() <= at.getTime())
      .sort((left, right) => right.effectiveFrom.getTime() - left.effectiveFrom.getTime())[0] ??
    null
  )
}

export function resolveSchoolGovernanceAt(
  assignments: readonly EffectiveSchoolGovernance[],
  schoolId: string,
  at: Date
): EffectiveSchoolGovernance | null {
  const active = assignments.filter(
    (assignment) =>
      assignment.schoolId === schoolId &&
      assignment.validFrom.getTime() <= at.getTime() &&
      (assignment.validUntil === null || at.getTime() < assignment.validUntil.getTime())
  )

  if (active.length > 1) {
    throw new Error(
      `School ${schoolId} has overlapping governance assignments at ${at.toISOString()}`
    )
  }

  return active[0] ?? null
}
