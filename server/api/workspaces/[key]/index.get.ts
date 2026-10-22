import { defineEventHandler, getValidatedRouterParams } from 'h3'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb } from '../../../db'
import { chats, subscriptions } from '../../../db/schema'
import { requireUser } from '../../../utils/auth'
import { workspaceForUser } from '../../../utils/accounts'
export default defineEventHandler(async (event) => {
  const { key } = await getValidatedRouterParams(
    event,
    z.object({ key: z.string().min(1).max(100) }).parse,
  )
  const user = await requireUser(event)
  const result = workspaceForUser(getDb(), user.id, key)
  return {
    ...result,
    subscription: getDb()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, result.workspace.id))
      .get(),
    chats: getDb().select().from(chats).where(eq(chats.workspaceId, result.workspace.id)).all(),
  }
})
