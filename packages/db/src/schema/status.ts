/**
 * System-wide status states for entities
 * 
 * - active: Entity is active and can be modified
 * - archived: Entity is archived (hidden from normal views, read-only)
 * - read_only: Entity is read-only (visible but cannot be modified)
 */
export const ENTITY_STATUS = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  READ_ONLY: 'read_only',
} as const

export type EntityStatus = (typeof ENTITY_STATUS)[keyof typeof ENTITY_STATUS]

