<script setup lang="ts">
const route = useRoute()
const url = computed(() => `/api/workspaces/${encodeURIComponent(String(route.params.workspace))}/contexts`)
const { data, error, refresh } = await useFetch<import('../../../../../shared/api').WorkspaceContexts>(url)
const drafts = reactive<Record<string, string>>({})
const saving = ref<string | null>(null)
const message = ref('')
const retrying = ref(false)
watch(data, (value, previous) => {
  for (const row of value?.contexts ?? []) {
    const old = previous?.contexts.find(item => item.id === row.id)
    if (!(row.id in drafts) || drafts[row.id] === old?.content) drafts[row.id] = row.content
  }
}, { immediate: true })
const { status } = useRealtime({ onConnected: () => { void refresh() }, onEvent: event => { if (event.workspaceId === data.value?.workspaceId && (event.type === 'custom' || event.targetModel === 'aiContexts')) {
  if (event.type !== 'custom' && event.type === 'update') { const row = data.value.contexts.find(c => c.id === event.targetId); if (row && drafts[row.id] === row.content) drafts[row.id] = String(event.data.content) }
  void refresh()
} } })
async function save(id: string) {
  saving.value = id; message.value = ''
  try { await $fetch(`${url.value}/${id}`, { method: 'PATCH', body: { content: drafts[id] } }); await refresh(); message.value = 'Context saved.' } catch { message.value = 'Could not save context. Please try again.' } finally { saving.value = null }
}
async function retry() {
  retrying.value = true
  try { await $fetch(`${url.value}/retry`, { method: 'POST' }); await refresh() } catch { message.value = 'Could not start generation. Please try again.' } finally { retrying.value = false }
}
useHead({ title: 'AI context — Tenzeros' })
</script>
<template>
  <section class="page context-page">
    <h1>AI context</h1><p class="muted">Give Tenzeros a better understanding of your company. Review and edit these starting points.</p>
    <p v-if="error" role="alert" class="error">Could not load workspace context.</p>
    <div v-if="data && data.status !== 'ready'" class="notice" role="status">
      <p>{{ data.status === 'pending' ? 'Preparing your company context. You can keep using your workspace.' : data.error }}</p>
      <button v-if="data.canEdit" :disabled="retrying" @click="retry">{{ data.status === 'pending' ? 'Restart if interrupted' : 'Retry generation' }}</button>
    </div>
    <p v-if="status === 'offline'" class="muted connection" role="status">Reconnecting to live updates…</p>
    <p role="status" class="save-status">{{ message }}</p>
    <article v-for="context in data?.contexts" :key="context.id" class="context-card">
      <h2><label :for="context.id">{{ context.name }}</label></h2>
      <textarea :id="context.id" v-model="drafts[context.id]" :readonly="!data?.canEdit" rows="9" maxlength="20000" />
      <footer><span class="muted">Markdown · AI-generated starting point; verify claims.</span><button v-if="data?.canEdit" :disabled="saving !== null || drafts[context.id] === context.content || !drafts[context.id]?.trim()" @click="save(context.id)">{{ saving === context.id ? 'Saving…' : 'Save changes' }}</button></footer>
    </article>
  </section>
</template>
<style scoped>
.context-page { max-width: 960px; }.notice { margin-top: 24px; padding: 16px; border: 1px solid var(--color-borderNormal); border-radius: 12px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }.context-card { border: 1px solid var(--color-borderNormal); background: white; border-radius: 16px; padding: 24px; margin-bottom: 16px; } h2 { margin: 0 0 16px; } textarea { width: 100%; } footer { display: flex; align-items: center; gap: 16px; justify-content: space-between; margin-top: 12px; font-size: 12px; }.save-status { min-height: 24px; margin: 12px 0; }.connection { margin-top: 12px; } @media (max-width: 600px) { footer, .notice { align-items: start; flex-direction: column; } }
</style>
