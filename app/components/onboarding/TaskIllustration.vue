<script setup lang="ts">
import { IconBolt, IconPlus, IconCheck } from '@tabler/icons-vue'
import type { TaskKey } from '#shared/onboarding'
defineProps<{ taskKey: TaskKey; completed: boolean; provider?: string }>()
</script>
<template>
  <div class="illustration" :class="taskKey" aria-hidden="true">
    <template v-if="taskKey === 'connect_gmail'"
      ><span class="tile gmail"><OnboardingBrandIcon name="Gmail" /></span
      ><span class="tile calendar"><OnboardingBrandIcon name="Calendar" /></span
    ></template>
    <div v-else-if="taskKey === 'connect_notetaker'" class="notetaker">
      <span class="plus"
        ><IconCheck v-if="completed" :size="18" /><IconPlus v-else :size="18" /></span
      ><span
        v-for="n in 4"
        :key="n"
        class="dot"
        :class="{ bar: completed }"
        :style="{ animationDelay: `${n * 0.15}s` }"
      />
    </div>
    <template v-else-if="taskKey === 'install_extension'"
      ><span class="tile dark"><OnboardingBrandIcon name="Tenzeros" /></span
      ><span class="pixel-field"
        ><i
          v-for="n in 30"
          :key="n"
          :style="{
            top: `${(n * 17) % 37}px`,
            left: `${n * 3}%`,
            animationDelay: `${n * 0.13}s`,
            opacity: ((n * 7) % 6) / 15,
          }" /></span
      ><span class="tile dark linkedin"><OnboardingBrandIcon name="LinkedIn" /></span
    ></template>
    <template v-else-if="taskKey === 'create_automation'"
      ><div class="bolts">
        <span
          v-for="n in 16"
          :key="n"
          :style="{
            animationDuration: `${18 + ((n * 7) % 15)}s`,
            animationDelay: `${-(n * 5) % 19}s`,
          }"
          ><IconBolt v-for="j in 8" :key="j" :size="22" fill="currentColor"
        /></span>
      </div>
      <span class="tile"><IconBolt :size="26" fill="currentColor" /></span
    ></template>
  </div>
</template>
<style scoped>
.illustration {
  height: 76px;
  display: flex;
  align-items: flex-start;
  position: relative;
  padding: 6px 2px 0;
}
.tile {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: white;
  border: 2px solid white;
  box-shadow:
    var(--shadow-sm),
    0 4px 16px #0000000c;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  color: #d0d0d0;
  position: relative;
}
.gmail {
  transform: rotate(-8deg);
}
.calendar {
  transform: rotate(8deg);
}
.notetaker {
  display: flex;
  gap: 3px;
  align-items: center;
  background: #111;
  border-radius: 99px;
  height: 46px;
  padding: 6px 14px 6px 7px;
  color: #aaa;
}
.plus {
  display: grid;
  place-items: center;
  width: 31px;
  height: 31px;
  border-radius: 50%;
  background: #262626;
  margin-right: 3px;
}
.dot {
  width: 4px;
  height: 4px;
  background: #999;
  opacity: 0.3;
  border-radius: 99px;
  animation: wave 1.2s infinite paused;
}
:global(.task-card:hover .dot) {
  animation-play-state: running;
}
.bar {
  height: 14px;
  background: #cf72dc;
  opacity: 0.8;
}
.dark {
  background: #202020;
  color: white;
}
.linkedin :deep(svg) {
  color: white !important;
  width: 24px;
}
.pixel-field {
  position: relative;
  height: 46px;
  flex: 1;
  margin: 3px;
  mask-image: linear-gradient(to right, black, transparent 45%, black);
}
.pixel-field i {
  position: absolute;
  width: 4px;
  height: 4px;
  background: #888;
  animation: shimmer 2s infinite alternate;
}
.create_automation {
  overflow: hidden;
  margin: -20px -20px 0;
  padding: 26px 22px 0;
  height: 115px;
  border-radius: 24px 24px 0 0;
}
.bolts {
  position: absolute;
  inset: 0;
  display: flex;
  gap: 12px;
  opacity: 0.28;
  mask-image: linear-gradient(120deg, black, transparent 65%);
  overflow: hidden;
}
.bolts > span {
  flex: 0 0 22px;
  height: max-content;
  display: flex;
  flex-direction: column;
  gap: 14px;
  color: #ccc;
  animation: drift linear infinite;
}
:global(.task-card:hover .bolts) {
  opacity: 0.5;
}
@keyframes wave {
  50% {
    transform: translateY(-3px);
    opacity: 0.72;
  }
}
@keyframes shimmer {
  to {
    opacity: 0.12;
  }
}
@keyframes drift {
  to {
    transform: translateY(-144px);
  }
}
</style>
