import { defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import { requireSameOrigin } from '../../../utils/auth'
import { requireWorkspace } from '../../../utils/workspace-request'
import { importDemo } from '../../../utils/onboarding'
export default defineEventHandler(async (event) => {
  requireSameOrigin(event)
  const { source } = await readValidatedBody(
    event,
    z.object({ source: z.enum(['hubspot', 'attio', 'affinity', 'pipedrive']) }).strict().parse,
  )
  const { db, actor } = await requireWorkspace(event, true)
  return { import: importDemo(db, actor, source) }
})
