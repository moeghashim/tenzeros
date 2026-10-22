import { createError, getValidatedQuery, getValidatedRouterParams, type H3Event } from 'h3'
import { z } from 'zod'
import { getDb } from '../db'
import { requireUser } from './auth'
import { userWorkspaces, workspaceForUser } from './accounts'

export const workspaceParams = z.object({ key: z.string().min(1).max(100) })
export async function requireWorkspace(event: H3Event, admin = false) {
  const { key } = await getValidatedRouterParams(event, workspaceParams.parse)
  const user = await requireUser(event)
  const db = getDb()
  const context = workspaceForUser(db, user.id, key)
  if (admin && context.role !== 'admin')
    throw createError({ statusCode: 403, statusMessage: 'Workspace administrator access required' })
  return { ...context, user, db, actor: { workspaceId: context.workspace.id, userId: user.id } }
}
export const workspaceQuery = z.object({ workspaceId: z.uuid() })
export async function requireWorkspaceQuery(event: H3Event) {
  const { workspaceId } = await getValidatedQuery(event, workspaceQuery.parse)
  const user = await requireUser(event)
  const context = userWorkspaces(getDb(), user.id).find((row) => row.workspace.id === workspaceId)
  if (!context) throw createError({ statusCode: 404, statusMessage: 'Workspace not found' })
  return { ...context, user, actor: { workspaceId, userId: user.id } }
}
