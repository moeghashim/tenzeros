import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp, createRouter, toNodeListener } from 'h3'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDatabase, accountInput } from './database'
import { createAccount } from '../server/utils/accounts'
import * as s from '../server/db/schema'
vi.mock('../server/db', async (original) => ({
  ...(await original<typeof import('../server/db')>()),
  getDb: () => db,
}))
import login from '../server/api/auth/login.post'
import simulate from '../server/api/workspaces/[key]/simulate.post'
import invites from '../server/api/workspaces/[key]/invites.post'
import imports from '../server/api/workspaces/[key]/imports.post'
import agents from '../server/api/workspaces/[key]/agents/index.get'
import seed from '../server/api/workspaces/[key]/agents/seed.post'
import toggle from '../server/api/workspaces/[key]/agents/[id].patch'
import onboarding from '../server/api/workspaces/[key]/onboarding.get'
import finish from '../server/api/workspaces/[key]/onboarding.patch'
import completions from '../server/api/onboarding/completions.get'
import statuses from '../server/api/onboarding/flows/statuses.get'
import suggestions from '../server/api/onboarding/invite-suggestions.get'
import authorizeGoogle from '../server/api/integrations/google/authorize-url.get'
import callbackGoogle from '../server/api/integrations/google/callback.get'
const db = testDatabase()
const account = createAccount(db, accountInput)
const otherAccount = createAccount(db, {
  ...accountInput,
  email: 'other@example.test',
  workspaceName: 'Other',
})
let server: Server, base: string, cookie: string, foreignCookie: string
const request = (
  path: string,
  method = 'GET',
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  fetch(`${base}${path}`, {
    method,
    headers: {
      cookie,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  })
const path = '/api/workspaces/acme-sales'
beforeAll(async () => {
  const app = createApp(),
    router = createRouter()
  router
    .post('/api/auth/login', login)
    .post('/api/workspaces/:key/simulate', simulate)
    .post('/api/workspaces/:key/invites', invites)
    .post('/api/workspaces/:key/imports', imports)
    .get('/api/workspaces/:key/agents', agents)
    .post('/api/workspaces/:key/agents/seed', seed)
    .patch('/api/workspaces/:key/agents/:id', toggle)
    .get('/api/workspaces/:key/onboarding', onboarding)
    .patch('/api/workspaces/:key/onboarding', finish)
    .get('/api/onboarding/completions', completions)
    .get('/api/onboarding/flows/statuses', statuses)
    .get('/api/onboarding/invite-suggestions', suggestions)
    .get('/api/integrations/google/authorize-url', authorizeGoogle)
    .get('/api/integrations/google/callback', callbackGoogle)
  app.use(router)
  server = createServer(toNodeListener(app))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  cookie = (
    await request('/api/auth/login', 'POST', { email: accountInput.email, name: accountInput.name })
  ).headers
    .get('set-cookie')!
    .split(';')[0]!
  foreignCookie = (
    await request('/api/auth/login', 'POST', {
      email: otherAccount.user.email,
      name: otherAccount.user.name,
    })
  ).headers
    .get('set-cookie')!
    .split(';')[0]!
})
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  db.$client.close()
})
describe.sequential('onboarding HTTP API', () => {
  it('checks session, workspace membership and validates read queries', async () => {
    for (const endpoint of [
      `${path}/onboarding`,
      `${path}/agents`,
      `/api/onboarding/completions?workspaceId=${account.workspace.id}`,
      `/api/onboarding/flows/statuses?workspaceId=${account.workspace.id}`,
      `/api/onboarding/invite-suggestions?workspaceId=${account.workspace.id}`,
    ]) {
      expect((await request(endpoint, 'GET', undefined, { cookie: '' })).status).toBe(401)
      expect((await request(endpoint, 'GET', undefined, { cookie: foreignCookie })).status).toBe(
        404,
      )
    }
    expect((await request('/api/onboarding/completions?workspaceId=invalid')).status).toBe(400)
    expect((await request(`${path}/onboarding`)).status).toBe(200)
    expect(
      await (
        await request(`/api/onboarding/flows/statuses?workspaceId=${account.workspace.id}`)
      ).json(),
    ).toEqual({ data: { statuses: {}, chatIds: {} } })
    expect(
      await (
        await request(`/api/onboarding/invite-suggestions?workspaceId=${account.workspace.id}`)
      ).json(),
    ).toEqual({ success: true, data: { status: 'no_mailbox', data: [] } })
  })
  it('rejects cross-origin writes and malformed simulate bodies', async () => {
    for (const [endpoint, method, body] of [
      ['simulate', 'POST', { kind: 'google' }],
      ['invites', 'POST', { emails: ['friend@example.test'], role: 'member' }],
      ['imports', 'POST', { source: 'hubspot' }],
      ['agents/seed', 'POST', {}],
      ['onboarding', 'PATCH', { action: 'complete' }],
    ] as const) {
      expect(
        (await request(`${path}/${endpoint}`, method, body, { origin: 'https://other.example' }))
          .status,
      ).toBe(403)
      expect(
        (await request(`${path}/${endpoint}`, method, body, { cookie: foreignCookie })).status,
      ).toBe(404)
    }
    expect(
      (await request(`${path}/simulate`, 'POST', { kind: 'notetaker', provider: 'unknown' }))
        .status,
    ).toBe(400)
    expect(
      (await request(`${path}/simulate`, 'POST', { kind: 'google', credits: 999 })).status,
    ).toBe(400)
    expect((await request(`${path}/onboarding`, 'PATCH', { action: 'complete' })).status).toBe(409)
  })
  it('each simulate endpoint completes its own task, updates credits and is retry-safe', async () => {
    for (const [kind, taskKey] of [
      ['google', 'connect_gmail'],
      ['notetaker', 'connect_notetaker'],
      ['linkedin', 'install_extension'],
    ] as const) {
      const body = kind === 'notetaker' ? { kind, provider: 'Granola' } : { kind }
      const result = await request(`${path}/simulate`, 'POST', body)
      expect(result.status).toBe(200)
      expect((await result.json()).completion.taskKey).toBe(taskKey)
      expect((await request(`${path}/simulate`, 'POST', body)).status).toBe(200)
    }
    expect(
      db
        .select()
        .from(s.subscriptions)
        .where(eq(s.subscriptions.workspaceId, account.workspace.id))
        .get()?.topupCreditsRemaining,
    ).toBe(2075)
    expect(db.select().from(s.mailboxes).all()).toHaveLength(1)
    expect(db.select().from(s.calendars).all()).toHaveLength(1)
    expect(
      (
        await (
          await request(`/api/onboarding/invite-suggestions?workspaceId=${account.workspace.id}`)
        ).json()
      ).data.status,
    ).toBe('ready')
  })
  it('normalizes invite emails and preserves uniqueness across requests', async () => {
    expect(
      (await request(`${path}/invites`, 'POST', { emails: ['broken'], role: 'member' })).status,
    ).toBe(400)
    const body = { emails: [' FRIEND@example.test ', 'friend@example.test'], role: 'member' }
    const result = await request(`${path}/invites`, 'POST', body)
    expect((await result.json()).invited).toHaveLength(1)
    expect((await (await request(`${path}/invites`, 'POST', body)).json()).invited).toHaveLength(0)
  })
  it('toggles a workspace agent, completes an import, then finishes onboarding', async () => {
    expect((await request(`${path}/agents/seed`, 'POST', {})).status).toBe(200)
    const catalogue = await (await request(`${path}/agents`)).json()
    expect(catalogue.agents).toHaveLength(6)
    const id = catalogue.agents[0].id
    expect(
      (
        await request(
          `${path}/agents/${id}`,
          'PATCH',
          { enabled: true },
          { origin: 'https://other.example' },
        )
      ).status,
    ).toBe(403)
    expect((await request(`${path}/agents/${id}`, 'PATCH', { enabled: true })).status).toBe(200)
    expect((await request(`${path}/imports`, 'POST', { source: 'csv' })).status).toBe(400)
    const result = await (await request(`${path}/imports`, 'POST', { source: 'attio' })).json()
    expect(result.import.status).toBe('Completed')
    expect(result.import.recordCount).toBe(20)
    const all = await (
      await request(`/api/onboarding/completions?workspaceId=${account.workspace.id}`)
    ).json()
    expect(all.data).toHaveLength(6)
    expect(
      db
        .select()
        .from(s.subscriptions)
        .where(eq(s.subscriptions.workspaceId, account.workspace.id))
        .get()?.topupCreditsRemaining,
    ).toBe(2150)
    expect((await request(`${path}/onboarding`, 'PATCH', { action: 'complete' })).status).toBe(200)
  })
  it('denies member access to workspace mutations and hides workspace tasks via role', async () => {
    db.update(s.memberships)
      .set({ role: 'member' })
      .where(eq(s.memberships.userId, account.user.id))
      .run()
    for (const [endpoint, body] of [
      ['invites', { emails: ['next@example.test'], role: 'member' }],
      ['imports', { source: 'hubspot' }],
      ['agents/seed', {}],
    ] as const)
      expect((await request(`${path}/${endpoint}`, 'POST', body)).status).toBe(403)
    const id = db.select().from(s.agents).get()!.id
    expect((await request(`${path}/agents/${id}`, 'PATCH', { enabled: false })).status).toBe(403)
    expect((await (await request(`${path}/onboarding`)).json()).role).toBe('member')
  })
  it('hides unconfigured Google and rejects invalid OAuth state without contacting Google', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '')
    expect((await (await request(`${path}/onboarding`)).json()).googleAvailable).toBe(false)
    expect(
      (await request(`/api/integrations/google/authorize-url?workspaceId=${account.workspace.id}`))
        .status,
    ).toBe(503)
    expect((await request('/api/integrations/google/callback?state=bad&code=bad')).status).toBe(400)
    vi.unstubAllEnvs()
  })
  it('binds OAuth to a session, uses PKCE, and returns denial without completing a task', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret')
    const response = await request(
      `/api/integrations/google/authorize-url?workspaceId=${otherAccount.workspace.id}`,
      'GET',
      undefined,
      { cookie: foreignCookie },
    )
    expect(response.status).toBe(200)
    const authorization = new URL((await response.json()).url)
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
    const oauthCookie = response.headers.get('set-cookie')!.split(';')[0]!
    const state = authorization.searchParams.get('state')!
    expect(
      (await request(`/api/integrations/google/callback?state=${state}&error=access_denied`))
        .status,
    ).toBe(400)
    const denied = await request(
      `/api/integrations/google/callback?state=${state}&error=access_denied`,
      'GET',
      undefined,
      { cookie: oauthCookie },
    )
    expect(denied.status).toBe(302)
    expect(denied.headers.get('location')).toContain('google_status=denied')
    expect(
      db
        .select()
        .from(s.onboardingTaskCompletions)
        .where(eq(s.onboardingTaskCompletions.workspaceId, otherAccount.workspace.id))
        .all(),
    ).toHaveLength(0)
    vi.unstubAllEnvs()
  })
})
