import { defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import { emailSchema } from '../../../../shared/validation'
import { requireSameOrigin } from '../../../utils/auth'
import { requireWorkspace } from '../../../utils/workspace-request'
import { inviteTeam } from '../../../utils/onboarding'
export default defineEventHandler(async (event) => {
  requireSameOrigin(event)
  const { emails, role } = await readValidatedBody(
    event,
    z
      .object({ emails: z.array(emailSchema).min(1).max(50), role: z.enum(['member', 'admin']) })
      .strict().parse,
  )
  const { db, actor } = await requireWorkspace(event, true)
  return { invited: inviteTeam(db, actor, emails, role) }
})
