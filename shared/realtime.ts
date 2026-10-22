export type ChangeOperation = 'insert' | 'update' | 'archive' | 'delete' | 'unarchive'
export type RealtimeEvent = {
  workspaceId: string
  type: ChangeOperation
  targetModel: string
  targetId: string
  data: Record<string, unknown>
} | { workspaceId: string; type: 'custom'; event: string; data: Record<string, unknown> }
