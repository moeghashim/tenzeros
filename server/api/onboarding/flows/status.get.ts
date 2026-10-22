import { defineEventHandler, getValidatedQuery } from 'h3'
import { z } from 'zod'
import { requireUser } from '../../../utils/auth'
import { getDb } from '../../../db'
import { ownChat } from '../../../ai/flow-state'
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { chatId } = await getValidatedQuery(event, z.object({ chatId: z.uuid() }).parse)
  const chat = ownChat(getDb(), user.id, chatId)
  return {
    data: {
      onboardingState: {
        sessionId: chat.id,
        flowKey: chat.flowKey,
        ...chat.state,
        status: chat.state.completed ? 'completed' : chat.state.started ? 'active' : 'unstarted',
      },
    },
  }
})
