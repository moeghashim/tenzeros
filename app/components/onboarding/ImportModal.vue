<script setup lang="ts">
const props = defineProps<{ source: string; workspaceKey: string }>()
const emit = defineEmits<{ close: []; imported: [] }>()
const busy = ref(false),
  error = ref('')
async function runImport() {
  busy.value = true
  error.value = ''
  try {
    await $fetch(`/api/workspaces/${props.workspaceKey}/imports`, {
      method: 'POST',
      body: { source: props.source.toLowerCase() },
    })
    emit('imported')
    emit('close')
  } catch {
    error.value = 'Import failed. Please try again.'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <OnboardingModal :title="`Connect ${source}`" @close="emit('close')">
    <p class="demo">Demo</p>
    <p>
      Explore {{ source }} migration with 10 fictional companies and 10 fictional contacts. Each
      record is marked as demo data. No external account is connected.
    </p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="actions">
      <button @click="emit('close')">Cancel</button
      ><button class="primary" :disabled="busy" @click="runImport">
        {{ busy ? 'Importing…' : 'Simulate connection' }}
      </button>
    </div>
  </OnboardingModal>
</template>
<style scoped>
p {
  color: var(--color-textSecondary);
}
.demo {
  display: inline-block;
  background: #f0f0f0;
  border-radius: 99px;
  padding: 2px 8px;
  margin-bottom: 14px;
  font-size: 12px;
}
.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 24px;
}
</style>
