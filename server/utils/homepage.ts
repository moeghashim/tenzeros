import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import ipaddr from 'ipaddr.js'

export function isPublicAddress(address: string) {
  try { return ipaddr.process(address).range() === 'unicast' } catch { return false }
}
export function stripHtml(html: string) {
  return html.replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' ')
    .replace(/&(nbsp|amp|quot|apos|lt|gt);/g, (_, name: string) => ({ nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' })[name] ?? ' ')
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, code: string) => { const point = code[0]?.toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code); return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ' ' })
    .replace(/\s+/g, ' ').trim().slice(0, 12000)
}
async function fetchPage(url: URL, signal: AbortSignal, redirects = 0): Promise<string> {
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw new Error('Unsupported URL')
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await lookup(hostname, { all: true })
  signal.throwIfAborted()
  if (!addresses.length || addresses.some(entry => !isPublicAddress(entry.address))) throw new Error('Non-public destination')
  const target = addresses[0]!
  const result = await new Promise<{ html?: string; redirect?: string }>((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      signal, headers: { 'User-Agent': 'Tenzeros/0.1 (workspace context)', Accept: 'text/html,text/plain', 'Accept-Encoding': 'identity' },
      // Keep the original host for TLS/SNI, but pin DNS to the validated address.
      lookup: (_hostname, _options, callback) => callback(null, target.address, target.family),
      family: target.family,
    }, response => {
      if (response.statusCode && [301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume(); resolve({ redirect: response.headers.location }); return
      }
      if (!response.statusCode || response.statusCode >= 400 || !/text\/(html|plain)/i.test(response.headers['content-type'] ?? '')) {
        response.resume(); reject(new Error('No homepage text')); return
      }
      const chunks: Buffer[] = []; let bytes = 0
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length
        if (bytes > 512000) { response.destroy(new Error('Homepage too large')); return }
        chunks.push(chunk)
      })
      response.on('error', reject)
      response.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8') }))
    })
    request.on('error', reject); request.end()
  })
  if (result.redirect) {
    if (redirects >= 3) throw new Error('Too many redirects')
    return fetchPage(new URL(result.redirect, url), signal, redirects + 1)
  }
  return stripHtml(result.html ?? '')
}
export async function fetchHomepageText(domain: string): Promise<string> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      fetchPage(new URL(`https://${domain}`), controller.signal),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Homepage timeout')) }, 8000) }),
    ])
  } catch { return '' } finally { clearTimeout(timer) }
}
