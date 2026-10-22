import { defineEventHandler, getValidatedRouterParams, createError, setResponseStatus } from 'h3'
import { z } from 'zod'
import { getDb } from '../../../../db'
import { requireUser, requireSameOrigin } from '../../../../utils/auth'
import { workspaceForUser } from '../../../../utils/accounts'
import { queueBootstrap } from '../../../../utils/bootstrap'
export default defineEventHandler(async event => {
  requireSameOrigin(event)
  const { key } = await getValidatedRouterParams(event, z.object({ key: z.string().min(1).max(100) }).parse)
  const { workspace, role } = workspaceForUser(getDb(), (await requireUser(event)).id, key)
  if (role !== 'admin') throw createError({ statusCode: 403, statusMessage: 'Only workspace admins can generate context.' })
  if (workspace.contextStatus !== 'ready') event.waitUntil(queueBootstrap(getDb(), workspace.id))
  setResponseStatus(event, 202)
  return { status: workspace.contextStatus === 'ready' ? 'ready' : 'pending' }
})
