import { defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import { requireSameOrigin, requireUser } from '../../../utils/auth'
import { getDb } from '../../../db'
import { startFlow } from '../../../ai/flow-state'
import { flowKeys } from '../../../../shared/chat'
const schema = z
  .object({
    workspaceId: z.uuid(),
    flowKey: z.enum([...flowKeys, 'csv-import']),
    mode: z.enum(['continue', 'restart']),
  })
  .strict()
export default defineEventHandler(async (event) => {
  requireSameOrigin(event)
  const user = await requireUser(event)
  const { workspaceId, flowKey, mode } = await readValidatedBody(event, schema.parse)
  return {
    data: { chatId: startFlow(getDb(), { workspaceId, userId: user.id }, flowKey, mode).id },
  }
})
