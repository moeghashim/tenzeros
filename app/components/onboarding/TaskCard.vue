<script setup lang="ts">
import { IconCheck, IconX } from '@tabler/icons-vue'
import type { taskCatalogue } from '#shared/onboarding'
defineProps<{
  task: (typeof taskCatalogue)[number]
  credits: number
  completed: boolean
  status?: string
  error?: boolean
  demo?: boolean
  description?: string
}>()
defineEmits<{ activate: [] }>()
function speed(event: MouseEvent, rate: number) {
  const card = event.currentTarget as HTMLElement
  for (const column of card.querySelectorAll('.bolts > span'))
    for (const animation of column.getAnimations()) animation.updatePlaybackRate(rate)
}
</script>
<template>
  <button
    class="task-card"
    :class="{ completed, 'connection-error': error }"
    :data-task="task.key"
    @click="$emit('activate')"
    @mouseenter="speed($event, 8)"
    @mouseleave="speed($event, 1)"
  >
    <OnboardingRewardChip class="reward" :credits="credits" :earned="completed" />
    <slot name="illustration"
      ><OnboardingTaskIllustration :task-key="task.key" :completed="completed"
    /></slot>
    <div class="copy">
      <h2>{{ task.title }}</h2>
      <p v-if="!completed && !error">{{ description || task.description }}</p>
      <div v-else class="status">
        <component :is="error ? IconX : IconCheck" :size="14" /><span>{{ status }}</span
        ><small v-if="demo">Demo</small>
      </div>
    </div>
  </button>
</template>
<style scoped>
.task-card {
  position: relative;
  width: 100%;
  min-width: 0;
  height: 200px;
  padding: 20px;
  border: 1px solid #ebebeb;
  border-radius: 24px;
  text-align: left;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: white;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.task-card:hover {
  border-color: #d5d5d5;
  box-shadow: 0 3px 14px #00000004;
}
.reward {
  position: absolute;
  top: 13px;
  right: 13px;
  z-index: 1;
}
.copy {
  position: relative;
}
h2 {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 500;
}
p {
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-textSecondary);
}
.status {
  display: inline-flex;
  gap: 4px;
  max-width: 100%;
  align-items: center;
  color: var(--color-successText);
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 99px;
  background: var(--color-successBg);
}
.status span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status small {
  font-size: 9px;
  border-left: 1px solid #21835844;
  padding-left: 4px;
}
.connection-error .status {
  color: var(--color-destructiveText);
  background: var(--color-destructiveBg);
}
</style>
