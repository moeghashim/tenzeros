import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import ipaddr from 'ipaddr.js'
import { Parser } from 'htmlparser2'

const MAX_HOMEPAGE_BYTES = 1_500_000
const MAX_TEXT_CHARS = 12_000
const excludedTags = new Set([
  'head',
  'script',
  'style',
  'noscript',
  'svg',
  'template',
  'canvas',
  'iframe',
  'object',
])
const metadataNames = ['description', 'og:title', 'og:description', 'og:site_name']

export function isPublicAddress(address: string) {
  try {
    return ipaddr.process(address).range() === 'unicast'
  } catch {
    return false
  }
}
export function stripHtml(html: string) {
  // A parser keeps truncated script/style contents out of the text, even when
  // their closing tags lie beyond the response byte cap.
  const stack: { name: string; excluded: boolean; title: boolean }[] = []
  const metadata = new Map<string, string>()
  let title = '',
    body = ''
  const normalize = (text: string) => text.replace(/\s+/g, ' ').trim()
  const parser = new Parser({
    onopentag(name, attributes) {
      body += ' '
      const parent = stack.at(-1)
      const hidden =
        'hidden' in attributes ||
        attributes['aria-hidden'] === 'true' ||
        /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attributes.style ?? '')
      stack.push({
        name,
        excluded: Boolean(parent?.excluded || hidden || excludedTags.has(name)),
        title: name === 'title' && (!parent || parent.name === 'head'),
      })
      if (name === 'meta') {
        const key = (attributes.name || attributes.property || '').toLowerCase()
        if (metadataNames.includes(key) && attributes.content && !metadata.has(key))
          metadata.set(key, normalize(attributes.content).slice(0, 500))
      }
    },
    ontext(text) {
      if (stack.at(-1)?.title) title = (title + text).slice(0, 500)
      else if (!stack.at(-1)?.excluded) body += text
    },
    onclosetag() {
      stack.pop()
      body += ' '
    },
  })
  parser.end(html)
  const fields = [
    title ? `Title: ${normalize(title)}` : '',
    ...metadataNames.map((name) => (metadata.has(name) ? `${name}: ${metadata.get(name)}` : '')),
  ].filter(Boolean)
  return [...fields, normalize(body)].filter(Boolean).join('\n').slice(0, MAX_TEXT_CHARS)
}
async function fetchPage(url: URL, signal: AbortSignal, redirects = 0): Promise<string> {
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port))
  )
    throw new Error('Unsupported URL')
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true })
  signal.throwIfAborted()
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address)))
    throw new Error('Non-public destination')
  const target = addresses[0]!
  const result = await new Promise<{ html?: string; redirect?: string }>((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        signal,
        headers: {
          'User-Agent': 'Tenzeros/0.1 (workspace context)',
          Accept: 'text/html,text/plain',
          'Accept-Encoding': 'identity',
        },
        // Keep the original host for TLS/SNI, but pin DNS to the validated address.
        lookup: (_hostname, _options, callback) => callback(null, target.address, target.family),
        family: target.family,
      },
      (response) => {
        if (response.statusCode && [301, 302, 303, 307, 308].includes(response.statusCode)) {
          response.resume()
          resolve({ redirect: response.headers.location })
          return
        }
        if (
          !response.statusCode ||
          response.statusCode >= 400 ||
          !/text\/(html|plain)/i.test(response.headers['content-type'] ?? '')
        ) {
          response.resume()
          reject(new Error('No homepage text'))
          return
        }
        const chunks: Buffer[] = []
        let bytes = 0
        const finish = () => resolve({ html: Buffer.concat(chunks).toString('utf8') })
        response.on('data', (chunk: Buffer) => {
          const retained = chunk.subarray(0, MAX_HOMEPAGE_BYTES - bytes)
          chunks.push(retained)
          bytes += retained.length
          if (bytes >= MAX_HOMEPAGE_BYTES) {
            finish()
            response.destroy()
          }
        })
        response.on('error', reject)
        response.on('end', finish)
      },
    )
    request.on('error', reject)
    request.end()
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
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          reject(new Error('Homepage timeout'))
        }, 8000)
      }),
    ])
  } catch {
    return ''
  } finally {
    clearTimeout(timer)
  }
}
