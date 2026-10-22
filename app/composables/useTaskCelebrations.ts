import confetti from 'canvas-confetti'
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
  function save(key: string) {
    seen.add(key)
    queued.delete(key)
    displayed.value = [...seen]
    try {
      localStorage.setItem(`onboarding-seen-tasks:${identity.value}`, JSON.stringify([...seen]))
    } catch {
      /* Storage is optional. */
    }
  }
  function run(key: string) {
    if (document.hidden) {
      queued.delete(key)
      return
    }
    const card = document.querySelector<HTMLElement>(`[data-task="${key}"]`)
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (card && !reduced)
      card.animate(
        [
          { transform: 'scale(1)', offset: 0 },
          { transform: 'scale(.9)', offset: 0.7 },
          { transform: 'scale(1.05)', offset: 0.9 },
          { transform: 'scale(1)', offset: 1 },
        ],
        { duration: 700 },
      )
    later(
      () => {
        celebrate(card)
        save(key)
      },
      reduced ? 0 : 490,
    )
  }
  function reconcile() {
    if (!mounted || document.hidden) return
    for (const row of completions.value)
      if (!seen.has(row.taskKey) && !queued.has(row.taskKey)) {
        queued.add(row.taskKey)
        later(() => run(row.taskKey), 500)
      }
  }
  function initialize() {
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
    seen.clear()
    queued.clear()
    try {
      const stored: unknown = JSON.parse(
        localStorage.getItem(`onboarding-seen-tasks:${identity.value}`) || '[]',
      )
      if (Array.isArray(stored))
        for (const key of stored) if (typeof key === 'string') seen.add(key)
    } catch {
      /* Ignore corrupt storage. */
    }
    displayed.value = [...seen]
    reconcile()
  }
  onMounted(() => {
    mounted = true
    initialize()
    document.addEventListener('visibilitychange', reconcile)
  })
  watch(completions, reconcile)
  watch(identity, () => {
    if (mounted) initialize()
  })
  onUnmounted(() => {
    mounted = false
    for (const timer of timers) clearTimeout(timer)
    document.removeEventListener('visibilitychange', reconcile)
  })
  return computed(() => completions.value.filter((row) => displayed.value.includes(row.taskKey)))
}
