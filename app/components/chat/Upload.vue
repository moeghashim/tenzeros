<script setup lang="ts">
const props = defineProps<{ chatId: string; busy: boolean }>()
const emit = defineEmits<{ uploaded: []; uploading: [value: boolean] }>()
const error = ref('')
async function upload(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  if (!file) return
  if (!/\.csv$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
    error.value = 'Choose a CSV file up to 5 MB.'
    input.value = ''
    return
  }
  error.value = ''
  emit('uploading', true)
  try {
    const body = new FormData()
    body.set('file', file)
    await $fetch(`/api/chats/${props.chatId}/upload`, { method: 'POST', body })
    emit('uploaded')
  } catch (cause) {
    error.value =
      (cause as { data?: { statusMessage?: string } }).data?.statusMessage ||
      'Upload failed. Please try again.'
  } finally {
    emit('uploading', false)
    input.value = ''
  }
}
</script>
<template>
  <section class="upload">
    <strong>Drop your CSV here</strong>
    <p>CSV up to 5 MB</p>
    <label
      >Choose CSV<input
        type="file"
        accept=".csv,text/csv,application/csv"
        :disabled="busy"
        @change="upload"
    /></label>
    <p v-if="busy" role="status">Reviewing column mapping…</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
.upload {
  border: 1px dashed #b6c4d5;
  padding: 22px;
  border-radius: 12px;
  background: #f6faff;
  margin: 12px 0;
}
.upload p {
  color: #777;
  margin: 8px 0;
}
input {
  display: block;
  margin-top: 10px;
  max-width: 100%;
}
</style>
