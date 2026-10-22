/** Batch realtime bursts and serialize requests. Events during a request get
 * one trailing refresh, so an older response cannot hide a newer change.
 */
export function createCoalescedRefresh(refresh: () => Promise<unknown>, delay = 100) {
  type Waiter = { resolve: () => void; reject: (error: unknown) => void }
  let pending: Waiter[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false
  let disposed = false

  function arm() {
    if (!running && !disposed && !timer && pending.length) timer = setTimeout(run, delay)
  }
  async function run() {
    timer = undefined
    running = true
    const batch = pending
    pending = []
    try {
      await refresh()
      for (const waiter of batch) waiter.resolve()
    } catch (error) {
      for (const waiter of batch) waiter.reject(error)
    } finally {
      running = false
      arm()
    }
  }
  return {
    schedule(): Promise<void> {
      if (disposed) return Promise.resolve()
      return new Promise((resolve, reject) => {
        pending.push({ resolve, reject })
        arm()
      })
    },
    dispose() {
      disposed = true
      clearTimeout(timer)
      timer = undefined
      for (const waiter of pending) waiter.resolve()
      pending = []
    },
  }
}
