<script setup lang="ts">
const { data, key, refresh } = await useOnboarding()
const inviting = ref(false)
useHead({ title: 'Team — Tenzeros' })
</script>
<template>
  <section v-if="data" class="page">
    <h1>Your team</h1>
    <p class="muted">People with access to this workspace.</p>
    <button v-if="data.role === 'admin'" class="primary" @click="inviting = true">
      Invite teammates
    </button>
    <ul>
      <li v-for="member in data.members" :key="member.id">
        <strong>{{ member.name || member.email }}</strong
        ><span>{{ member.role }} · {{ member.status }}</span>
      </li>
    </ul>
    <OnboardingInviteModal
      v-if="inviting"
      :workspace-key="key"
      :workspace-id="data.workspace.id"
      @close="inviting = false"
      @invited="refresh()"
    />
  </section>
</template>
<style scoped>
button {
  margin-top: 20px;
}
ul {
  padding: 0;
  list-style: none;
}
li {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  background: white;
  border-bottom: 1px solid #eee;
  padding: 16px;
}
li span {
  color: #777;
}
</style>
