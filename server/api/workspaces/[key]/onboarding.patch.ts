import { defineEventHandler, getValidatedRouterParams, readValidatedBody } from 'h3'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../../../db'
import { memberships, workspaces } from '../../../db/schema'
import { requireUser, requireSameOrigin } from '../../../utils/auth'
import { workspaceForUser } from '../../../utils/accounts'
import { emitChange } from '../../../utils/realtime'
export default defineEventHandler(async (event) => {
  requireSameOrigin(event)
  const { key } = await getValidatedRouterParams(
    event,
    z.object({ key: z.string().min(1).max(100) }).parse,
  )
  await readValidatedBody(event, z.object({ action: z.literal('dismiss') }).strict().parse)
  const { workspace, membership, role } = workspaceForUser(
    getDb(),
    (await requireUser(event)).id,
    key,
  )
  const skippedAt = new Date().toISOString()
  const result = getDb().transaction((tx) => {
    const member = tx
      .update(memberships)
      .set({ onboardingSkippedAt: membership.onboardingSkippedAt || skippedAt })
      .where(eq(memberships.id, membership.id))
      .returning()
      .get()!
    const updatedWorkspace =
      role === 'admin'
        ? tx
            .update(workspaces)
            .set({ onboardingSkippedAt: workspace.onboardingSkippedAt || skippedAt })
            .where(eq(workspaces.id, workspace.id))
            .returning()
            .get()
        : undefined
    return { member, updatedWorkspace }
  })
  emitChange(workspace.id, 'memberships', 'update', result.member)
  if (result.updatedWorkspace)
    emitChange(workspace.id, 'workspaces', 'update', result.updatedWorkspace)
  return { dismissed: true }
})
