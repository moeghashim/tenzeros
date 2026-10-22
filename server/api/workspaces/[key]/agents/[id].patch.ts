import { defineEventHandler, getValidatedRouterParams, readValidatedBody } from 'h3'
import { z } from 'zod'
import { requireSameOrigin } from '../../../../utils/auth'
import { requireWorkspace, workspaceParams } from '../../../../utils/workspace-request'
import { toggleAgent } from '../../../../utils/onboarding'
export default defineEventHandler(async (event) => {
  requireSameOrigin(event)
  const { id } = await getValidatedRouterParams(
    event,
    workspaceParams.extend({ id: z.uuid() }).parse,
  )
  const { enabled } = await readValidatedBody(
    event,
    z.object({ enabled: z.boolean() }).strict().parse,
  )
  const { db, actor } = await requireWorkspace(event, true)
  return toggleAgent(db, actor, id, enabled)
})
