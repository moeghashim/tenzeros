import { defineEventHandler } from 'h3'
import { requireChat, history } from '../../../ai/flow-state'
export default defineEventHandler(async (event) => {
  const { db, chat } = await requireChat(event)
  return { data: { chat, messages: history(db, chat.id) } }
})
