import { publicFlowStatus } from '../../../ai/flow-state'
import { defineEventHandler } from 'h3'
import { and, eq } from 'drizzle-orm'
import { requireWorkspaceQuery } from '../../../utils/workspace-request'
import { getDb } from '../../../db'
import { onboardingFlowStatuses } from '../../../db/schema'
import type { FlowStatus } from '../../../../shared/onboarding'
export default defineEventHandler(async (event) => {
  const { actor } = await requireWorkspaceQuery(event)
  const rows = getDb()
    .select()
    .from(onboardingFlowStatuses)
    .where(
      and(
        eq(onboardingFlowStatuses.workspaceId, actor.workspaceId),
        eq(onboardingFlowStatuses.userId, actor.userId),
      ),
    )
    .all()
  return {
    data: {
      statuses: Object.fromEntries(
        rows.map((r) => [r.flowKey, publicFlowStatus(r.status)]),
      ) as Record<string, FlowStatus>,
      chatIds: Object.fromEntries(rows.filter((r) => r.chatId).map((r) => [r.flowKey, r.chatId!])),
    },
  }
})
