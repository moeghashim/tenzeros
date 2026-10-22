<script setup lang="ts">
import { IconChevronLeft, IconChevronRight, IconLock, IconCheck } from '@tabler/icons-vue'
import confetti from 'canvas-confetti'
import { orderedFlows, type FlowStatus } from '#shared/onboarding'
const props = defineProps<{ workspaceId: string; hasMailbox: boolean }>()
const emit = defineEmits<{ unlock: []; toast: [message: string] }>()
const { data } = await useFetch('/api/onboarding/flows/statuses', {
  query: { workspaceId: props.workspaceId },
})
const statuses = ref<Record<string, FlowStatus>>({ ...data.value?.data.statuses })
const surface = useChatSurface()
const chatIds = ref<Record<string, string>>({ ...data.value?.data.chatIds })
const starting = ref(false),
  celebrating = ref('')
// Capture ordering once: live status changes must not move cards under the pointer.
const flows = orderedFlows({
  ...statuses.value,
  ...(surface.pendingFlowCelebration.value
    ? { [surface.pendingFlowCelebration.value]: 'active' as const }
    : {}),
})
const track = ref<HTMLElement>(),
  canPrev = ref(false),
  canNext = ref(false),
  overflowing = ref(false)
function measure() {
  const el = track.value
  if (!el) return
  overflowing.value = el.scrollWidth > el.clientWidth + 2
  canPrev.value = el.scrollLeft > 2
  canNext.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
}
function scroll(direction: number) {
  const el = track.value
  if (el)
    el.scrollBy({
      left: direction * el.clientWidth,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
}
const locked = (key: string) =>
  ['start-outreach', 'personalize-emails'].includes(key) &&
  statuses.value[key] !== 'completed' &&
  !props.hasMailbox
async function activate(key: string, mode: 'continue' | 'restart' = 'continue') {
  if (locked(key)) {
    emit('unlock')
    return
  }
  if (starting.value) return
  starting.value = true
  try {
    const result = await $fetch('/api/onboarding/flows/start', {
      method: 'POST',
      body: { workspaceId: props.workspaceId, flowKey: key, mode },
    })
    chatIds.value[key] = result.data.chatId
    if (mode === 'restart') statuses.value[key] = 'unstarted'
    surface.openDocked(result.data.chatId)
  } catch {
    emit('toast', 'Failed to start guided setup')
  } finally {
    starting.value = false
  }
}
let celebrationTimer: ReturnType<typeof setTimeout> | undefined
async function celebrate() {
  const key = surface.pendingFlowCelebration.value
  if (!key || key === 'csv-import') {
    if (key) surface.pendingFlowCelebration.value = null
    return
  }
  surface.pendingFlowCelebration.value = null
  statuses.value[key] = 'completed'
  celebrating.value = key
  await nextTick()
  const el = track.value?.querySelector<HTMLElement>(`[data-flow="${key}"]`)
  if (!el) return
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'nearest', inline: 'start' })
  let last = -1,
    stable = 0,
    frames = 0
  await new Promise<void>((resolve) => {
    const settle = () => {
      const left = el.getBoundingClientRect().left
      stable = Math.abs(left - last) < 1 ? stable + 1 : 0
      last = left
      if (stable >= 3 || ++frames >= 120) resolve()
      else requestAnimationFrame(settle)
    }
    requestAnimationFrame(settle)
  })
  const box = el.getBoundingClientRect()
  if (!reduced)
    void confetti({
      particleCount: 90,
      spread: 80,
      origin: {
        x: (box.left + box.width / 2) / innerWidth,
        y: (box.top + box.height / 2) / innerHeight,
      },
      disableForReducedMotion: true,
    })
  celebrationTimer = setTimeout(() => {
    celebrating.value = ''
  }, 1500)
}
watch(surface.pendingFlowCelebration, () => {
  void celebrate()
})
let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(measure)
  if (track.value) observer.observe(track.value)
  measure()
  void celebrate()
})
onUnmounted(() => {
  observer?.disconnect()
  clearTimeout(celebrationTimer)
})
useRealtime({
  onEvent: (event) => {
    if (
      event.workspaceId === props.workspaceId &&
      event.type === 'custom' &&
      event.event === 'onboardingFlowStatusChanged'
    ) {
      const key = event.data.flowKey,
        status = event.data.status
      if (
        typeof key === 'string' &&
        ['unstarted', 'active', 'completed'].includes(String(status))
      ) {
        statuses.value[key] = status as FlowStatus
        if (typeof event.data.chatId === 'string') chatIds.value[key] = event.data.chatId
      }
    }
  },
})
</script>
<template>
  <section class="gallery" aria-labelledby="guided-title">
    <header>
      <div>
        <h2 id="guided-title">Guided setup</h2>
        <p>Set up key parts of your workspace together with Tenzeros.</p>
      </div>
      <div v-if="overflowing" class="controls">
        <button aria-label="Show previous setups" :disabled="!canPrev" @click="scroll(-1)">
          <IconChevronLeft :size="16" /></button
        ><button aria-label="Show next setups" :disabled="!canNext" @click="scroll(1)">
          <IconChevronRight :size="16" />
        </button>
      </div>
    </header>
    <div ref="track" class="track" @scroll="measure">
      <component
        :is="statuses[flow.key] && statuses[flow.key] !== 'unstarted' ? 'article' : 'button'"
        v-for="flow in flows"
        :key="flow.key"
        class="flow-card"
        :data-flow="flow.key"
        :class="{
          'guided-flow-card--current': surface.chatId.value === chatIds[flow.key],
          celebrating: celebrating === flow.key,
        }"
        @click="(!statuses[flow.key] || statuses[flow.key] === 'unstarted') && activate(flow.key)"
      >
        <OnboardingGuidedPreview :flow-key="flow.key" />
        <div class="copy">
          <h3>{{ flow.title }}</h3>
          <p>{{ flow.description }}</p>
          <span v-if="locked(flow.key)" class="chip"><IconLock :size="12" />Connect Gmail</span
          ><span v-else-if="statuses[flow.key] === 'completed'" class="chip"
            ><IconCheck :size="12" />Completed</span
          ><span v-else-if="statuses[flow.key] === 'active'" class="chip">In progress</span>
          <div v-if="statuses[flow.key] && statuses[flow.key] !== 'unstarted'" class="flow-actions">
            <button
              v-if="statuses[flow.key] === 'active'"
              class="primary"
              :disabled="starting"
              @click="activate(flow.key)"
            >
              Resume
            </button>
            <button :disabled="starting" @click="activate(flow.key, 'restart')">
              Start from beginning
            </button>
          </div>
        </div>
      </component>
    </div>
  </section>
