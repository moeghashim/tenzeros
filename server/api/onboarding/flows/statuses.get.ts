import { defineEventHandler } from 'h3'
import { requireWorkspaceQuery } from '../../../utils/workspace-request'
import type { FlowStatus } from '../../../../shared/onboarding'
export default defineEventHandler(async (event) => {
  await requireWorkspaceQuery(event)
  return {
    data: { statuses: {} as Record<string, FlowStatus>, chatIds: {} as Record<string, string> },
  }
})
