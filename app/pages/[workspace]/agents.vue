<script setup lang="ts">
import { IconBolt } from '@tabler/icons-vue'
const route = useRoute(),
  key = computed(() => String(route.params.workspace))
useHead({ title: 'Agents — Tenzeros' })
const { data, refresh } = await useFetch(() => `/api/workspaces/${key.value}/agents`)
const busy = ref(''),
  error = ref('')
async function toggle(id: string, enabled: boolean) {
  busy.value = id
  error.value = ''
  try {
    await $fetch(`/api/workspaces/${key.value}/agents/${id}`, {
      method: 'PATCH',
      body: { enabled },
    })
    await refresh()
  } catch {
    error.value = 'Could not update this agent. Please try again.'
  } finally {
    busy.value = ''
  }
}
onMounted(async () => {
  if (data.value?.canEdit && !data.value.agents.length) {
    try {
      await $fetch(`/api/workspaces/${key.value}/agents/seed`, { method: 'POST', body: {} })
      await refresh()
    } catch {
      error.value = 'Could not load the catalogue. Please reload to try again.'
    }
  }
})
useRealtime({
  onConnected: () => {
    void refresh()
  },
  onEvent: (event) => {
    if (event.type !== 'custom' && event.targetModel === 'agents') void refresh()
  },
})
</script>
<template>
  <section class="page">
    <NuxtLink :to="`/${key}/onboarding`" class="back">← Get started</NuxtLink>
    <h1>Agents</h1>
    <p class="muted">
      Ready-made helpers for your CRM. Enable an agent to make it part of your workspace.
    </p>
    <p class="demo">Demo catalogue · Agent execution arrives with guided setup in M3.</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <div class="agents">
      <article v-for="agent in data?.agents" :key="agent.id">
        <IconBolt :size="24" />
        <div>
          <h2>{{ agent.name }}</h2>
          <p>{{ agent.description }}</p>
        </div>
        <button
          role="switch"
          :aria-checked="agent.enabled"
          :aria-label="`Enable ${agent.name}`"
          :disabled="!data?.canEdit || Boolean(busy)"
          :class="{ enabled: agent.enabled }"
          @click="toggle(agent.id, !agent.enabled)"
        >
          <span />
        </button>
      </article>
    </div>
    <p v-if="data && !data.canEdit" class="muted">Only workspace admins can enable agents.</p>
  </section>
</template>
<style scoped>
.back {
  display: inline-block;
  font-size: 12px;
  color: #777;
  margin-bottom: 24px;
  text-decoration: none;
}
.demo {
  font-size: 12px;
  color: #777;
  margin: 16px 0 24px;
}
.agents {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 24px;
}
article {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  background: white;
  border: 1px solid #e8e8e8;
  border-radius: 18px;
  padding: 24px;
}
article > svg {
  flex: 0 0 auto;
  color: #888;
}
article div {
  flex: 1;
}
h2 {
  font-size: 14px;
  margin: 0 0 8px;
}
article p {
  color: #777;
  font-size: 12px;
}
button {
  flex: 0 0 auto;
  width: 34px;
  height: 20px;
  border-radius: 99px;
  padding: 2px;
  background: #ddd;
  border: 0;
}
button span {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: white;
}
button.enabled {
  background: #1888f2;
}
button.enabled span {
  margin-left: auto;
}
@media (max-width: 900px) {
  .agents {
    grid-template-columns: 1fr;
  }
}
</style>
