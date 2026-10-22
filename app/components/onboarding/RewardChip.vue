<script setup lang="ts">
import { IconBolt } from '@tabler/icons-vue'
defineProps<{ credits: number; earned?: boolean }>()
</script>
<template>
  <span
    class="reward"
    :class="{ earned }"
    :aria-label="`${credits} ${earned ? 'credits earned' : 'bonus credits'}`"
    ><IconBolt :size="11" />{{ credits }}</span
  >
</template>
<style scoped>
.reward {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  border: 1px solid var(--color-borderSoft);
  border-radius: 99px;
  padding: 0 3px;
  font-size: 10px;
  line-height: 14px;
  color: #c6c6c6;
}
.earned {
  color: var(--color-successText);
  border-color: var(--color-successBorder);
  background: var(--color-successBg);
}
</style>
