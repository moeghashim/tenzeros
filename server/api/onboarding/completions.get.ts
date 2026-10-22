import { defineEventHandler } from 'h3'
import { eq, asc } from 'drizzle-orm'
import { requireWorkspaceQuery } from '../../utils/workspace-request'
import { getDb } from '../../db'
import { onboardingTaskCompletions } from '../../db/schema'
export default defineEventHandler(async (event) => {
  const { workspace } = await requireWorkspaceQuery(event)
  return {
    data: getDb()
      .select()
      .from(onboardingTaskCompletions)
      .where(eq(onboardingTaskCompletions.workspaceId, workspace.id))
      .orderBy(asc(onboardingTaskCompletions.completedAt))
      .all(),
  }
})
