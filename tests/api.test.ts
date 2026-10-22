import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp, createRouter, defineEventHandler, toNodeListener } from 'h3'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDatabase, accountInput } from './database'
import { aiContexts, memberships, subscriptions, workspaces } from '../server/db/schema'

vi.mock('../server/db', async importOriginal => ({ ...await importOriginal<typeof import('../server/db')>(), getDb: () => db }))
vi.mock('../server/utils/homepage', () => ({ fetchHomepageText: async () => '' }))
import signup from '../server/api/auth/signup.post'
import login from '../server/api/auth/login.post'
import logout from '../server/api/auth/logout.post'
import me from '../server/api/auth/me.get'
import contexts from '../server/api/workspaces/[key]/contexts/index.get'
import editContext from '../server/api/workspaces/[key]/contexts/[id].patch'
import stream from '../server/api/stream.get'
import dismiss from '../server/api/workspaces/[key]/onboarding.patch'
import { emitCustomEvent } from '../server/utils/realtime'
const db = testDatabase()
let server: Server, base: string, cookie: string
const jobs: Promise<unknown>[] = []
beforeAll(async () => {
  const app = createApp()
  app.use(defineEventHandler(event => { event.waitUntil = promise => { jobs.push(promise) } }))
  const router = createRouter()
  router.post('/api/auth/signup', signup).post('/api/auth/login', login).post('/api/auth/logout', logout).get('/api/auth/me', me)
  router.get('/api/workspaces/:key/contexts', contexts).patch('/api/workspaces/:key/contexts/:id', editContext).get('/api/stream', stream).patch('/api/workspaces/:key/onboarding', dismiss)
  app.use(router)
  server = createServer(toNodeListener(app))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => { await Promise.all(jobs); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); db.$client.close() })
const post = (path: string, body: unknown, headers = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
describe.sequential('real h3 API handlers and cookie sessions', () => {
  it('requires a session for account data and SSE', async () => {
    expect((await fetch(`${base}/api/auth/me`)).status).toBe(401)
    expect((await fetch(`${base}/api/stream`)).status).toBe(401)
  })
  it('validates signup and rejects cross-origin writes', async () => {
    expect((await post('/api/auth/signup', { email: 'invalid' })).status).toBe(400)
    expect((await post('/api/auth/signup', accountInput, { origin: 'https://other.example' })).status).toBe(403)
  })
  it('signs up via HTTP, sets an HttpOnly cookie, creates all rows, and bootstraps without blocking', async () => {
    const result = await post('/api/auth/signup', accountInput)
    expect(result.status).toBe(201)
    expect(await result.json()).toEqual({ redirect: '/acme-sales/onboarding' })
    const setCookie = result.headers.get('set-cookie')!
    expect(setCookie).toContain('HttpOnly'); expect(setCookie).toContain('SameSite=Lax')
    cookie = setCookie.split(';')[0]!
    expect(db.select().from(memberships).get()?.role).toBe('admin')
    expect(db.select().from(subscriptions).get()?.topupCreditsRemaining).toBe(2000)
    await Promise.all(jobs)
    expect(db.select().from(aiContexts).all()).toHaveLength(4)
    expect((await fetch(`${base}/api/auth/me`, { headers: { cookie } })).status).toBe(200)
    expect((await post('/api/auth/signup', accountInput)).status).toBe(409)
  })
  it('edits contexts and rejects access from another workspace', async () => {
    const listing = await fetch(`${base}/api/workspaces/acme-sales/contexts`, { headers: { cookie } })
    const body = await listing.json()
    expect(body.contexts).toHaveLength(4)
    const id = body.contexts[0].id
    const updated = await fetch(`${base}/api/workspaces/acme-sales/contexts/${id}`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ content: 'Reviewed company context.' }) })
    expect(updated.status).toBe(200)
    expect((await updated.json()).content).toBe('Reviewed company context.')
    const other = await post('/api/auth/signup', { ...accountInput, email: 'other@example.test', workspaceName: 'Other' })
    const otherCookie = other.headers.get('set-cookie')!.split(';')[0]!
    expect((await fetch(`${base}/api/workspaces/acme-sales/contexts`, { headers: { cookie: otherCookie } })).status).toBe(404)
    expect((await fetch(`${base}/api/workspaces/other/contexts/${id}`, { method: 'PATCH', headers: { cookie: otherCookie, 'content-type': 'application/json' }, body: JSON.stringify({ content: 'Attempted cross-workspace edit' }) })).status).toBe(404)
  })
  it('streams authenticated workspace events over SSE', async () => {
    const controller = new AbortController()
    const response = await fetch(`${base}/api/stream`, { headers: { cookie }, signal: controller.signal })
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const reader = response.body!.getReader()
    const ready = await reader.read()
    expect(new TextDecoder().decode(ready.value)).toContain('event: ready')
    const workspace = db.select().from(workspaces).where(eq(workspaces.key, 'acme-sales')).get()!
    emitCustomEvent(workspace.id, 'testEvent', { ok: true })
    const chunk = await reader.read()
    expect(new TextDecoder().decode(chunk.value)).toContain('testEvent')
    controller.abort()
    await reader.cancel().catch(() => {})
  })
  it('rejects edits by non-admin members', async () => {
    const workspace = db.select().from(workspaces).where(eq(workspaces.key, 'acme-sales')).get()!
    db.update(memberships).set({ role: 'member' }).where(eq(memberships.workspaceId, workspace.id)).run()
    const id = db.select().from(aiContexts).where(eq(aiContexts.workspaceId, workspace.id)).get()!.id
    expect((await fetch(`${base}/api/workspaces/acme-sales/contexts/${id}`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ content: 'Not allowed' }) })).status).toBe(403)
  })
  it('dismisses member onboarding without changing workspace onboarding', async () => {
    const response = await fetch(`${base}/api/workspaces/acme-sales/onboarding`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'dismiss' }) })
    expect(response.status).toBe(200)
    const workspace = db.select().from(workspaces).where(eq(workspaces.key, 'acme-sales')).get()!
    expect(db.select().from(memberships).where(eq(memberships.workspaceId, workspace.id)).get()?.onboardingSkippedAt).toBeTruthy()
    expect(workspace.onboardingSkippedAt).toBeNull()
  })
  it('rejects wrong credentials, signs in and signs out', async () => {
    expect((await post('/api/auth/login', { email: accountInput.email, name: 'Wrong' })).status).toBe(401)
    const loginResponse = await post('/api/auth/login', { email: accountInput.email, name: accountInput.name })
    expect(loginResponse.status).toBe(200)
    const response = await post('/api/auth/logout', {}, { cookie })
    const clearedCookie = response.headers.get('set-cookie')!.split(';')[0]!
    expect(clearedCookie).toBe('tenzeros-session=')
    expect((await fetch(`${base}/api/auth/me`, { headers: { cookie: clearedCookie } })).status).toBe(401)
  })
})
