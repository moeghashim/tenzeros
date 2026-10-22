import { defineEventHandler, readValidatedBody, setResponseStatus, getRequestIP } from 'h3'
import { signupSchema } from '../../../shared/validation'
import { getDb } from '../../db'
import { createAccount } from '../../utils/accounts'
import { authSession, requireSameOrigin } from '../../utils/auth'
import { queueBootstrap } from '../../utils/bootstrap'
import { enforceRateLimit, signupLimit } from '../../utils/rate-limit'
export default defineEventHandler(async (event) => {
  requireSameOrigin(event)
  enforceRateLimit(event, signupLimit(getRequestIP(event) || 'unknown'))
  const input = await readValidatedBody(event, (body) => signupSchema.parse(body))
  const session = await authSession(event)
  const { user, workspace } = createAccount(getDb(), input)
  await session.update({ userId: user.id })
  event.waitUntil(queueBootstrap(getDb(), workspace.id))
  setResponseStatus(event, 201)
  return { redirect: `/${workspace.key}/onboarding` }
})
