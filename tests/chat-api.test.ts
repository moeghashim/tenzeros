import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp, createRouter, toNodeListener } from 'h3'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { testDatabase, accountInput } from './database'
import { createAccount } from '../server/utils/accounts'
import { withMockScript, type ChatResult } from '../server/utils/llm'
import * as s from '../server/db/schema'
vi.mock('../server/db', async (original) => ({
  ...(await original<typeof import('../server/db')>()),
  getDb: () => db,
}))
import login from '../server/api/auth/login.post'
import start from '../server/api/onboarding/flows/start.post'
import getChat from '../server/api/chats/[id]/index.get'
import messages from '../server/api/chats/[id]/messages.post'
import upload from '../server/api/chats/[id]/upload.post'
import statuses from '../server/api/onboarding/flows/statuses.get'
import status from '../server/api/onboarding/flows/status.get'
const db = testDatabase(),
  account = createAccount(db, accountInput)
const other = createAccount(db, {
  ...accountInput,
  email: 'foreign@example.test',
  workspaceName: 'Foreign',
})
let server: Server,
  base: string,
  cookie = '',
  foreignCookie = '',
  script: ChatResult[] | undefined
const request = (path: string, body?: unknown, auth = cookie, origin = base) =>
  fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      cookie: auth,
      origin,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
