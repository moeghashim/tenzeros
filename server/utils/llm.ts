import OpenAI from 'openai'
import { AsyncLocalStorage } from 'node:async_hooks'
import { llmRuntimeConfig } from './runtime'
import { contextNames } from '../../shared/validation'

export type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam
export type ChatTool = OpenAI.Chat.Completions.ChatCompletionTool
export type ChatResult = Pick<
  OpenAI.Chat.Completions.ChatCompletionMessage,
  'content' | 'tool_calls'
>
export type ChatDelta = OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta
export type ChatOptions = {
  messages: ChatMessage[]
  tools?: ChatTool[]
  json?: boolean
  signal?: AbortSignal
}
export class LLMError extends Error {
  constructor(
    public readonly code: 'MISSING_API_KEY' | 'REQUEST_FAILED' | 'INVALID_RESPONSE',
    message: string,
  ) {
    super(message)
    this.name = 'LLMError'
  }
}
const config = llmRuntimeConfig
function client() {
  const settings = config()
  if (!settings.deepseekApiKey)
    throw new LLMError('MISSING_API_KEY', 'Set DEEPSEEK_API_KEY to generate workspace context.')
  return new OpenAI({
    apiKey: settings.deepseekApiKey,
    baseURL: settings.deepseekBaseUrl,
    timeout: 60000,
    maxRetries: 1,
  })
}
type MockStep = ChatResult | Error | ((options: ChatOptions) => ChatResult)
const scripts = new AsyncLocalStorage<MockStep[]>()
/** Request-local test scripts. Never changes real-provider behavior. */
export function withMockScript<T>(steps: MockStep[], run: () => T): T {
  return scripts.run([...steps], run)
}
function mockCall(name: string, args: unknown): ChatResult {
  return {
    content: null,
    tool_calls: [
      {
        id: `mock-${crypto.randomUUID()}`,
        type: 'function',
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  }
}
function mockResult(options: ChatOptions): ChatResult {
  const script = scripts.getStore()
  if (script) {
    const step = script.shift()
    if (!step) throw new LLMError('INVALID_RESPONSE', 'Mock script exhausted')
    if (step instanceof Error) throw step
    return typeof step === 'function' ? step(options) : step
  }
  if (options.tools?.some((t) => t.type === 'function' && t.function.name === 'enable_agents')) {
    const calls = options.messages.flatMap((m) =>
      m.role === 'assistant' ? (m.tool_calls || []).filter((t) => t.type === 'function') : [],
    )
    const has = (name: string) =>
      calls.some((t) => t.type === 'function' && t.function.name === name)
    if (!calls.length)
      return mockCall('present_onboarding_control', { kind: 'continue', label: 'Start setup' })
    if (!has('list_agents')) return mockCall('list_agents', {})
    const listCall = calls.find((t) => t.type === 'function' && t.function.name === 'list_agents')!
    const result = options.messages.find((m) => m.role === 'tool' && m.tool_call_id === listCall.id)
    const agents = JSON.parse(
      String(result?.content)
        .split('UNTRUSTED_DATA_JSON_BEGIN\n')[1]!
        .split('\nUNTRUSTED_DATA_JSON_END')[0]!,
    ) as { id: string; name: string }[]
    if (
      calls.filter((t) => t.type === 'function' && t.function.name === 'present_onboarding_control')
        .length === 1
    )
      return mockCall('present_onboarding_control', {
        kind: 'choice',
        prompt: 'Which agents would you like to enable?',
        selectionMode: 'multiple',
        options: agents.map((a) => ({ id: a.id, label: a.name })),
      })
    if (!has('enable_agents')) {
      const answer = [...options.messages]
        .reverse()
        .find((m) => m.role === 'tool' && String(m.content).includes('selectedOptionIds'))
      const selected = JSON.parse(
        String(answer?.content)
          .split('UNTRUSTED_DATA_JSON_BEGIN\n')[1]!
          .split('\nUNTRUSTED_DATA_JSON_END')[0]!,
      )
      return mockCall('enable_agents', { agentIds: selected.selectedOptionIds })
    }
    return mockCall('complete_flow', {})
  }
  if (options.json)
    return {
      content: JSON.stringify({
        contexts: contextNames.map((name) => ({
          name,
          content: `This is a deterministic demo ${name.toLowerCase()} for Tenzeros. Available information is limited, so these suggestions should be reviewed.\n\nThe workspace may benefit from a focused customer discovery process. Specific claims and customer relationships are unverified.`,
        })),
      }),
    }
  const tool = options.tools?.find((t) => t.type === 'function')
  if (tool?.type === 'function')
    return {
      content: null,
      tool_calls: [
        {
          id: 'mock-tool-1',
          type: 'function',
          function: { name: tool.function.name, arguments: '{}' },
        },
      ],
    }
  return { content: 'Hello from the Tenzeros deterministic mock.' }
}
export async function chat(options: ChatOptions): Promise<ChatResult> {
  if (config().llmMock) return mockResult(options)
  try {
    const result = await client().chat.completions.create(
      {
        model: config().deepseekModel,
        messages: options.messages,
        tools: options.tools,
        ...(options.json ? { response_format: { type: 'json_object' as const } } : {}),
        max_tokens: 3000,
      },
      { signal: options.signal },
    )
    const message = result.choices[0]?.message
    if (!message || result.choices[0]?.finish_reason === 'length')
      throw new LLMError(
        'INVALID_RESPONSE',
        'DeepSeek returned an incomplete response. Please retry.',
      )
    return message
  } catch (error) {
    if (error instanceof LLMError) throw error
    // Do not propagate SDK errors: they can contain request details or credentials.
    throw new LLMError('REQUEST_FAILED', 'DeepSeek is unavailable. Please retry shortly.')
  }
}
export async function* streamChat(options: ChatOptions): AsyncGenerator<ChatDelta> {
  if (config().llmMock) {
    const result = mockResult(options)
    if (result.content)
      for (const content of result.content.match(/.{1,12}/gs) ?? []) yield { content }
    for (const [index, tool] of (result.tool_calls ?? []).entries())
      if (tool.type === 'function')
        yield { tool_calls: [{ index, id: tool.id, type: 'function', function: tool.function }] }
    return
  }
  try {
    const stream = await client().chat.completions.create(
      {
        model: config().deepseekModel,
        messages: options.messages,
        tools: options.tools,
        stream: true,
        ...(options.json ? { response_format: { type: 'json_object' as const } } : {}),
      },
      { signal: options.signal },
    )
    for await (const chunk of stream) {
      if (chunk.choices[0]?.finish_reason === 'length')
        throw new LLMError(
          'INVALID_RESPONSE',
          'DeepSeek returned an incomplete response. Please retry.',
        )
      if (chunk.choices[0]?.delta) yield chunk.choices[0].delta
    }
  } catch (error) {
    if (error instanceof LLMError) throw error
    throw new LLMError('REQUEST_FAILED', 'DeepSeek streaming was interrupted. Please retry.')
  }
}
