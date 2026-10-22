import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCoalescedRefresh } from '../app/utils/coalescedRefresh'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('context refresh coalescing', () => {
  it('coalesces connection reconciliation, four inserts, and bootstrap status into one request', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const queue = createCoalescedRefresh(refresh)
    const requests = Array.from({ length: 6 }, () => queue.schedule())
    expect(refresh).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)
    await Promise.all(requests)
    expect(refresh).toHaveBeenCalledOnce()
    queue.dispose()
  })

  it('serializes overlapping events and fetches their final state after the in-flight request', async () => {
    let finish!: () => void
    const refresh = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve })).mockResolvedValue(undefined)
    const queue = createCoalescedRefresh(refresh)
    const first = queue.schedule()
    await vi.advanceTimersByTimeAsync(100)
    const trailing = [queue.schedule(), queue.schedule()]
    await vi.advanceTimersByTimeAsync(500)
    expect(refresh).toHaveBeenCalledOnce()
    finish()
    await first
    await vi.advanceTimersByTimeAsync(100)
    await Promise.all(trailing)
    expect(refresh).toHaveBeenCalledTimes(2)
    queue.dispose()
  })

  it('cancels queued work on unmount, including events received during a request', async () => {
    let finish!: () => void
    const refresh = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const queue = createCoalescedRefresh(refresh)
    const first = queue.schedule()
    await vi.advanceTimersByTimeAsync(100)
    const trailing = queue.schedule()
    queue.dispose()
    finish()
    await Promise.all([first, trailing, queue.schedule()])
    await vi.runAllTimersAsync()
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('reports errors to callers and can refresh after a failure', async () => {
    const refresh = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(undefined)
    const queue = createCoalescedRefresh(refresh)
    const failed = expect(queue.schedule()).rejects.toThrow('Offline')
    await vi.advanceTimersByTimeAsync(100)
    await failed
    const next = queue.schedule()
    await vi.advanceTimersByTimeAsync(100)
    await next
    expect(refresh).toHaveBeenCalledTimes(2)
    queue.dispose()
  })
})
