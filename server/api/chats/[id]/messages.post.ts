import { defineEventHandler, readValidatedBody, createEventStream, setHeader } from 'h3'
import { requireChat, assertCurrentFlow } from '../../../ai/flow-state'
import { requireSameOrigin } from '../../../utils/auth'
import { acquireChat, runTurn, validateTurn } from '../../../ai/chat-engine'
import { turnSchema } from '../../../../shared/chat'
export default defineEventHandler(async (event) => {
  requireSameOrigin(event)
  const { db, chat, actor } = await requireChat(event)
  const input = await readValidatedBody(event, turnSchema.parse)
  assertCurrentFlow(db, chat)
  validateTurn(chat, input)
  const release = acquireChat(chat.id)
  const stream = createEventStream(event)
  const abort = new AbortController()
  let done = false
  stream.onClosed(() => {
    if (!done) abort.abort()
  })
  setHeader(event, 'X-Accel-Buffering', 'no')
  setHeader(event, 'Cache-Control', 'no-cache, no-transform')
  const heartbeat = setInterval(() => {
    void stream.push({ event: 'ping', data: '{}' }).catch(() => {})
  }, 15000)
  void runTurn(
    db,
    actor,
    chat,
    input,
    async (payload) => {
      await stream.push({ event: payload.type, data: JSON.stringify(payload) })
    },
    abort.signal,
  )
    .catch(() => {})
    .finally(async () => {
      done = true
      clearInterval(heartbeat)
      release()
      await stream.close()
    })
  return stream.send()
})
