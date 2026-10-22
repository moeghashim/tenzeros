import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDecipheriv, createHash } from 'node:crypto'
import { encryptGoogleTokens, exchangeGoogleCode, googleScopes } from '../server/utils/google-oauth'
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
describe('Google OAuth exchange', () => {
  it('encrypts credentials with authentication and a random IV', () => {
    const tokens = { access_token: 'test-access', refresh_token: 'test-refresh' }
    const encrypted = encryptGoogleTokens(tokens, 'test-secret')
    expect(encryptGoogleTokens(tokens, 'test-secret').ciphertext).not.toBe(encrypted.ciphertext)
    expect(JSON.stringify(encrypted)).not.toContain('test-access')
    const decipher = createDecipheriv(
      'aes-256-gcm',
      createHash('sha256').update('test-secret').digest(),
      Buffer.from(encrypted.iv, 'base64'),
    )
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'))
    expect(
      JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
          decipher.final(),
        ]).toString(),
      ),
    ).toEqual(tokens)
  })
  it('exchanges the code with PKCE and validates both grants before returning the account', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret')
    const mock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'test-access',
          expires_in: 3600,
          scope: googleScopes.join(' '),
        }),
      )
      .mockResolvedValueOnce(Response.json({ email: 'ALEX@example.test', email_verified: true }))
    vi.stubGlobal('fetch', mock)
    const result = await exchangeGoogleCode(
      'test-code',
      'test-verifier',
      'http://localhost/callback',
    )
    expect(result.status).toBe('success')
    if (result.status === 'success') {
      expect(result.email).toBe('alex@example.test')
      expect(JSON.stringify(result.settings)).not.toContain('test-access')
    }
    expect(mock.mock.calls[0]![1].body.get('code_verifier')).toBe('test-verifier')
  })
  it('returns missing_scopes without persisting or requesting a profile for incomplete grants', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret')
    const mock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ access_token: 'test-access', expires_in: 3600, scope: 'openid email' }),
      )
    vi.stubGlobal('fetch', mock)
    expect(await exchangeGoogleCode('code', 'verifier', 'http://localhost/callback')).toEqual({
      status: 'missing_scopes',
    })
    expect(mock).toHaveBeenCalledTimes(1)
  })
})
