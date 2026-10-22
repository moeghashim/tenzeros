import { afterEach, expect, it, vi } from 'vitest'
const create = vi.hoisted(() => vi.fn())
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } }
  },
}))
import { streamChat } from '../server/utils/llm'

afterEach(() => {
  vi.unstubAllEnvs()
  create.mockReset()
})
it('sanitizes a real-adapter failure after delivering the first provider delta', async () => {
  vi.stubEnv('LLM_MOCK', '0')
  vi.stubEnv('DEEPSEEK_API_KEY', 'test-placeholder')
  create.mockResolvedValue(
    (async function* () {
      yield { choices: [{ delta: { content: 'Partial answer' } }] }
      throw new Error('upstream credentials and request details must not escape')
    })(),
  )
  const stream = streamChat({ messages: [{ role: 'user', content: 'Hello' }] })
  expect(await stream.next()).toMatchObject({ value: { content: 'Partial answer' } })
  await expect(stream.next()).rejects.toMatchObject({
    code: 'REQUEST_FAILED',
    message: 'DeepSeek streaming was interrupted. Please retry.',
  })
})
