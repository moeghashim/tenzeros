import { defineEventHandler, getValidatedRouterParams, readValidatedBody, createError } from 'h3'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { getDb } from '../../../../db'
import { aiContexts } from '../../../../db/schema'
import { requireUser, requireSameOrigin } from '../../../../utils/auth'
import { workspaceForUser } from '../../../../utils/accounts'
import { emitChange } from '../../../../utils/realtime'
import { contextUpdateSchema } from '../../../../../shared/validation'
export default defineEventHandler(async event => {
  requireSameOrigin(event)
  const { key, id } = await getValidatedRouterParams(event, z.object({ key: z.string().min(1).max(100), id: z.string().uuid() }).parse)
  const { workspace, role } = workspaceForUser(getDb(), (await requireUser(event)).id, key)
  if (role !== 'admin') throw createError({ statusCode: 403, statusMessage: 'Only workspace admins can edit context.' })
  const input = await readValidatedBody(event, contextUpdateSchema.parse)
  const row = getDb().update(aiContexts).set(input).where(and(eq(aiContexts.id, id), eq(aiContexts.workspaceId, workspace.id))).returning().get()
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Context not found' })
  emitChange(workspace.id, 'aiContexts', 'update', row)
  return row
})
