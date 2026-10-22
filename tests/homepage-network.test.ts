import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }))
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }))
vi.mock('node:https', () => ({ request: mocks.request }))
vi.mock('node:http', () => ({ request: mocks.request }))
import { fetchHomepageText } from '../server/utils/homepage'
beforeEach(() => { vi.resetAllMocks(); mocks.lookup.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]) })
afterEach(() => { vi.useRealTimers() })
function response(status: number, headers: Record<string, string>, body: string) {
  mocks.request.mockImplementationOnce((_url, _options, callback) => {
    const request = new EventEmitter() as EventEmitter & { end: () => void }
    request.end = () => {
      const stream = new EventEmitter()
      Object.assign(stream, { statusCode: status, headers, resume: () => {}, destroy: (error: Error) => stream.emit('error', error) })
      callback(stream)
      stream.emit('data', Buffer.from(body)); stream.emit('end')
    }
    return request
  })
}
describe('homepage network boundaries', () => {
  it('pins the connection to the validated DNS address while retaining the URL host', async () => {
    response(200, { 'content-type': 'text/html' }, '<p>Public company</p>')
    expect(await fetchHomepageText('public.example')).toBe('Public company')
    const [url, options] = mocks.request.mock.calls[0]!
    expect(url.hostname).toBe('public.example')
    const callback = vi.fn(); options.lookup('public.example', {}, callback)
    expect(callback).toHaveBeenCalledWith(null, '1.1.1.1', 4)
  })
  it('rejects mixed public/private DNS answers before opening a socket', async () => {
    mocks.lookup.mockResolvedValue([{ address: '1.1.1.1', family: 4 }, { address: '10.0.0.1', family: 4 }])
    expect(await fetchHomepageText('public.example')).toBe('')
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('revalidates redirect targets and blocks metadata/private destinations', async () => {
    response(302, { location: 'http://169.254.169.254/' }, '')
    expect(await fetchHomepageText('public.example')).toBe('')
    expect(mocks.request).toHaveBeenCalledTimes(1)
  })
  it('bounds DNS resolution as part of the 8-second deadline', async () => {
    vi.useFakeTimers()
    mocks.lookup.mockImplementation(() => new Promise(() => {}))
    const result = fetchHomepageText('slow.example')
    await vi.advanceTimersByTimeAsync(8000)
    expect(await result).toBe('')
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('rejects oversized pages before text extraction', async () => {
    response(200, { 'content-type': 'text/html' }, 'a'.repeat(512001))
    expect(await fetchHomepageText('large.example')).toBe('')
  })
})
