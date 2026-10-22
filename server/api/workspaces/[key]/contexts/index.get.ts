import { defineEventHandler, getValidatedRouterParams } from 'h3'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb } from '../../../../db'
import { contextNames } from '../../../../../shared/validation'
import { aiContexts } from '../../../../db/schema'
import { requireUser } from '../../../../utils/auth'
import { workspaceForUser } from '../../../../utils/accounts'
export default defineEventHandler(async event => {
  const { key } = await getValidatedRouterParams(event, z.object({ key: z.string().min(1).max(100) }).parse)
  const { workspace, role } = workspaceForUser(getDb(), (await requireUser(event)).id, key)
  return { contexts: getDb().select().from(aiContexts).where(eq(aiContexts.workspaceId, workspace.id)).all().sort((a, b) => contextNames.indexOf(a.name as typeof contextNames[number]) - contextNames.indexOf(b.name as typeof contextNames[number])), status: workspace.contextStatus, error: workspace.contextError, canEdit: role === 'admin', workspaceId: workspace.id }
})
