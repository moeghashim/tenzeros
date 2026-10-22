import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAccount } from '../server/utils/accounts'
import { bootstrapWorkspace } from '../server/utils/bootstrap'
import { chat, LLMError } from '../server/utils/llm'
import { aiContexts, users, workspaces } from '../server/db/schema'
import { realtimeHub } from '../server/utils/realtime'
import { accountInput, testDatabase } from './database'
const db = testDatabase()
afterEach(() => {
  db.delete(workspaces).run()
  db.delete(users).run()
})
describe('asynchronous AI context bootstrap', () => {
  it('stores four contexts from LLM_MOCK and emits each row plus readiness', async () => {
    const { workspace } = createAccount(db, accountInput)
    const receive = vi.fn(),
      off = realtimeHub.subscribe([workspace.id], receive)
    const fetchHomepageText = vi.fn().mockResolvedValue('Acme builds useful tools.')
    await bootstrapWorkspace(db, workspace.id, { fetchHomepageText, chat })
    expect(fetchHomepageText).toHaveBeenCalledWith('example.com')
    expect(db.select().from(aiContexts).all()).toHaveLength(4)
    expect(db.select().from(workspaces).get()?.contextStatus).toBe('ready')
    expect(receive).toHaveBeenCalledTimes(5)
    await bootstrapWorkspace(db, workspace.id, { fetchHomepageText, chat })
    expect(db.select().from(aiContexts).all()).toHaveLength(4)
    off()
  })
  it('continues with explicitly absent evidence when homepage is unavailable', async () => {
    const { workspace } = createAccount(db, accountInput)
    const generate = vi.fn(chat)
    await bootstrapWorkspace(db, workspace.id, {
      fetchHomepageText: async () => '',
      chat: generate,
    })
    expect(generate.mock.calls[0]?.[0].messages[1]?.content).toContain('Homepage unavailable')
    expect(generate.mock.calls[0]?.[0].messages[0]?.content).toContain('Hedge uncertain claims')
    expect(db.select().from(aiContexts).all()).toHaveLength(4)
  })
  it('fails safely on malformed JSON without partial contexts and can be retried', async () => {
    const { workspace } = createAccount(db, accountInput)
    await bootstrapWorkspace(db, workspace.id, {
      fetchHomepageText: async () => '',
      chat: async () => ({ content: '{bad' }),
    })
    expect(db.select().from(aiContexts).all()).toHaveLength(0)
    expect(db.select().from(workspaces).get()?.contextStatus).toBe('failed')
    await bootstrapWorkspace(db, workspace.id, { fetchHomepageText: async () => '', chat })
    expect(db.select().from(aiContexts).all()).toHaveLength(4)
  })
  it('keeps signup successful and surfaces a safe missing-key error', async () => {
    const { workspace } = createAccount(db, accountInput)
    await bootstrapWorkspace(db, workspace.id, {
      fetchHomepageText: async () => '',
      chat: async () => {
        throw new LLMError('MISSING_API_KEY', 'Set DEEPSEEK_API_KEY.')
      },
    })
    expect(db.select().from(workspaces).get()).toMatchObject({
      contextStatus: 'failed',
      contextError: 'Set DEEPSEEK_API_KEY.',
    })
    expect(db.select().from(users).all()).toHaveLength(1)
  })
})
