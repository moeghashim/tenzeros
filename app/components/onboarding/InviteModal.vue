<script setup lang="ts">
const props = defineProps<{ workspaceKey: string; workspaceId: string }>()
const emit = defineEmits<{ close: []; invited: [] }>()
const emails = ref(''),
  role = ref<'member' | 'admin'>('member'),
  busy = ref(false),
  error = ref('')
const { data: suggestions } = await useFetch('/api/onboarding/invite-suggestions', {
  query: { workspaceId: props.workspaceId },
})
async function invite() {
  busy.value = true
  error.value = ''
  try {
    const result = await $fetch(`/api/workspaces/${props.workspaceKey}/invites`, {
      method: 'POST',
      body: { emails: emails.value.split(/[\s,;]+/).filter(Boolean), role: role.value },
    })
    if (!result.invited.length) {
      error.value = 'These people are already members or have already been invited.'
      return
    }
    emit('invited')
    emit('close')
  } catch {
    error.value = 'Enter valid email addresses and try again.'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <OnboardingModal title="Invite your team" @close="emit('close')"
    ><form @submit.prevent="invite">
      <p class="demo">Demo · Invitations are saved in this workspace. No email will be sent.</p>
      <label
        >Email addresses<textarea
          v-model="emails"
          required
          rows="3"
          placeholder="alex@example.com, jordan@example.com"
        />
      </label>
      <label
        >Role<select v-model="role">
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select></label
      >
      <p v-if="suggestions?.data.status === 'no_mailbox'" class="muted">
        Connect Gmail to find colleagues to invite.
      </p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="actions">
        <button type="button" @click="emit('close')">Cancel</button
        ><button class="primary" :disabled="busy">
          {{ busy ? 'Inviting…' : 'Invite teammates' }}
        </button>
      </div>
    </form></OnboardingModal
  >
</template>
<style scoped>
form {
  display: grid;
  gap: 16px;
}
label {
  display: grid;
  gap: 6px;
}
.demo {
  color: #777;
  background: #f5f5f5;
  padding: 12px;
  border-radius: 10px;
  font-size: 12px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
</style>
