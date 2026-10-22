import type { NuxtApp } from '#app'
import type { RealtimeEvent } from '../../shared/realtime'
type Subscriber = { onEvent?: (event: RealtimeEvent) => void; onConnected?: () => void }
type Connection = {
  source?: EventSource
  subscribers: Set<Subscriber>
  status: Ref<'connecting' | 'connected' | 'offline'>
}
const connections = new WeakMap<NuxtApp, Connection>()

/** One native EventSource per Nuxt app, shared across consumers and closed on last unmount.
 * EventSource handles retry/backoff; onConnected reconciles events missed while disconnected.
 */
export function useRealtime(subscriber: Subscriber = {}) {
  const app = useNuxtApp()
  let connection = connections.get(app)
  if (!connection) {
    connection = { subscribers: new Set(), status: ref('connecting') }
    connections.set(app, connection)
  }
  const state = connection
  onMounted(() => {
    state.subscribers.add(subscriber)
    if (state.source) {
      if (state.status.value === 'connected') subscriber.onConnected?.()
      return
    }
    const source = new EventSource('/api/stream')
    state.source = source
    source.addEventListener('ready', () => {
      state.status.value = 'connected'
      for (const s of state.subscribers) s.onConnected?.()
    })
    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as RealtimeEvent
        for (const s of state.subscribers) s.onEvent?.(event)
      } catch {
        /* Ignore malformed events. */
      }
    }
    source.onerror = () => {
      state.status.value = 'offline'
    }
  })
  onUnmounted(() => {
    state.subscribers.delete(subscriber)
    if (!state.subscribers.size) {
      state.source?.close()
      state.source = undefined
      state.status.value = 'offline'
    }
  })
  return { status: readonly(state.status) }
}
