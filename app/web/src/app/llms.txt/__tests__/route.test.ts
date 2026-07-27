import { describe, it, expect } from 'vitest'
import { GET } from '../route'

describe('/llms.txt', () => {
  it('serves plain-text markdown', async () => {
    const res = GET()
    expect(res.headers.get('Content-Type')).toMatch(/text\/plain/)
    expect(res.headers.get('Cache-Control')).toMatch(/max-age/)
    await expect(res.text()).resolves.toContain('# Revelio')
  })

  it('links core pages and the sitemap with absolute URLs', async () => {
    const text = await GET().text()
    expect(text).toContain('https://revelio.cards/search')
    expect(text).toContain('https://revelio.cards/sets')
    expect(text).toContain('https://revelio.cards/sitemap.xml')
  })

  it('states the fan-project / non-affiliation disclaimer', async () => {
    const text = await GET().text()
    expect(text).toMatch(/unofficial/i)
    expect(text).toMatch(/not affiliated/i)
  })
})
