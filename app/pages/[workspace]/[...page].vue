<script setup lang="ts">
const route = useRoute()
const names: Record<string, string> = {
  home: 'Home',
  inbox: 'Inbox',
  tasks: 'Tasks',
  'lead-search': 'Lead search',
  agents: 'Agents',
  sequences: 'Sequences',
  reports: 'Reports',
  lists: 'Records & Lists',
  'lists/sales-pipeline': 'Sales Pipeline',
  'lists/my-deals': 'My deals',
  settings: 'Settings',
  'settings/workspace/users': 'Workspace members',
  referral: 'Refer a friend',
  docs: 'Documentation',
  feedback: 'Feedback',
}
const path = computed(() =>
  Array.isArray(route.params.page) ? route.params.page.join('/') : String(route.params.page),
)
const title = computed(() => (path.value.startsWith('chats/') ? 'Chat' : names[path.value]))
if (!title.value) throw createError({ statusCode: 404, statusMessage: 'Page not found' })
useHead({ title: () => `${title.value} — Tenzeros` })
</script>
<template>
  <section class="page">
    <h1>{{ title }}</h1>
    <p class="muted">This part of your workspace is coming soon.</p>
    <nav v-if="path === 'settings'" class="settings-links">
      <NuxtLink :to="`/${route.params.workspace}/settings/workspace/context`">AI context</NuxtLink
      ><NuxtLink :to="`/${route.params.workspace}/settings/workspace/users`"
        >Workspace members</NuxtLink
      >
    </nav>
  </section>
</template>
<style scoped>
.settings-links {
  display: flex;
  gap: 24px;
  margin-top: 24px;
}
</style>
