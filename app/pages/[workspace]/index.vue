<script setup lang="ts">
const { done, key } = await useOnboarding()
if (!done.value) await navigateTo(`/${key.value}/onboarding`, { replace: true })
useHead({ title: 'Home — Tenzeros' })
</script>
<template>
  <section v-if="done" class="page">
    <h1>Home</h1>
    <p class="muted">
      Your workspace is ready. Explore your records, agents, and team from the sidebar.
    </p>
  </section>
</template>
