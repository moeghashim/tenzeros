<script setup lang="ts">
import { IconBolt } from '@tabler/icons-vue'
import { animate, useMotionValue, useSpring } from 'motion-v'
import { progressSummary, type Completion } from '#shared/onboarding'
const props = defineProps<{ completions: Completion[]; prospective: Record<string, number> }>()
const summary = computed(() => progressSummary(props.completions, props.prospective))
const spring = useSpring(summary.value.percent, {
  stiffness: 250,
  damping: 12,
  mass: 1,
  restDelta: 0.001,
  restSpeed: 0.01,
})
const position = ref(summary.value.percent)
const velocity = ref(0)
const creditCount = ref(summary.value.earned)
const reduced = ref(false)
const creditValue = useMotionValue(summary.value.earned)
let velocityTimer: ReturnType<typeof setTimeout> | undefined
let stop: (() => void) | undefined
let stopCredit: (() => void) | undefined
let creditAnimation: ReturnType<typeof animate> | undefined
onMounted(() => {
  reduced.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  stop = spring.on('change', (value) => {
    position.value = value
    velocity.value = spring.getVelocity()
    clearTimeout(velocityTimer)
    velocityTimer = setTimeout(() => {
      velocity.value = 0
    }, 50)
  })
  stopCredit = creditValue.on('change', (value) => {
    creditCount.value = Math.round(value)
  })
  // The parent's mounted hook restores previously seen tasks. Jump to that first value.
  void nextTick(() => {
    creditAnimation?.stop()
    spring.jump(summary.value.percent)
    position.value = summary.value.percent
    velocity.value = 0
    creditValue.jump(summary.value.earned)
    creditCount.value = summary.value.earned
  })
})
watch(
  () => summary.value.percent,
  (value) => {
    if (reduced.value) {
      spring.jump(value)
      position.value = value
    } else spring.set(value)
  },
)
watch(
  () => summary.value.earned,
  (value) => {
    creditAnimation?.stop()
    if (reduced.value) {
      creditValue.jump(value)
      creditCount.value = value
    } else
      creditAnimation = animate(creditValue, value, { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] })
  },
)
onUnmounted(() => {
  clearTimeout(velocityTimer)
  stop?.()
  stopCredit?.()
  creditAnimation?.stop()
})
</script>
<template>
  <section class="progress-showcase" aria-label="Onboarding progress">
    <div
      class="track"
      role="progressbar"
      aria-label="Onboarding rewards"
      :aria-valuenow="Math.round(summary.percent)"
      :aria-valuemin="0"
      :aria-valuemax="100"
      :aria-valuetext="
        summary.countMode
          ? `${summary.completed} of ${summary.total} tasks completed`
          : `${summary.earned} of ${summary.total} credits earned`
      "
    >
      <div class="clip">
        <div class="fill" :style="{ transform: `scaleX(${position / 100})` }" />
      </div>
      <span
        v-for="(point, i) in summary.checkpoints"
        :key="i"
        class="checkpoint"
        :class="{ reached: position >= point - 0.1 }"
        :style="{ left: `${point}%` }"
      />
      <div class="indicator" :style="{ left: `${position}%` }">
        <span
          class="badge"
          :style="{ transform: `rotate(${Math.max(-45, Math.min(45, -velocity * 0.1))}deg)` }"
          ><IconBolt v-if="!summary.countMode" :size="14" />{{
            summary.countMode
              ? `${summary.completed}/${summary.total}`
              : creditCount.toLocaleString('en-US')
          }}</span
        >
        <span class="handle"
          ><span
            v-if="Math.abs(velocity) > 4"
            class="sparkles"
            :style="{ opacity: Math.min(0.9, 0.22 + Math.abs(velocity) * 0.012) }"
            ><i /><i /><i /></span
        ></span>
      </div>
    </div>
  </section>
</template>
<style scoped>
.progress-showcase {
  padding: 30px 8px 6px;
  margin-bottom: 24px;
}
.track {
  height: 4px;
  background: var(--color-borderSubtle);
  border-radius: 99px;
  position: relative;
}
.clip {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
}
.fill {
  position: absolute;
  inset: 0;
  background: #1888f2;
  transform-origin: left;
}
.checkpoint {
  width: 8px;
  height: 8px;
  border: 2px solid white;
  background: #cfe4f8;
  position: absolute;
  top: 50%;
  border-radius: 50%;
  transform: translate(-50%, -50%);
}
.reached {
  background: #1888f2;
}
.indicator {
  position: absolute;
  bottom: -5px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  justify-content: center;
  border-radius: 99px;
  height: 24px;
  min-width: 40px;
  padding: 2px 6px;
  background: #0969c7;
  color: white;
  font-weight: 500;
  margin-bottom: 8px;
  box-shadow: 0 10px 26px #1888f238;
  transform-origin: 50% calc(100% + 13px);
}
.handle {
  width: 14px;
  height: 14px;
  background: #1888f2;
  border: 2px solid white;
  border-radius: 50%;
  box-shadow: 0 2px 6px #1888f238;
  position: relative;
}
.sparkles {
  position: absolute;
  top: -9px;
  left: -7px;
  width: 26px;
  height: 20px;
}
.sparkles i {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 0 6px #1888f2;
  animation: sparkle 0.78s ease-out infinite;
}
.sparkles i:nth-child(2) {
  left: 6px;
  top: 4px;
  animation-delay: 0.18s;
}
.sparkles i:nth-child(3) {
  left: 18px;
  top: 12px;
  animation-delay: 0.34s;
}
@keyframes sparkle {
  to {
    transform: translate(6px, -7px);
    opacity: 0;
  }
}
</style>
