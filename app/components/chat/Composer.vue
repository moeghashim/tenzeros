<script setup lang="ts">
defineProps<{ busy: boolean; disabled: boolean }>()
const emit = defineEmits<{ send: [content: string] }>()
const content = ref('')
function send() {
  if (!content.value.trim()) return
  emit('send', content.value.trim())
  content.value = ''
}
</script>
<template>
  <form @submit.prevent="send">
    <textarea
      v-model="content"
      aria-label="Message Tenzeros"
      :disabled="busy || disabled"
      :placeholder="disabled ? 'Choose an option above' : 'Message Tenzeros…'"
      maxlength="20000"
      rows="2"
      @keydown.meta.enter.prevent="!busy && !disabled && send()"
    /><button type="submit" class="primary" :disabled="busy || disabled || !content.trim()">
      Send
    </button>
  </form>
</template>
<style scoped>
form {
  display: flex;
  align-items: end;
  gap: 8px;
}
textarea {
  flex: 1;
  min-width: 0;
  resize: vertical;
}
</style>
