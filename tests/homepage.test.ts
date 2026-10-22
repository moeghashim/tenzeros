import { describe, expect, it } from 'vitest'
import { isPublicAddress, stripHtml, fetchHomepageText } from '../server/utils/homepage'
import { domainSchema } from '../shared/validation'
describe('homepage fetch safety', () => {
  it.each(['127.0.0.1', '0.0.0.0', '10.0.0.1', '172.16.1.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', '::', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:192.168.0.1', '224.0.0.1'])('blocks non-public address %s', ip => { expect(isPublicAddress(ip)).toBe(false) })
  it.each(['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111'])('permits public address %s', ip => { expect(isPublicAddress(ip)).toBe(true) })
  it('rejects private targets without making requests and fails soft', async () => { expect(await fetchHomepageText('127.0.0.1')).toBe(''); expect(await fetchHomepageText('[::1]')).toBe('') })
  it('strips scripts, styles, markup, entities and caps extracted text', () => {
    expect(stripHtml('<style>hidden</style><script>bad()</script><p>Hello &amp; world &#33;</p>')).toBe('Hello & world !')
    expect(stripHtml('a'.repeat(20000))).toHaveLength(12000)
  })
  it('accepts domains and rejects credentials, ports, paths, and non-web schemes', () => {
    expect(domainSchema.parse('https://Example.com/')).toBe('example.com')
    for (const domain of ['file:///etc/passwd', 'https://a:b@example.com', 'example.com:8080', 'example.com/path']) expect(domainSchema.safeParse(domain).success).toBe(false)
  })
})
