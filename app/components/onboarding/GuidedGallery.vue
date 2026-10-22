<script setup lang="ts">
import { IconChevronLeft, IconChevronRight, IconLock, IconCheck } from '@tabler/icons-vue'
import { orderedFlows, type FlowStatus } from '#shared/onboarding'
const props = defineProps<{ workspaceId: string; hasMailbox: boolean }>()
const emit = defineEmits<{ unlock: []; toast: [message: string] }>()
const { data } = await useFetch('/api/onboarding/flows/statuses', {
  query: { workspaceId: props.workspaceId },
})
const statuses = ref<Record<string, FlowStatus>>({ ...data.value?.data.statuses })
// Capture ordering once: live status changes must not move cards under the pointer.
const flows = orderedFlows(statuses.value)
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
function activate(key: string) {
  if (locked(key)) emit('unlock')
  else emit('toast', 'Guided setup arrives in M3')
}
let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(measure)
  if (track.value) observer.observe(track.value)
  measure()
})
onUnmounted(() => observer?.disconnect())
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
        ['not_started', 'in_progress', 'completed'].includes(String(status))
      )
        statuses.value[key] = status as FlowStatus
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
      <button v-for="flow in flows" :key="flow.key" class="flow-card" @click="activate(flow.key)">
        <OnboardingGuidedPreview :flow-key="flow.key" />
        <div class="copy">
          <h3>{{ flow.title }}</h3>
          <p>{{ flow.description }}</p>
          <span v-if="locked(flow.key)" class="chip"><IconLock :size="12" />Connect Gmail</span
          ><span v-else-if="statuses[flow.key] === 'completed'" class="chip"
            ><IconCheck :size="12" />Completed</span
          ><span v-else-if="statuses[flow.key] === 'in_progress'" class="chip">In progress</span>
        </div>
      </button>
    </div>
  </section>
</template>
<style scoped>
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