</template>
<style scoped>
.guided-flow-card--current {
  outline: 2px solid #72a5dd;
  outline-offset: -2px;
}
.celebrating {
  background: #f0fff5;
}
.flow-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}
.flow-actions button {
  font-size: 11px;
  padding: 5px 8px;
}
.gallery {
  margin-top: 48px;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}
h2 {
  font-size: 14px;
  margin: 0 0 4px;
  font-weight: 500;
}
p {
  font-size: 12px;
  color: #777;
}
.controls {
  display: flex;
  gap: 6px;
}
.controls button {
  padding: 5px;
  display: flex;
  border-radius: 50%;
}
.controls button:disabled {
  cursor: default;
}
.track {
  display: flex;
  overflow-x: auto;
  gap: 12px;
  scroll-snap-type: x mandatory;
  padding-bottom: 12px;
  scrollbar-width: thin;
}
.flow-card {
  flex: 0 0 calc((100% - 24px) / 3);
  min-width: 235px;
  padding: 0;
  overflow: hidden;
  border: 1px solid #e8e8e8;
  border-radius: 16px;
  text-align: left;
  scroll-snap-align: start;
}
.flow-card:hover {
  border-color: #ccc;
}
.copy {
  padding: 16px;
  min-height: 135px;
}
h3 {
  font-size: 13px;
  font-weight: 500;
  margin: 0 0 6px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 99px;
  margin-top: 12px;
  font-size: 10px;
}
</style>
