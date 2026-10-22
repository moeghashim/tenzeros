import { timingSafeEqual } from 'node:crypto'
import { createError, defineEventHandler, getValidatedQuery, sendRedirect } from 'h3'
import { z } from 'zod'
import { authSession, requireUser } from '../../../utils/auth'
import { workspaceForUser } from '../../../utils/accounts'
import { getDb } from '../../../db'
import { exchangeGoogleCode } from '../../../utils/google-oauth'
import { connectAccount } from '../../../utils/onboarding'
// OAuth is an external GET callback; session-bound, expiring state replaces same-origin validation.
export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(
    event,
    z.object({
      state: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[A-Za-z0-9_-]+$/),
      code: z.string().max(4096).optional(),
      error: z.string().max(200).optional(),
    }).parse,
  )
  const user = await requireUser(event)
  const session = await authSession(event)
  const pending = session.data.googleOAuth
  if (
    !pending ||
    pending.expiresAt < Date.now() ||
    query.state.length !== pending.state.length ||
    !timingSafeEqual(Buffer.from(query.state), Buffer.from(pending.state))
  )
    throw createError({ statusCode: 400, statusMessage: 'Invalid or expired OAuth state' })
  await session.update({ googleOAuth: undefined })
  const { workspace } = workspaceForUser(getDb(), user.id, pending.workspaceKey)
  let status = query.error === 'access_denied' ? 'denied' : 'error'
  if (query.code && !query.error) {
    try {
      const result = await exchangeGoogleCode(query.code, pending.verifier, pending.redirectUri)
      status = result.status
      if (result.status === 'success') {
        if (result.email !== user.email.toLowerCase()) status = 'wrong_account'
        else
          connectAccount(
            getDb(),
            { workspaceId: workspace.id, userId: user.id },
            { kind: 'google', email: result.email, isDemo: false, settings: result.settings },
          )
      }
    } catch {
      status = 'error'
    }
  }
  return sendRedirect(
    event,
    `/${workspace.key}/onboarding?${new URLSearchParams({ google_status: status, expected_email: user.email })}`,
  )
})
