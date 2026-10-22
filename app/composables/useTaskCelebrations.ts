import confetti from 'canvas-confetti'
import { readCelebrations } from '../utils/celebration-storage'
import type { Completion } from '#shared/onboarding'
const colors = [
  '#ff4d4f',
  '#ffd43b',
  '#2f6df6',
  '#22c55e',
  '#ff8a1f',
  '#7c3aed',
  '#00b8d9',
  '#f43f5e',
]
export function celebrate(element?: HTMLElement | null) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const box = element?.getBoundingClientRect()
  const x = box ? (box.left + box.width / 2) / innerWidth : 0.5
  const y = box ? (box.top + box.height / 2) / innerHeight : 0.5
  for (let edge = 0; edge < 4; edge++) {
    void confetti({
      particleCount: 50,
      spread: 150,
      angle: edge * 90,
      startVelocity: 12,
      gravity: 0.5,
      ticks: 70,
      scalar: 0.65,
      colors,
      disableForReducedMotion: true,
      origin: {
        x: x + (box && edge % 2 === 0 ? ((edge === 0 ? 1 : -1) * box.width) / innerWidth / 2 : 0),
        y: y + (box && edge % 2 === 1 ? ((edge === 1 ? -1 : 1) * box.height) / innerHeight / 2 : 0),
      },
    })
  }
}
export function useTaskCelebrations(identity: Ref<string>, completions: Ref<Completion[]>) {
  const displayed = ref<string[]>([])
  const seen = new Set<string>(),
    queued = new Set<string>()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let mounted = false
  const later = (fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      if (mounted) fn()
    }, ms)
    timers.add(timer)
  }
  const storageKey = () => `onboarding-seen-tasks:${identity.value}`
  function restoreSeen() {
    try {
      for (const key of readCelebrations(localStorage, storageKey())) seen.add(key)
    } catch {
      /* Storage is optional. */
    }
    displayed.value = [...seen]
  }
  async function run(key: string) {
    const currentIdentity = identity.value
    const claim = () => {
      if (!mounted || document.hidden || identity.value !== currentIdentity) return
      restoreSeen()
      if (seen.has(key)) return
      // Claim before firing, merging with other tabs under a shared Web Lock.
      seen.add(key)
      try {
        localStorage.setItem(storageKey(), JSON.stringify([...seen]))
      } catch {
        /* Still deduplicate within this mount when storage is unavailable. */
      }
      const card = document.querySelector<HTMLElement>(`[data-task="${key}"]`)
      if (card && !matchMedia('(prefers-reduced-motion: reduce)').matches)
        card.animate(
          [
            { transform: 'scale(1)' },
            { transform: 'scale(.95)' },
            { transform: 'scale(1.03)' },
            { transform: 'scale(1)' },
          ],
          { duration: 700 },
        )
      celebrate(card)
      displayed.value = [...seen]
    }
    try {
      // Web Locks are available in secure contexts (including localhost). The
      // storage listener also keeps passive tabs' completed cards up to date.
      if (navigator.locks) await navigator.locks.request(storageKey(), claim)
      else claim()
    } finally {
      queued.delete(key)
    }
  }
  function reconcile() {
    if (!mounted || document.hidden) return
    for (const row of completions.value)
      if (!seen.has(row.taskKey) && !queued.has(row.taskKey)) {
        queued.add(row.taskKey)
        later(() => {
          void run(row.taskKey)
        }, 500)
      }
  }
  function initialize() {
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
    seen.clear()
    queued.clear()
    restoreSeen()
    reconcile()
  }
  function storageChanged(event: StorageEvent) {
    if (event.key === storageKey()) restoreSeen()
  }
  onMounted(() => {
    mounted = true
    initialize()
    document.addEventListener('visibilitychange', reconcile)
    window.addEventListener('storage', storageChanged)
  })
  watch(completions, reconcile)
  watch(identity, () => {
    if (mounted) initialize()
  })
  onUnmounted(() => {
    mounted = false
    for (const timer of timers) clearTimeout(timer)
    document.removeEventListener('visibilitychange', reconcile)
    window.removeEventListener('storage', storageChanged)
  })
  return computed(() => completions.value.filter((row) => displayed.value.includes(row.taskKey)))
}
