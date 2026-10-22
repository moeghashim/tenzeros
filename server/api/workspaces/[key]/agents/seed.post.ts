import { defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import { requireSameOrigin } from '../../../../utils/auth'
import { requireWorkspace } from '../../../../utils/workspace-request'
import { seedAgents } from '../../../../utils/onboarding'
export default defineEventHandler(async (event) => {
  requireSameOrigin(event)
  await readValidatedBody(event, z.object({}).strict().parse)
  const { db, workspace } = await requireWorkspace(event, true)
  seedAgents(db, workspace.id)
  return { seeded: true }
})