beforeAll(async () => {
  const app = createApp(),
    router = createRouter()
  router
    .post('/api/auth/login', login)
    .post('/api/onboarding/flows/start', start)
    .get('/api/onboarding/flows/statuses', statuses)
    .get('/api/onboarding/flows/status', status)
    .get('/api/chats/:id', getChat)
    .post('/api/chats/:id/messages', messages)
    .post('/api/chats/:id/upload', (event) =>
      script ? withMockScript(script, () => upload(event)) : upload(event),
    )
  app.use(router)
  server = createServer(toNodeListener(app))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  cookie = (
    await request('/api/auth/login', { email: account.user.email, name: account.user.name })
  ).headers
    .get('set-cookie')!
    .split(';')[0]!
  foreignCookie = (
    await request('/api/auth/login', { email: other.user.email, name: other.user.name })
  ).headers
    .get('set-cookie')!
    .split(';')[0]!
})
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()))
  db.$client.close()
})
async function startChat(flowKey = 'activate-agents') {
  const res = await request('/api/onboarding/flows/start', {
    workspaceId: account.workspace.id,
    flowKey,
    mode: 'restart',
  })
  expect(res.status).toBe(200)
  return (await res.json()).data.chatId as string
}
async function turn(id: string, input: unknown) {
  const res = await request(`/api/chats/${id}/messages`, input)
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toContain('text/event-stream')
  return (await res.text())
    .split('\n\n')
    .flatMap((f) => {
      const line = f.split('\n').find((l) => l.startsWith('data:'))
      return line ? [JSON.parse(line.slice(5))] : []
    })
    .filter((e) => e.type)
}
describe.sequential('chat HTTP endpoints', () => {
  it('checks session, ownership, membership, origin and input before streaming', async () => {
    const id = await startChat()
    for (const [path, body] of [
      [`/api/chats/${id}`, undefined],
      [`/api/chats/${id}/messages`, { start: true }],
      [`/api/onboarding/flows/status?chatId=${id}`, undefined],
      [`/api/onboarding/flows/statuses?workspaceId=${account.workspace.id}`, undefined],
    ] as const) {
      expect((await request(path, body, '')).status).toBe(401)
      expect((await request(path, body, foreignCookie)).status).toBe(404)
    }
    expect(
      (await request(`/api/chats/${id}/messages`, { start: true }, cookie, 'https://evil.test'))
        .status,
    ).toBe(403)
    expect(
      (
        await request(
          '/api/onboarding/flows/start',
          { workspaceId: account.workspace.id, flowKey: 'activate-agents', mode: 'restart' },
          cookie,
          'https://evil.test',
        )
      ).status,
    ).toBe(403)
    expect(
      (
        await request(`/api/chats/${id}/messages`, {
          content: 'x',
          workspaceId: other.workspace.id,
        })
      ).status,
    ).toBe(400)
    expect((await request(`/api/chats/${id}/messages`, { content: 'x', start: true })).status).toBe(
      400,
    )
    expect((await request('/api/chats/not-an-id')).status).toBe(400)
    expect((await request(`/api/onboarding/flows/status?chatId=bad`)).status).toBe(400)
    const sameWorkspaceUser = db
      .insert(s.users)
      .values({ name: 'Colleague', email: 'colleague@test.test' })
      .returning()
      .get()
    db.insert(s.memberships)
      .values({
        workspaceId: account.workspace.id,
        userId: sameWorkspaceUser.id,
        status: 'active',
        role: 'admin',
      })
      .run()
    const colleagueCookie = (
      await request('/api/auth/login', {
        name: sameWorkspaceUser.name,
        email: sameWorkspaceUser.email,
      })
    ).headers
      .get('set-cookie')!
      .split(';')[0]!
    expect((await request(`/api/chats/${id}`, undefined, colleagueCookie)).status).toBe(404)
  })
  it('completes the agents flow via streamed control-answer tool results and persisted status', async () => {
    const id = await startChat()
    const opening = await turn(id, { start: true })
    const first = opening.find((e) => e.type === 'control').control
    expect(first.control.label).toBe('Start setup')
    const second = await turn(id, {
      onboardingResponse: { kind: 'continue', toolCallId: first.id, responseText: 'Start setup' },
    })
    expect(second.some((e) => e.type === 'tool_call_result')).toBe(true)
    const choice = second.find((e) => e.type === 'control').control
    expect(choice.control.options).toHaveLength(6)
    const third = await turn(id, {
      onboardingResponse: {
        kind: 'choice',
        toolCallId: choice.id,
        selectedOptionIds: [choice.control.options[0].id],
      },
    })
    const finish = third.find((e) => e.type === 'control').control
    expect(finish.finishesFlow).toBe(true)
    expect(
      (
        await request(`/api/chats/${id}/messages`, {
          onboardingResponse: { kind: 'continue', toolCallId: finish.id, responseText: 'Finish' },
        })
      ).status,
    ).toBe(400)
    const end = await turn(id, {
      onboardingResponse: { kind: 'continue', toolCallId: finish.id, responseText: 'Finish' },
      onboardingFinish: true,
    })
    expect(end.at(-1)).toMatchObject({ type: 'done', state: { completed: true } })
    const list = await (
      await request(`/api/onboarding/flows/statuses?workspaceId=${account.workspace.id}`)
    ).json()
    expect(list.data.statuses['activate-agents']).toBe('completed')
    expect(
      (await (await request(`/api/chats/${id}`)).json()).data.messages.some(
        (m: { role: string }) => m.role === 'tool',
      ),
    ).toBe(true)
  })
  it('uploads CSV, confirms mapping, imports and completes; rejects foreign uploads', async () => {
    const id = await startChat('csv-import')
    const form = () => {
      const body = new FormData()
      body.set(
        'file',
        new File(['Company,Person\nAcme,Alex\n'], 'records.csv', { type: 'text/csv' }),
      )
      return body
    }
    const url = `${base}/api/chats/${id}/upload`
    expect(
      (
        await fetch(url, {
          method: 'POST',
          headers: { cookie: foreignCookie, origin: base },
          body: form(),
        })
      ).status,
    ).toBe(404)
    expect(
      (
        await fetch(url, {
          method: 'POST',
          headers: { cookie, origin: 'https://evil.test' },
          body: form(),
        })
      ).status,
    ).toBe(403)
    script = [
      {
        content: JSON.stringify({
          columns: [
            { index: 0, field: 'company.name' },
            { index: 1, field: 'contact.name' },
          ],
        }),
      },
    ]
    const response = await fetch(url, {
      method: 'POST',
      headers: { cookie, origin: base },
      body: form(),
    })
    expect(response.status).toBe(200)
    const pending = (await response.json()).data.control
    expect(pending.display).toContain('company.name')
    const result = await turn(id, {
      onboardingResponse: {
        kind: 'choice',
        toolCallId: pending.id,
        selectedOptionIds: ['approve'],
      },
    })
    expect(result.at(-1)).toMatchObject({ type: 'done', state: { completed: true } })
    expect(db.select().from(s.imports).get()).toMatchObject({ status: 'Completed', recordCount: 2 })
    expect(
      (await fetch(url, { method: 'POST', headers: { cookie, origin: base }, body: form() }))
        .status,
    ).toBe(409)
    script = undefined
  })
})
