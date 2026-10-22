import { eq } from 'drizzle-orm'
import { createError } from 'h3'
import type { AppDatabase } from '../db'
import * as s from '../db/schema'
import { streamChat, LLMError, type ChatMessage } from '../utils/llm'
import { requireActor, type Actor } from '../utils/onboarding'
import {
  type ChatEvent,
  type ChatState,
  type ControlResponse,
  type PendingControl,
  type TurnInput,
  controlSchema,
} from '../../shared/chat'
import { persona, flowPrompts } from './flows'
import { dataRule, grounding, untrustedData } from './grounding'
import {
  allowedTools,
  approvalFor,
  domainSchemas,
  executeDomain,
  requireMailbox,
  toolDefinitions,
  type DomainName,
} from './domain-tools'
import { history, saveState, setFlowStatus, assertCurrentFlow, type StoredChat } from './flow-state'
import { importCsv } from './csv-import'
export type Emit = (event: ChatEvent) => void | Promise<void>
export { acquireChat } from './chat-lock'
export function appendMessage(
  db: AppDatabase,
  chat: StoredChat,
  role: 'user' | 'assistant' | 'tool',
  content: string,
  toolCallId?: string,
  toolCalls?: Record<string, unknown>[],
) {
  return db
    .insert(s.chatMessages)
    .values({
      workspaceId: chat.workspaceId,
      chatId: chat.id,
      role,
      content,
      toolCallId,
      toolCalls,
    })
    .returning()
    .get()
}
const requiredEffects: Record<string, string[]> = {
  'pipeline-and-lists': ['create_pipeline_stages', 'create_list'],
  'activate-agents': ['enable_agents'],
  'existing-customers': ['create_list'],
  'target-account-list': ['score_accounts'],
  'start-outreach': ['create_sequence'],
  'personalize-emails': ['save_writing_style'],
  'csv-import': ['import_csv'],
}
function canFinish(chat: StoredChat) {
  return (requiredEffects[chat.flowKey || ''] || ['unsupported']).every((name) =>
    chat.state.effects?.includes(name),
  )
}
function finish(db: AppDatabase, actor: Actor, chat: StoredChat) {
  if (!canFinish(chat)) throw new Error('Complete the setup work before finishing the walkthrough.')
  setFlowStatus(db, actor, chat, 'completed')
  chat.state.completed = true
}
export function installControl(db: AppDatabase, chat: StoredChat, pending: PendingControl) {
  chat.state.activeControl = pending
  chat.state.currentStep =
    pending.control.stepKey && pending.control.moveOnLabel
      ? {
          key: pending.control.stepKey,
          mode: 'milestone',
          moveOnLabel: pending.control.moveOnLabel,
          finishesFlow: pending.finishesFlow,
        }
      : undefined
  saveState(db, chat.id, chat.state)
}
export function validateAnswer(pending: PendingControl, answer: ControlResponse) {
  const control = pending.control
  if (answer.toolCallId !== pending.id || answer.kind !== control.kind)
    throw createError({ statusCode: 409, statusMessage: 'This control is no longer active' })
  if (answer.kind === 'choice' && control.kind === 'choice') {
    if (
      new Set(answer.selectedOptionIds).size !== answer.selectedOptionIds.length ||
      answer.selectedOptionIds.some((id) => !control.options.some((o) => o.id === id)) ||
      (control.selectionMode === 'single' && answer.selectedOptionIds.length > 1) ||
      (!answer.selectedOptionIds.length && !answer.otherText) ||
      (answer.otherText && !control.allowOther)
    )
      throw createError({ statusCode: 400, statusMessage: 'Invalid choice' })
  }
  if (
    answer.kind === 'menu' &&
    control.kind === 'menu' &&
    answer.action === 'visit' &&
    !control.items.some((item) => item.id === answer.itemId)
  )
    throw createError({ statusCode: 400, statusMessage: 'Invalid menu item' })
}
function visibleAnswer(pending: PendingControl, answer: ControlResponse) {
  const c = pending.control
  if (answer.kind === 'choice' && c.kind === 'choice')
    return [
      ...c.options.filter((o) => answer.selectedOptionIds.includes(o.id)).map((o) => o.label),
      answer.otherText,
    ]
      .filter(Boolean)
      .join(', ')
  return 'responseText' in answer ? answer.responseText : 'Answered'
}
export function validateTurn(chat: StoredChat, input: TurnInput) {
  const pending = chat.state.activeControl
  if (chat.state.completed)
    throw createError({
      statusCode: 409,
      statusMessage: 'Walkthrough completed. Start from beginning to create another.',
    })
  if (input.onboardingResponse) {
    if (!pending) throw createError({ statusCode: 409, statusMessage: 'No active control' })
    validateAnswer(pending, input.onboardingResponse)
  }
  if (
    input.onboardingAdvance &&
    (!pending ||
      input.onboardingAdvance.stepKey !== chat.state.currentStep?.key ||
      pending.action ||
      pending.control.kind !== 'continue')
  )
    throw createError({ statusCode: 409, statusMessage: 'No matching milestone' })
  if (input.content && pending && pending.control.kind !== 'conversation')
    throw createError({ statusCode: 409, statusMessage: 'Answer the current control first' })
  if (input.onboardingFinish && !pending?.finishesFlow)
    throw createError({ statusCode: 400, statusMessage: 'This control does not finish the flow' })
  if (
    pending?.finishesFlow &&
    (input.onboardingResponse || input.onboardingAdvance || input.content) &&
    !input.onboardingFinish
  )
    throw createError({ statusCode: 400, statusMessage: 'Confirm finishing this walkthrough' })
  if (input.retry && !chat.state.error)
    throw createError({ statusCode: 409, statusMessage: 'There is no failed turn to retry' })
}
async function resolveControl(
  db: AppDatabase,
  actor: Actor,
  chat: StoredChat,
  input: TurnInput,
  emit: Emit,
) {
  const pending = chat.state.activeControl!
  const answer =
    input.onboardingResponse ||
    (input.onboardingAdvance
      ? { kind: 'continue' as const, toolCallId: pending.id, responseText: 'Let’s move on.' }
      : { kind: 'conversation' as const, toolCallId: pending.id, responseText: input.content! })
  validateAnswer(pending, answer)
  let result: unknown = answer
  if (pending.action) {
    const approved = answer.kind === 'choice' && answer.selectedOptionIds.includes('approve')
    if (approved) {
      result =
        pending.action.name === 'import_csv'
          ? importCsv(db, actor, chat.id, String(pending.action.args.importId))
          : await executeDomain(db, actor, pending.action.name as DomainName, pending.action.args)
      chat.state.effects = [...new Set([...(chat.state.effects || []), pending.action.name])]
    } else result = { rejected: true, answer }
  }
  if (pending.finishesFlow) finish(db, actor, chat)
  // Tool result must immediately follow its assistant tool call in DeepSeek history.
  appendMessage(db, chat, 'tool', untrustedData(result), pending.id)
  appendMessage(db, chat, 'user', visibleAnswer(pending, answer))
  chat.state.activeControl = undefined
  chat.state.currentStep = undefined
  saveState(db, chat.id, chat.state)
  await emit({ type: 'tool_call_result', id: pending.id, result })
  if (pending.action?.name === 'import_csv') {
    if (chat.state.effects?.includes('import_csv')) {
      appendMessage(
        db,
        chat,
        'assistant',
        'Your import is complete. The records are in your workspace and your import task is complete.',
      )
      finish(db, actor, chat)
      saveState(db, chat.id, chat.state)
    } else
      appendMessage(db, chat, 'assistant', 'Mapping declined. Upload a revised CSV to try again.')
  }
}
export async function runTurn(
  db: AppDatabase,
  actor: Actor,
  chat: StoredChat,
  input: TurnInput,
  emit: Emit,
  signal?: AbortSignal,
) {
  try {
    requireActor(db, actor)
    assertCurrentFlow(db, chat)
    validateTurn(chat, input)
    if (['start-outreach', 'personalize-emails'].includes(chat.flowKey!)) requireMailbox(db, actor)
    if (
      input.start &&
      (chat.state.started || chat.state.activeControl || chat.flowKey === 'csv-import')
    ) {
      await emit({ type: 'done', state: chat.state })
      return
    }
    chat.state.error = undefined
    if (chat.state.activeControl)
      await resolveControl(db, actor, chat, input.retry ? chat.state.failedInput! : input, emit)
    else if (input.content) appendMessage(db, chat, 'user', input.content)
    if (chat.state.completed || chat.flowKey === 'csv-import') {
      await emit({ type: 'done', state: chat.state })
      return
    }
    chat.state.started = true
    saveState(db, chat.id, chat.state)
    setFlowStatus(db, actor, chat, 'in_progress')
    const system = `${persona}\n${dataRule}\n${grounding(db, actor.workspaceId)}\n${flowPrompts[chat.flowKey as keyof typeof flowPrompts]}`
    for (let round = 0; round < 8; round++) {
      requireActor(db, actor)
      assertCurrentFlow(db, chat)
      const messages: ChatMessage[] = [
        { role: 'system', content: system },
        ...(history(db, chat.id).map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.toolCalls ? { tool_calls: m.toolCalls } : {}),
          ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
        })) as ChatMessage[]),
      ]
      if (messages.length === 1) messages.push({ role: 'user', content: 'Begin the walkthrough.' })
      let content = ''
      const calls = new Map<
        number,
        { id: string; type: 'function'; function: { name: string; arguments: string } }
      >()
      for await (const delta of streamChat({
        messages,
        tools: toolDefinitions(chat.flowKey),
        signal,
      })) {
        if (delta.content) {
          content += delta.content
          await emit({ type: 'text_delta', text: delta.content })
        }
        for (const t of delta.tool_calls || []) {
          const call = calls.get(t.index) || {
            id: '',
            type: 'function',
            function: { name: '', arguments: '' },
          }
          if (t.id) call.id = t.id
          if (t.function?.name) call.function.name += t.function.name
          if (t.function?.arguments) call.function.arguments += t.function.arguments
          calls.set(t.index, call)
        }
      }
      if (!content && !calls.size)
        throw new LLMError('INVALID_RESPONSE', 'DeepSeek returned an empty response. Please retry.')
      const toolCalls = [...calls.values()]
      appendMessage(
        db,
        chat,
        'assistant',
        content,
        undefined,
        toolCalls.length ? toolCalls : undefined,
      )
      for (const call of toolCalls) {
        await emit({ type: 'tool_call_start', id: call.id, name: call.function.name })
        try {
          requireActor(db, actor)
          assertCurrentFlow(db, chat)
          const name = call.function.name as DomainName
          if (!allowedTools(chat.flowKey).includes(name))
            throw new Error('Tool not available for this flow')
          const args = domainSchemas[name].parse(JSON.parse(call.function.arguments))
          const approval = approvalFor(name, args)
          if (name === 'present_onboarding_control' || name === 'complete_flow' || approval) {
            if (toolCalls.length !== 1)
              throw new Error('Blocking controls must be called alone. Retry this control alone.')
            const control =
              name === 'complete_flow'
                ? {
                    kind: 'continue' as const,
                    label: 'Finish walkthrough and return to onboarding',
                    finishesFlow: true,
                  }
                : approval?.control || controlSchema.parse(args)
            if (control.finishesFlow && !canFinish(chat))
              throw new Error('Complete the domain work before finishing.')
            const pending: PendingControl = {
              id: call.id,
              control,
              finishesFlow: Boolean(control.finishesFlow),
              ...(approval ? { action: { name, args }, display: approval.display } : {}),
            }
            installControl(db, chat, pending)
            await emit({ type: 'control', control: pending })
            await emit({ type: 'done', state: chat.state })
            return
          }
          const result = await executeDomain(db, actor, name, args)
          chat.state.effects = [...new Set([...(chat.state.effects || []), name])]
          appendMessage(db, chat, 'tool', untrustedData(result), call.id)
          saveState(db, chat.id, chat.state)
          await emit({ type: 'tool_call_result', id: call.id, result })
        } catch (error) {
          const result = {
            error:
              error instanceof LLMError
                ? error.message
                : error instanceof Error
                  ? error.message.slice(0, 400)
                  : 'Tool failed',
          }
          appendMessage(db, chat, 'tool', untrustedData(result), call.id)
          await emit({ type: 'tool_call_result', id: call.id, result })
          if (error instanceof LLMError) throw error
        }
      }
      if (!calls.size) {
        await emit({ type: 'done', state: chat.state })
        return
      }
    }
    throw new LLMError(
      'REQUEST_FAILED',
      'The assistant reached the 8-round tool limit. Retry to continue from the saved progress.',
    )
  } catch (error) {
    const message =
      error instanceof LLMError
        ? error.message
        : 'Could not finish this turn. Your progress is saved. Please retry.'
    chat.state.error = message
    if (!input.retry) chat.state.failedInput = input
    saveState(db, chat.id, chat.state)
    await emit({ type: 'error', message, retryable: true })
  }
}
