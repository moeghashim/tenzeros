<script setup lang="ts">
import { IconX } from '@tabler/icons-vue'
defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()
onMounted(() => dialog.value?.showModal())
</script>
<template>
  <dialog
    ref="dialog"
    class="modal"
    aria-labelledby="onboarding-modal-title"
    @close="emit('close')"
    @click="
      (event) => {
        if (event.target === dialog) dialog?.close()
      }
    "
  >
    <div class="heading">
      <h2 id="onboarding-modal-title">{{ title }}</h2>
      <button class="close" aria-label="Close dialog" @click="dialog?.close()">
        <IconX :size="18" />
      </button>
    </div>
    <slot />
  </dialog>
</template>
<style scoped>
.modal {
  border: 1px solid var(--color-borderNormal);
  border-radius: 20px;
  padding: 24px;
  width: min(520px, calc(100vw - 32px));
  max-height: calc(100dvh - 48px);
  box-shadow: var(--shadow-xl);
}
.modal::backdrop {
  background: rgb(0 0 0 / 25%);
}
.heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
}
.close {
  border: 0;
  padding: 2px;
  display: flex;
}
</style>
