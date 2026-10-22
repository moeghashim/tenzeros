import { createHash, randomBytes } from 'node:crypto'
import { defineEventHandler, getRequestURL, getValidatedQuery } from 'h3'
import { z } from 'zod'
import { requireWorkspaceQuery, workspaceQuery } from '../../../utils/workspace-request'
import { authSession, requireSameOrigin } from '../../../utils/auth'
import { googleCredentials, googleScopes } from '../../../utils/google-oauth'
export default defineEventHandler(async (event) => {
  requireSameOrigin(event)
  await getValidatedQuery(
    event,
    workspaceQuery.extend({
      page: z.string().max(200).optional(),
      type: z.enum(['mailbox', 'calendar', 'all']).optional(),
    }).parse,
  )
  const { workspace, user } = await requireWorkspaceQuery(event)
  const { clientId } = googleCredentials()
  const state = randomBytes(32).toString('base64url')
  const verifier = randomBytes(32).toString('base64url')
  const redirectUri = new URL('/api/integrations/google/callback', getRequestURL(event).origin).href
  const session = await authSession(event)
  await session.update({
    googleOAuth: {
      state,
      verifier,
      workspaceKey: workspace.key,
      workspaceId: workspace.id,
      redirectUri,
      expiresAt: Date.now() + 600000,
    },
  })
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: googleScopes.join(' '),
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
    login_hint: user.email,
  }).toString()
  return { url: url.href }
})
