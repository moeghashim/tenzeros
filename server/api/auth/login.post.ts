import { defineEventHandler, readValidatedBody, createError } from 'h3'
import { eq } from 'drizzle-orm'
import { loginSchema } from '../../../shared/validation'
import { getDb } from '../../db'
import { users } from '../../db/schema'
import { authSession, requireSameOrigin } from '../../utils/auth'
import { userWorkspaces } from '../../utils/accounts'
export default defineEventHandler(async event => {
  requireSameOrigin(event)
  const input = await readValidatedBody(event, body => loginSchema.parse(body))
  const user = getDb().select().from(users).where(eq(users.email, input.email)).get()
  if (!user || user.name !== input.name) throw createError({ statusCode: 401, statusMessage: 'No account matches this name and email.' })
  const workspace = userWorkspaces(getDb(), user.id)[0]?.workspace
  if (!workspace) throw createError({ statusCode: 403, statusMessage: 'No active workspace membership.' })
  await (await authSession(event)).update({ userId: user.id })
  return { redirect: `/${workspace.key}/onboarding` }
})
