import { defineEventHandler, getRequestWebStream, getHeader, createError } from 'h3'
import { requireChat, assertCurrentFlow, setFlowStatus } from '../../../ai/flow-state'
import { requireSameOrigin } from '../../../utils/auth'
import { acquireChat, appendMessage, installControl } from '../../../ai/chat-engine'
import { prepareCsv } from '../../../ai/csv-import'
import { LLMError } from '../../../utils/llm'
export default defineEventHandler(async (event) => {
  requireSameOrigin(event)
  const { db, chat, actor } = await requireChat(event)
  assertCurrentFlow(db, chat)
  if (chat.flowKey !== 'csv-import' || chat.state.activeControl || chat.state.completed)
    throw createError({ statusCode: 409, statusMessage: 'This chat is not awaiting an upload' })
  const release = acquireChat(chat.id)
  try {
    const max = 5 * 1024 * 1024 + 16384
    if (Number(getHeader(event, 'content-length') || 0) > max)
      throw new Error('CSV upload exceeds 5 MB.')
    const source = getRequestWebStream(event)
    if (!source) throw new Error('Upload one CSV file.')
    const reader = source.getReader(),
      chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > max) {
        void reader.cancel()
        throw new Error('CSV upload exceeds 5 MB.')
      }
      chunks.push(part.value)
    }
    const body = Buffer.concat(chunks)
    const form = await new Response(body, {
      headers: { 'content-type': getHeader(event, 'content-type') || '' },
    }).formData()
    const file = form.get('file')
    if (
      [...form.keys()].length !== 1 ||
      !file ||
      typeof file === 'string' ||
      ![
        'text/csv',
        'application/csv',
        'application/vnd.ms-excel',
        'application/octet-stream',
        '',
      ].includes(file.type)
    )
      throw new Error('Upload one CSV file.')
    const { job, display } = await prepareCsv(
      db,
      actor,
      chat.id,
      file.name,
      Buffer.from(await file.arrayBuffer()),
    )
    const id = `csv-${crypto.randomUUID()}`
    const pending = {
      id,
      control: {
        kind: 'choice' as const,
        prompt: 'Confirm this mapping and import all rows?',
        selectionMode: 'single' as const,
        options: [
          { id: 'approve', label: 'Confirm mapping and import' },
          { id: 'revise', label: 'Cancel and upload again' },
        ],
      },
      finishesFlow: false,
      action: { name: 'import_csv', args: { importId: job.id } },
      display,
    }
    appendMessage(db, chat, 'assistant', '', undefined, [
      {
        id,
        type: 'function',
        function: {
          name: 'present_onboarding_control',
          arguments: JSON.stringify(pending.control),
        },
      },
    ])
    installControl(db, chat, pending)
    setFlowStatus(db, actor, chat, 'in_progress')
    return { data: { control: pending } }
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage:
        error instanceof LLMError
          ? error.message
          : error instanceof Error
            ? error.message.slice(0, 200)
            : 'CSV upload failed. Please retry.',
    })
  } finally {
    release()
  }
})
