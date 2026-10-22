<script setup lang="ts">
import { IconCheck } from '@tabler/icons-vue'
import { migrationSources } from '#shared/onboarding'
defineProps<{ completed: boolean; credits: number; source?: string }>()
defineEmits<{ select: [source: string] }>()
</script>
<template>
  <article class="migration-card" data-task="import_data">
    <OnboardingRewardChip class="reward" :credits="credits" :earned="completed" />
    <div class="fan" aria-label="Migration sources">
      <button
        v-for="(name, i) in migrationSources"
        :key="name"
        :aria-label="`Import from ${name}`"
        :disabled="completed"
        :style="{ '--angle': `${(i - 2) * 13}deg`, '--lift': `${Math.abs(i - 2) * 8}px` }"
        :class="{ connected: source?.toLowerCase() === name.toLowerCase() }"
        @click="$emit('select', name)"
      >
        <OnboardingBrandIcon :name="name" />
      </button>
    </div>
    <h2>Migrate existing data</h2>
    <p v-if="!completed">
      Bring over contacts, companies, deals, and lists from your current CRM or spreadsheets without
      rebuilding everything from scratch.
    </p>
    <span v-else class="status"
      ><IconCheck :size="14" />{{
        migrationSources.find((name) => name.toLowerCase() === source?.toLowerCase()) || source
      }}
      <small>Demo · 20 records imported</small></span
    >
    <div v-if="!completed" class="sources" aria-label="Choose a migration source">
      <button v-for="name in migrationSources" :key="name" @click="$emit('select', name)">
        {{ name }}
      </button>
    </div>
  </article>
</template>
<style scoped>
.migration-card {
  position: relative;
  min-height: 304px;
  padding: 26px 20px 24px;
  border: 1px solid #ebebeb;
  background: white;
  border-radius: 24px;
  text-align: center;
  grid-column: 1 / -1;
}
.reward {
  position: absolute;
  top: 13px;
  right: 13px;
}
.fan {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 128px;
  margin-bottom: 12px;
}
.fan button {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 2px solid white;
  background: #fafafa;
  border-radius: 14px;
  box-shadow: 0 6px 20px #0000000d;
  transform: translateY(var(--lift)) rotate(var(--angle));
  transition: transform 0.2s;
}
.fan button:hover {
  transform: translateY(calc(var(--lift) - 6px)) rotate(var(--angle));
}
.fan button:disabled {
  cursor: default;
  opacity: 1;
}
.fan button.connected {
  border-color: var(--color-successBorder);
}
h2 {
  font-size: 13px;
  font-weight: 500;
  margin: 0 0 8px;
}
p {
  font-size: 13px;
  color: #777;
  max-width: 430px;
  margin: 0 auto;
  line-height: 1.5;
}
.sources {
  margin-top: 18px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}
.sources button {
  padding: 4px 10px;
  font-size: 11px;
  border-radius: 7px;
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--color-successText);
  background: var(--color-successBg);
  padding: 4px 8px;
  border-radius: 99px;
}
.status small {
  font-size: 10px;
}
</style>
