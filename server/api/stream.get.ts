import { defineEventHandler, createEventStream, setHeader } from 'h3'
import { requireUser } from '../utils/auth'
import { getDb } from '../db'
import { userWorkspaces } from '../utils/accounts'
import { realtimeHub } from '../utils/realtime'
export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const stream = createEventStream(event)
  setHeader(event, 'X-Accel-Buffering', 'no')
  setHeader(event, 'Cache-Control', 'no-cache, no-transform')
  const cleanup = realtimeHub.subscribe(userWorkspaces(getDb(), user.id).map(w => w.workspace.id), change => {
    // Recheck access so a revoked membership cannot keep receiving events.
    if (userWorkspaces(getDb(), user.id).some(w => w.workspace.id === change.workspaceId)) void stream.push({ data: JSON.stringify(change) }).catch(() => stream.close())
  })
  const heartbeat = setInterval(() => { void stream.push({ event: 'ping', data: '' }).catch(() => stream.close()) }, 20000)
  // Periodic reconnect also revalidates the session and membership set.
  const expiry = setTimeout(() => { void stream.close() }, 5 * 60 * 1000)
  stream.onClosed(() => { cleanup(); clearInterval(heartbeat); clearTimeout(expiry) })
  void stream.push({ event: 'ready', data: '{}' }).catch(() => stream.close())
  return stream.send()
})
