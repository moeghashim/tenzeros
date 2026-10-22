import { defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import { notetakerProviders } from '../../../../shared/onboarding'
import { requireSameOrigin } from '../../../utils/auth'
import { requireWorkspace } from '../../../utils/workspace-request'
import { connectAccount } from '../../../utils/onboarding'
const schema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('google') }).strict(),
  z.object({ kind: z.literal('linkedin') }).strict(),
  z.object({ kind: z.literal('notetaker'), provider: z.enum(notetakerProviders) }).strict(),
])
export default defineEventHandler(async (event) => {
  requireSameOrigin(event)
  const input = await readValidatedBody(event, schema.parse)
  const { db, actor, user } = await requireWorkspace(event)
  return { completion: connectAccount(db, actor, { ...input, email: user.email, isDemo: true }) }
})
