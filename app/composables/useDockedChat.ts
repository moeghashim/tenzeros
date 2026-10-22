import type { ChatState, StoredMessage, TurnInput, ControlResponse, ChatEvent } from '#shared/chat'
import { readChatStream } from '../utils/chat-stream'
export function useDockedChat(props: { workspaceKey: string; workspaceId: string }) {
  const surface = useChatSurface()
  const messages = ref<StoredMessage[]>([]),
    state = ref<ChatState>({ revision: 0 }),
    title = ref('Tenzeros'),
    flowKey = ref(''),
    busy = ref(false),
    loading = ref(false),
    error = ref(''),
    streamed = ref(''),
    toolLabel = ref(''),
    scroller = ref<HTMLElement>()
  let abort: AbortController | undefined
  async function load(id: string) {
    const result = await $fetch(`/api/chats/${id}`)
    if (surface.chatId.value !== id) return
    if (result.data.chat.workspaceId !== props.workspaceId) {
      surface.close()
      return
    }
    messages.value = result.data.messages
    state.value = result.data.chat.state
    title.value = result.data.chat.title
    flowKey.value = result.data.chat.flowKey || ''
    error.value = state.value.error || ''
  }
  async function completed() {
    if (!state.value.completed) return
    surface.pendingFlowCelebration.value = flowKey.value
    surface.close()
    await navigateTo(`/${props.workspaceKey}/onboarding`)
  }
  async function send(input: TurnInput) {
    const id = surface.chatId.value
    if (!id || busy.value) return
    busy.value = true
    error.value = ''
    streamed.value = ''
    abort = new AbortController()
    try {
      const response = await fetch(`/api/chats/${id}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal: abort.signal,
      })
      await readChatStream(response, (event: ChatEvent) => {
        if (surface.chatId.value !== id) return
        if (event.type === 'text_delta') streamed.value += event.text
        if (event.type === 'tool_call_start') toolLabel.value = event.name.replaceAll('_', ' ')
        if (event.type === 'control') state.value.activeControl = event.control
        if (event.type === 'done') state.value = event.state
        if (event.type === 'error') error.value = event.message
      })
      if (surface.chatId.value === id) {
        await load(id)
        await completed()
      }
    } catch (cause) {
      if (surface.chatId.value === id)
        error.value = cause instanceof Error ? cause.message : 'Connection failed. Please retry.'
    } finally {
      if (surface.chatId.value === id) {
        busy.value = false
        streamed.value = ''
        toolLabel.value = ''
      }
    }
  }
  async function answer(answer: ControlResponse) {
    const control = state.value.activeControl?.control
    await send({
      onboardingResponse: answer,
      ...(state.value.activeControl?.finishesFlow ? { onboardingFinish: true } : {}),
    })
    if (
      control &&
      'path' in control &&
      control.path &&
      control.path.startsWith(`/${props.workspaceKey}/`)
    )
      await navigateTo(control.path)
  }
  function advance() {
    const step = state.value.currentStep
    if (step && !busy.value)
      void send({
        onboardingAdvance: { stepKey: step.key },
        ...(step.finishesFlow ? { onboardingFinish: true } : {}),
      })
  }
  function keyboard(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') {
      e.preventDefault()
      advance()
    }
  }
  watch(
    surface.chatId,
    async (id) => {
      abort?.abort()
      busy.value = false
      error.value = ''
      messages.value = []
      streamed.value = ''
      state.value = { revision: 0 }
      if (!id) return
      loading.value = true
      try {
        await load(id)
        if (
          surface.chatId.value === id &&
          !state.value.started &&
          flowKey.value !== 'csv-import' &&
          !state.value.completed
        )
          await send({ start: true })
      } catch {
        error.value = 'Could not load this chat. Please reopen it.'
      } finally {
        loading.value = false
      }
    },
    { immediate: true },
  )
  watch(
    () => props.workspaceId,
    () => surface.close(),
  )
  watch([messages, streamed], async () => {
    await nextTick()
    scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'instant' })
  })
  onMounted(() => window.addEventListener('keydown', keyboard))
  onUnmounted(() => {
    abort?.abort()
    window.removeEventListener('keydown', keyboard)
  })

  return {
    surface,
    messages,
    state,
    title,
    flowKey,
    busy,
    loading,
    error,
    streamed,
    toolLabel,
    scroller,
    load,
    send,
    answer,
    advance,
  }
}
