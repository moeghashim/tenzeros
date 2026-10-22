import type { ChatEvent } from '../../shared/chat'
export async function readChatStream(response: Response, receive: (event: ChatEvent) => void) {
  if (!response.ok || !response.body) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.statusMessage || 'Could not send message. Please retry.')
  }
  const reader = response.body.getReader(),
    decoder = new TextDecoder()
  let buffer = '',
    ended = false
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n')
      let index: number
      while ((index = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
        if (!data) continue
        const event = JSON.parse(data) as ChatEvent
        if (!event.type) continue
        receive(event)
        if (event.type === 'done' || event.type === 'error') ended = true
      }
    }
    if (!ended)
      throw new Error('Connection interrupted. Reopen the chat to recover saved progress.')
  } finally {
    reader.releaseLock()
  }
}
