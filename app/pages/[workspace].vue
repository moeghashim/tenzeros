<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const route = useRoute()
const requestFetch = useRequestFetch()
const { data: account } = await useAsyncData('account', () => requestFetch('/api/auth/me'))
const key = computed(() => String(route.params.workspace))
const { data, error, refresh } = await useFetch(
  () => `/api/workspaces/${encodeURIComponent(key.value)}`,
)
if (error.value)
  throw createError({
    statusCode: error.value.statusCode || 404,
    statusMessage: 'Workspace not found',
  })
useRealtime({
  onConnected: () => {
    void refresh()
  },
  onEvent: (event) => {
    if (
      event.workspaceId === data.value?.workspace.id &&
      (event.type === 'custom' ||
        ['chats', 'subscriptions', 'workspaces', 'memberships'].includes(event.targetModel))
    )
      void refresh()
  },
})
</script>
<template>
  <div v-if="data && account" class="app-shell">
    <a class="skip" href="#main">Skip to content</a>
    <AppSidebar
      :workspace="data.workspace"
      :workspaces="account.workspaces.map((w) => w.workspace)"
      :chats="data.chats"
      :dismissed="Boolean(data.membership.onboardingSkippedAt)"
      @dismissed="refresh()"
    />
    <main id="main" tabindex="-1"><NuxtPage /></main>
  </div>
</template>
<style scoped>
.app-shell {
  display: flex;
  min-height: 100dvh;
}
main {
  flex: 1;
  min-width: 0;
}
.skip {
  position: fixed;
  top: -100px;
  z-index: 10;
  padding: 12px;
  background: white;
}
.skip:focus {
  top: 0;
}
</style>
