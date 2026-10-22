import { useSession, createError, getHeader, getRequestURL, type H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { users } from '../db/schema'

export const DEV_SESSION_SECRET = 'tenzeros-local-development-secret-change-before-deploying'
export function authSession(event: H3Event) {
  const configured = useRuntimeConfig(event).sessionSecret
  const password = configured || (process.env.NODE_ENV !== 'production' ? DEV_SESSION_SECRET : '')
  if (
    password.length < 32 ||
    (process.env.NODE_ENV === 'production' && password === DEV_SESSION_SECRET)
  )
    throw createError({
      statusCode: 503,
      statusMessage: 'Set NUXT_SESSION_SECRET to a unique secret of at least 32 characters.',
    })
  return useSession<{
    userId: string
    googleOAuth?: {
      state: string
      verifier: string
      workspaceKey: string
      workspaceId: string
      redirectUri: string
      expiresAt: number
    }
  }>(event, {
    name: 'tenzeros-session',
    password,
    maxAge: 60 * 60 * 24 * 7,
    sessionHeader: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
  })
}
export async function requireUser(event: H3Event) {
  const session = await authSession(event)
  const user = session.data.userId
    ? getDb().select().from(users).where(eq(users.id, session.data.userId)).get()
    : undefined
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Sign in to continue' })
  return user
}
export function requireSameOrigin(event: H3Event) {
  const origin = getHeader(event, 'origin')
  if (
    (origin && origin !== getRequestURL(event).origin) ||
    getHeader(event, 'sec-fetch-site') === 'cross-site'
  )
    throw createError({ statusCode: 403, statusMessage: 'Cross-origin request rejected' })
}
