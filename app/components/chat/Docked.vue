<script setup lang="ts">
const props = defineProps<{ workspaceKey: string; workspaceId: string }>()
const {
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
  retry,
  keyboard,
} = useDockedChat(props)
const panel = ref<HTMLElement>()
let opener: HTMLElement | null = null
watch(surface.chatId, async (id, previous) => {
  if (id && !previous) {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    panel.value?.querySelector<HTMLButtonElement>('button')?.focus()
  } else if (!id && previous) {
    await nextTick()
    if (opener?.isConnected) opener.focus()
    else document.getElementById('main')?.focus()
  }
})
</script>
<template>
  <aside
    v-if="surface.chatId.value"
    ref="panel"
    class="docked"
    aria-label="Tenzeros chat"
    @keydown="keyboard"
    @keydown.esc.stop="surface.close()"
  >
    <header>
      <div>
        <small>GUIDED SETUP</small>
        <h2>{{ title }}</h2>
      </div>
      <button aria-label="Close chat" @click="surface.close()">×</button>
    </header>
    <div ref="scroller" class="messages" aria-live="polite" aria-relevant="additions text">
      <p v-if="loading && !messages.length" class="muted">Opening your walkthrough…</p>
      <template v-for="message in messages" :key="message.id"
        ><article
          v-if="message.role !== 'tool' && message.content"
          :class="['message', message.role]"
        >
          <small>{{ message.role === 'user' ? 'You' : 'Tenzeros' }}</small
          ><ChatMarkdown :content="message.content" /></article
      ></template>
      <ChatMarkdown v-if="streamed" :content="streamed" />
      <p v-if="busy" class="working" role="status">
        {{ toolLabel ? `${toolLabel}…` : 'Tenzeros is thinking…' }}
      </p>
      <ChatUpload
        v-if="flowKey === 'csv-import' && !state.activeControl && !state.completed"
        :chat-id="surface.chatId.value"
        :busy="busy"
        @uploading="busy = $event"
        @uploaded="load(surface.chatId.value!)"
      />
    </div>
    <footer>
      <div v-if="error" class="error" role="alert">
        {{ error }}<button :disabled="busy" @click="retry">Retry</button>
      </div>
      <ChatControl
        v-if="state.activeControl"
        :pending="state.activeControl"
        :busy="busy"
        @answer="answer"
      />
      <button v-if="state.currentStep" :disabled="busy" class="move-on" @click="advance">
        {{ state.currentStep.moveOnLabel }}
      </button>
      <p v-if="state.completed" class="muted">Walkthrough complete.</p>
      <ChatComposer
        v-else-if="flowKey !== 'csv-import'"
        :busy="busy"
        :disabled="
          Boolean(state.activeControl && state.activeControl.control.kind !== 'conversation')
        "
        @send="send({ content: $event })"
      />
    </footer>
  </aside>
</template>
<style scoped>
.docked {
  width: 430px;
  min-width: 360px;
  height: 100dvh;
  position: sticky;
  top: 0;
  border-left: 1px solid #e4e4e7;
  background: #fcfcfd;
  display: flex;
  flex-direction: column;
  z-index: 15;
  box-shadow: -4px 0 24px #00000004;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #eee;
}
header small {
  font-size: 9px;
  letter-spacing: 0.12em;
  color: var(--color-textTertiary);
}
h2 {
  margin: 5px 0 0;
  font-size: 15px;
}
header button {
  border: 0;
  background: transparent;
  font-size: 23px;
}
.messages {
  flex: 1;
  overflow: auto;
  padding: 20px;
  min-height: 80px;
}
.message {
  margin-bottom: 22px;
}
.message > small {
  display: block;
  font-size: 10px;
  color: var(--color-textSecondary);
  margin-bottom: 6px;
}
.user {
  background: #eef3f9;
  padding: 12px;
  border-radius: 12px;
}
footer {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid #eee;
}
.working {
  font-size: 12px;
  color: var(--color-textSecondary);
}
.error button {
  margin: 8px;
}
.move-on {
  justify-self: end;
  font-size: 12px;
}
@media (max-width: 950px) {
  .docked {
    position: fixed;
    right: 0;
    width: min(430px, 100vw);
    min-width: 0;
    box-shadow: -10px 0 50px #0002;
  }
}
</style>
