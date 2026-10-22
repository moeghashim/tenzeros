import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { z } from 'zod'
export const googleScopes = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
]
export function googleCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret)
    throw createError({ statusCode: 503, statusMessage: 'Google OAuth is not configured' })
  return { clientId, clientSecret }
}
export function encryptGoogleTokens(tokens: unknown, clientSecret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv(
    'aes-256-gcm',
    createHash('sha256').update(clientSecret).digest(),
    iv,
  )
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()])
  return {
    version: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
}
export async function exchangeGoogleCode(code: string, verifier: string, redirectUri: string) {
  const { clientId, clientSecret } = googleCredentials()
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      code_verifier: verifier,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!response.ok) throw new Error('Google token exchange failed')
  const tokens = z
    .object({
      access_token: z.string(),
      refresh_token: z.string().optional(),
      expires_in: z.number(),
      scope: z.string(),
    })
    .parse(await response.json())
  if (
    !googleScopes
      .filter((scope) => scope.startsWith('https://'))
      .every((scope) => tokens.scope.split(' ').includes(scope))
  )
    return { status: 'missing_scopes' as const }
  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(10000),
  })
  if (!profileResponse.ok) throw new Error('Google profile request failed')
  const profile = z
    .object({ email: z.email(), email_verified: z.literal(true) })
    .parse(await profileResponse.json())
  return {
    status: 'success' as const,
    email: profile.email.toLowerCase(),
    settings: {
      credentials: encryptGoogleTokens(
        { ...tokens, expiresAt: Date.now() + tokens.expires_in * 1000 },
        clientSecret,
      ),
    },
  }
}
