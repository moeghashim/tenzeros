import { describe, it, expect, vi } from 'vitest'
import {
  createRealtimeHub,
  emitChange,
  emitCustomEvent,
  realtimeHub,
} from '../server/utils/realtime'
describe('SSE publisher', () => {
  it('delivers row and custom events only to authorized workspace subscribers', () => {
    const own = vi.fn(),
      other = vi.fn()
    const off = realtimeHub.subscribe(['workspace-a'], own)
    const otherOff = realtimeHub.subscribe(['workspace-b'], other)
    emitChange('workspace-a', 'aiContexts', 'insert', { id: 'row-1', content: 'context' })
    emitCustomEvent('workspace-a', 'contextBootstrapStatus', { status: 'ready' })
    expect(own).toHaveBeenNthCalledWith(1, {
      workspaceId: 'workspace-a',
      type: 'insert',
      targetModel: 'aiContexts',
      targetId: 'row-1',
      data: { id: 'row-1', content: 'context' },
    })
    expect(own).toHaveBeenNthCalledWith(2, {
      workspaceId: 'workspace-a',
      type: 'custom',
      event: 'contextBootstrapStatus',
      data: { status: 'ready' },
    })
    expect(other).not.toHaveBeenCalled()
    off()
    otherOff()
    emitChange('workspace-a', 'aiContexts', 'update', { id: 'row-1' })
    expect(own).toHaveBeenCalledTimes(2)
  })
  it('a failed subscriber does not prevent delivery to others', () => {
    const hub = createRealtimeHub(),
      healthy = vi.fn()
    hub.subscribe(['a'], () => {
      throw new Error('closed connection')
    })
    hub.subscribe(['a'], healthy)
    hub.publish({ workspaceId: 'a', type: 'custom', event: 'test', data: {} })
    expect(healthy).toHaveBeenCalledOnce()
  })
})
