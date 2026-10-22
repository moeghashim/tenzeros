import { defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import { requireSameOrigin } from '../../../utils/auth'
import { requireWorkspace } from '../../../utils/workspace-request'
import { finishOnboarding } from '../../../utils/onboarding'
export default defineEventHandler(async (event) => {
  requireSameOrigin(event)
  const { action } = await readValidatedBody(
    event,
    z.object({ action: z.enum(['complete', 'dismiss']) }).strict().parse,
  )
  const { db, actor } = await requireWorkspace(event)
  return finishOnboarding(db, actor, action)
})
