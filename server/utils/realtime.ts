import type { ChangeOperation, RealtimeEvent } from '../../shared/realtime'
type Listener = (event: RealtimeEvent) => void
export function createRealtimeHub() {
  const listeners = new Map<Listener, ReadonlySet<string>>()
  return {
    subscribe(workspaceIds: Iterable<string>, listener: Listener) {
      listeners.set(listener, new Set(workspaceIds))
      return () => {
        listeners.delete(listener)
      }
    },
    publish(event: RealtimeEvent) {
      for (const [listener, workspaces] of listeners)
        if (workspaces.has(event.workspaceId)) {
          try {
            listener(event)
          } catch {
            listeners.delete(listener)
          }
        }
    },
  }
}
export const realtimeHub = createRealtimeHub()
export function emitChange(
  workspaceId: string,
  model: string,
  op: ChangeOperation,
  row: { id: string; [key: string]: unknown },
) {
  realtimeHub.publish({ workspaceId, type: op, targetModel: model, targetId: row.id, data: row })
}
export function emitCustomEvent(workspaceId: string, event: string, data: Record<string, unknown>) {
  realtimeHub.publish({ workspaceId, type: 'custom', event, data })
}
