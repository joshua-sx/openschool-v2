export interface AuditEvent {
    action: 'create' | 'read' | 'update' | 'delete'
    resource: string
    resourceId?: string
    oldValues?: Record<string, unknown>
    newValues?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }