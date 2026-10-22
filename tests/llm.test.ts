import { afterEach, describe, expect, it, vi } from 'vitest'
import { chat, streamChat, LLMError, type ChatTool } from '../server/utils/llm'
import { generatedContextsSchema } from '../shared/validation'
import { testRuntimeConfig } from './runtime-config'
const messages = [{ role: 'user' as const, content: 'Hello' }]
afterEach(() => { vi.unstubAllEnvs(); testRuntimeConfig.llmMock = true; testRuntimeConfig.deepseekApiKey = '' })
describe('single LLM adapter', () => {
  it('returns deterministic text without any key or network', async () => {
    expect(process.env.LLM_MOCK).toBe('1')
    expect(await chat({ messages })).toEqual(await chat({ messages }))
    expect((await chat({ messages })).content).toContain('deterministic mock')
  })
  it('returns schema-valid deterministic JSON for bootstrap', async () => {
    const result = await chat({ messages, json: true })
    expect(generatedContextsSchema.parse(JSON.parse(result.content!)).contexts).toHaveLength(4)
  })
  it('streams text and function-call deltas', async () => {
    let text = ''
    for await (const delta of streamChat({ messages })) text += delta.content ?? ''
    expect(text).toBe((await chat({ messages })).content)
    const tools: ChatTool[] = [{ type: 'function', function: { name: 'demo_tool', parameters: { type: 'object', properties: {} } } }]
    const deltas = []
    for await (const delta of streamChat({ messages, tools })) deltas.push(delta)
    expect(deltas[0]?.tool_calls?.[0]).toMatchObject({ index: 0, id: 'mock-tool-1', function: { name: 'demo_tool', arguments: '{}' } })
    expect((await chat({ messages, tools })).tool_calls).toHaveLength(1)
  })
  it('reports a typed configuration error in real mode, including streaming', async () => {
    testRuntimeConfig.llmMock = false
    vi.stubEnv('LLM_MOCK', '0')
    vi.stubEnv('DEEPSEEK_API_KEY', '')
    await expect(chat({ messages })).rejects.toMatchObject({ name: 'LLMError', code: 'MISSING_API_KEY' })
    await expect(streamChat({ messages }).next()).rejects.toBeInstanceOf(LLMError)
  })
})
