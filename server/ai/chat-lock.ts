import { createError } from 'h3'
// Same single-process lifecycle as the SQLite database and realtime hub.
const busyChats = new Set<string>()
export function assertChatIdle(id: string) {
  if (busyChats.has(id))
    throw createError({ statusCode: 409, statusMessage: 'A chat turn is already running' })
}
export function acquireChat(id: string) {
  assertChatIdle(id)
  busyChats.add(id)
  return () => busyChats.delete(id)
}
