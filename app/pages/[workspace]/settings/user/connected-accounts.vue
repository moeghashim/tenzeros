<script setup lang="ts">
const { data, key, refresh } = await useOnboarding()
const kind = ref<'google' | 'notetaker' | 'linkedin'>()
useHead({ title: 'Connected Accounts — Tenzeros' })
</script>
<template>
  <section v-if="data" class="page">
    <h1>Connected Accounts</h1>
    <p class="muted">Manage the accounts connected to your workspace.</p>
    <div
      v-for="connection in [
        ...data.mailboxes,
        ...data.calendars,
        ...data.notetakers,
        ...data.linkedinAccounts,
      ]"
      :key="connection.id"
      class="connection"
    >
      <strong>{{ connection.type }}</strong
      ><span>{{ connection.email }}</span
      ><span>{{ connection.status }} {{ connection.isDemo ? '· Demo' : '' }}</span>
    </div>
    <div class="actions">
      <button @click="kind = 'google'">Connect Gmail and Calendar</button
      ><button @click="kind = 'notetaker'">Connect notetaker</button
      ><button @click="kind = 'linkedin'">Connect LinkedIn</button>
    </div>
    <OnboardingConnectModal
      v-if="kind"
      :kind="kind"
      :workspace-key="key"
      :workspace-id="data.workspace.id"
      :google-available="data.googleAvailable"
      @close="kind = undefined"
      @connected="refresh()"
    />
  </section>
</template>
<style scoped>
.connection {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  padding: 18px;
  border: 1px solid #e8e8e8;
  border-radius: 12px;
  background: white;
  margin-top: 16px;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 24px;
}
</style>
