<script setup lang="ts">
import type { PendingControl, ControlResponse } from '#shared/chat'
const props = defineProps<{ pending: PendingControl; busy: boolean }>()
const emit = defineEmits<{ answer: [answer: ControlResponse] }>()
const selected = ref<string[]>([]),
  other = ref(''),
  conversation = ref(''),
  minimized = ref(false)
const control = computed(() => props.pending.control)
watch(
  () => props.pending.id,
  () => {
    selected.value = []
    other.value = ''
    conversation.value =
      control.value.kind === 'conversation' ? control.value.responseText || '' : ''
  },
  { immediate: true },
)
function submit() {
  const c = control.value,
    toolCallId = props.pending.id
  if (c.kind === 'choice')
    emit('answer', {
      kind: 'choice',
      toolCallId,
      selectedOptionIds: selected.value,
      ...(other.value.trim() ? { otherText: other.value.trim() } : {}),
      questionKey: c.questionKey,
    })
  else if (c.kind === 'conversation') {
    if (conversation.value.trim())
      emit('answer', { kind: 'conversation', toolCallId, responseText: conversation.value.trim() })
  } else if (c.kind === 'continue')
    emit('answer', { kind: 'continue', toolCallId, responseText: c.responseText || c.label })
  else
    emit('answer', {
      kind: 'menu',
      toolCallId,
      action: 'continue',
      responseText: c.continueResponseText || c.continueLabel,
    })
}
function choose(id: string) {
  if (control.value.kind !== 'choice') return
  selected.value =
    control.value.selectionMode === 'single'
      ? [id]
      : selected.value.includes(id)
        ? selected.value.filter((v) => v !== id)
        : [...selected.value, id]
  if (control.value.selectionMode === 'single' && !control.value.allowOther) submit()
}
function keyboard(event: KeyboardEvent) {
  if (
    (event.metaKey || event.ctrlKey) &&
    event.key === 'Enter' &&
    !props.busy &&
    (control.value.kind !== 'choice' || selected.value.length || other.value.trim())
  ) {
    event.preventDefault()
    submit()
  }
}
onMounted(() => window.addEventListener('keydown', keyboard))
onUnmounted(() => window.removeEventListener('keydown', keyboard))
</script>
<template>
  <section class="control" aria-label="Onboarding options">
    <button
      class="collapse"
      :aria-label="minimized ? 'Expand onboarding options' : 'Minimize onboarding options'"
      :aria-expanded="!minimized"
      @click="minimized = !minimized"
    >
      {{ minimized ? '+' : '−' }} {{ control.kind === 'choice' ? 'Questions' : 'Next step' }}
    </button>
    <div v-show="!minimized">
      <ChatMarkdown v-if="pending.display" :content="pending.display" />
      <p v-if="control.kind === 'conversation'">{{ control.summary }}</p>
      <p v-if="'prompt' in control">{{ control.prompt }}</p>
      <template v-if="control.kind === 'choice'">
        <div class="options">
          <button
            v-for="(option, i) in control.options"
            :key="option.id"
            :disabled="busy"
            :aria-pressed="selected.includes(option.id)"
            @click="choose(option.id)"
          >
            <span class="letter">{{ String.fromCharCode(65 + i) }}</span
            ><span
              >{{ option.label
              }}<small v-if="option.description">{{ option.description }}</small></span
            >
          </button>
        </div>
        <label v-if="control.allowOther"
          >{{ control.otherLabel || 'Something else…'
          }}<input v-model="other" maxlength="2000" placeholder="Type your answer" :disabled="busy"
        /></label>
        <button
          v-if="control.selectionMode === 'multiple' || control.allowOther"
          class="primary"
          :disabled="busy || (!selected.length && !other.trim())"
          @click="submit"
        >
          {{ control.submitLabel || 'Continue' }}
        </button>
      </template>
      <template v-else-if="control.kind === 'menu'">
        <p class="muted">
          {{ control.visitedItemIds?.length || 0 }}/{{ control.items.length }} explored
        </p>
        <button
          v-for="item in control.items"
          :key="item.id"
          class="menu-item"
          :disabled="busy"
          @click="
            emit('answer', {
              kind: 'menu',
              toolCallId: pending.id,
              action: 'visit',
              itemId: item.id,
              responseText: item.responseText || item.label,
            })
          "
        >
          {{ control.visitedItemIds?.includes(item.id) ? '✓ ' : '' }}{{ item.label
          }}<small>{{ item.description }}</small>
        </button>
        <button class="primary" :disabled="busy" @click="submit">
          {{ control.continueLabel }}
        </button>
      </template>
      <template v-else-if="control.kind === 'conversation'">
        <textarea
          v-model="conversation"
          :disabled="busy"
          :aria-label="control.label"
          maxlength="2000"
          rows="4"
        /><button class="primary" :disabled="busy || !conversation.trim()" @click="submit">
          {{ control.label }}
        </button></template
      >
      <button v-else class="primary" :disabled="busy" @click="submit">{{ control.label }}</button>
    </div>
  </section>
</template>
<style scoped>
.control {
  border: 1px solid #dedfe3;
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  max-height: 48dvh;
  overflow: auto;
}
.collapse {
  border: 0;
  background: none;
  padding: 0 0 10px;
  color: #777;
  font-size: 12px;
}
p {
  margin: 0 0 12px;
}
.options {
  display: grid;
  gap: 7px;
  margin-bottom: 10px;
}
.options button {
  display: flex;
  text-align: left;
  gap: 10px;
  align-items: baseline;
}
button[aria-pressed='true'] {
  border-color: #3987d9;
  background: #edf6ff;
}
.letter {
  color: #888;
  font-size: 11px;
}
small {
  display: block;
  color: #777;
  font-size: 11px;
  margin-top: 4px;
}
textarea,
input {
  width: 100%;
  margin: 8px 0;
}
.primary {
  margin-top: 8px;
}
.menu-item {
  display: block;
  width: 100%;
  text-align: left;
  margin-bottom: 8px;
}
</style>
