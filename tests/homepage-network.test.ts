import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }))
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }))
vi.mock('node:https', () => ({ request: mocks.request }))
vi.mock('node:http', () => ({ request: mocks.request }))
import { fetchHomepageText } from '../server/utils/homepage'
beforeEach(() => { vi.resetAllMocks(); mocks.lookup.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]) })
afterEach(() => { vi.useRealTimers() })
function response(status: number, headers: Record<string, string>, body: string | string[]) {
  const destroy = vi.fn()
  mocks.request.mockImplementationOnce((_url, _options, callback) => {
    const request = new EventEmitter() as EventEmitter & { end: () => void }
    request.end = () => {
      const stream = new EventEmitter()
      Object.assign(stream, { statusCode: status, headers, resume: () => {}, destroy })
      callback(stream)
      for (const chunk of typeof body === 'string' ? [body] : body) {
        stream.emit('data', Buffer.from(chunk))
        if (destroy.mock.calls.length) return
      }
      stream.emit('end')
    }
    return request
  })
  return destroy
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
  it('uses the capped prefix of a large response and stops reading mid-script', async () => {
    const destroy = response(200, { 'content-type': 'text/html' }, [
      '<title>Large company</title><p>Useful company information</p><script>',
      'private hydration JSON noise'.repeat(60_000),
      '</script><p>Beyond the cap</p>',
    ])
    expect(await fetchHomepageText('large.example')).toBe('Title: Large company\nUseful company information')
    expect(destroy).toHaveBeenCalledOnce()
    expect(destroy).toHaveBeenCalledWith()
  })
  it('follows a redirect chain with relative and absolute locations and validates each host', async () => {
    response(301, { location: '/home' }, '')
    response(302, { location: 'https://www.public.example/home' }, '')
    response(200, { 'content-type': 'text/html' }, '<p>Company homepage after redirects</p>')
    expect(await fetchHomepageText('public.example')).toBe('Company homepage after redirects')
    expect(mocks.request.mock.calls.map(([url]) => url.href)).toEqual(['https://public.example/', 'https://public.example/home', 'https://www.public.example/home'])
    expect(mocks.lookup.mock.calls.map(([host]) => host)).toEqual(['public.example', 'public.example', 'www.public.example'])
  })
  it('bounds redirect loops', async () => {
    for (let i = 0; i < 4; i++) response(302, { location: '/' }, '')
    expect(await fetchHomepageText('public.example')).toBe('')
    expect(mocks.request).toHaveBeenCalledTimes(4)
  })
})
