import { defineEventHandler, getValidatedQuery } from 'h3'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireWorkspaceQuery, workspaceQuery } from '../../utils/workspace-request'
import { getDb } from '../../db'
import { mailboxes } from '../../db/schema'
export default defineEventHandler(async (event) => {
  await getValidatedQuery(
    event,
    workspaceQuery.extend({ dismissed: z.string().max(13000).optional() }).parse,
  )
  const { actor } = await requireWorkspaceQuery(event)
  const mailbox = getDb()
    .select()
    .from(mailboxes)
    .where(and(eq(mailboxes.workspaceId, actor.workspaceId), eq(mailboxes.userId, actor.userId)))
    .get()
  return { success: true, data: { status: mailbox ? 'ready' : 'no_mailbox', data: [] } }
})
