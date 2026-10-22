<script setup lang="ts">
import { notetakerProviders } from '#shared/onboarding'
const props = defineProps<{
  kind: 'google' | 'notetaker' | 'linkedin' | 'instructions'
  workspaceKey: string
  workspaceId: string
  googleAvailable: boolean
}>()
const emit = defineEmits<{ close: []; connected: [] }>()
const provider = ref<(typeof notetakerProviders)[number]>('Fireflies.ai')
const busy = ref(false),
  error = ref('')
const title = computed(() =>
  props.kind === 'google'
    ? 'One quick thing before Google opens'
    : props.kind === 'instructions'
      ? 'Reconnecting your Google account'
      : props.kind === 'notetaker'
        ? 'Connect your notetaker'
        : 'Sync LinkedIn to Tenzeros',
)
async function simulate() {
  busy.value = true
  error.value = ''
  try {
    await $fetch(`/api/workspaces/${props.workspaceKey}/simulate`, {
      method: 'POST',
      body:
        props.kind === 'notetaker'
          ? { kind: props.kind, provider: provider.value }
          : { kind: props.kind },
    })
    emit('connected')
    emit('close')
  } catch {
    error.value = 'Could not connect. Please try again.'
  } finally {
    busy.value = false
  }
}
async function google() {
  busy.value = true
  error.value = ''
  try {
    const result = await $fetch('/api/integrations/google/authorize-url', {
      query: { workspaceId: props.workspaceId, type: 'all' },
    })
    window.location.assign(result.url)
  } catch {
    error.value = 'Could not open Google. Please try again.'
    busy.value = false
  }
}
</script>
<template>
  <OnboardingModal :title="title" @close="emit('close')">
    <template v-if="kind === 'google' || kind === 'instructions'">
      <OnboardingConsentPreview />
      <p v-if="kind === 'google'">
        Keep every box checked. Tenzeros needs all of them to read your inbox and calendar and build
        your contacts.
      </p>
      <div v-else class="instructions">
        <p>
          When the Google permission screen appears,
          <strong>make sure every checkbox is selected</strong> before clicking Continue.
        </p>
        <p>If you skip any permission, Tenzeros won't be able to sync your mail or calendar.</p>
        <p>You can always reconnect later from Settings → Connected Accounts.</p>
      </div>
    </template>
    <template v-if="kind === 'notetaker'"
      ><p>Choose the notetaker you use for meetings.</p>
      <div class="providers">
        <button
          v-for="name in notetakerProviders"
          :key="name"
          :aria-pressed="provider === name"
          :class="{ selected: provider === name }"
          @click="provider = name"
        >
          <OnboardingBrandIcon :name="name" />{{ name }}
        </button>
      </div></template
    >
    <p v-if="kind === 'linkedin'">Bring contacts and conversations into your workspace.</p>
    <div v-if="kind !== 'instructions'" class="demo">
      <strong>Demo</strong> · Simulate a connection to explore onboarding. No external data is read.
    </div>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <div class="actions">
      <button @click="emit('close')">{{ kind === 'instructions' ? 'Got it' : 'Cancel' }}</button
      ><button v-if="kind !== 'instructions'" :disabled="busy" class="primary" @click="simulate">
        {{ busy ? 'Connecting…' : 'Simulate connection' }}
      </button>
    </div>
    <button
      v-if="kind === 'google' && googleAvailable"
      class="real-google"
      :disabled="busy"
      @click="google"
    >
      Connect Google Account
    </button>
  </OnboardingModal>
</template>
<style scoped>
p {
  color: var(--color-textSecondary);
}
.instructions {
  display: grid;
  gap: 12px;
}
.demo {
  padding: 12px;
  margin: 20px 0;
  background: #f5f5f5;
  border-radius: 10px;
  font-size: 12px;
  color: #777;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}
.providers {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 16px;
}
.providers button {
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
}
.providers :deep(svg),
.providers :deep(.monogram) {
  width: 20px;
  font-size: 20px;
}
.selected {
  border-color: #1888f2;
  background: #eff7ff;
}
.real-google {
  display: block;
  width: 100%;
  margin-top: 12px;
}
</style>
