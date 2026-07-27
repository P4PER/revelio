import { describe, it, expect } from 'vitest'
import { routing } from '@/../i18n/routing'
import { BRAND_NAME } from '@/lib/brand'
import { GET } from '../route'

describe('/llms.txt', () => {
  it('serves plain-text markdown titled with the brand name', async () => {
    const res = GET()
    expect(res.headers.get('Content-Type')).toMatch(/text\/plain/)
    expect(res.headers.get('Cache-Control')).toMatch(/max-age/)
    await expect(res.text()).resolves.toContain(`# ${BRAND_NAME}`)
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

  it('derives the locale list from routing config (no hardcoded locales)', async () => {
    const text = await GET().text()
    for (const locale of routing.locales) {
      expect(text).toContain(`(${locale}`)
    }
  })

  it('keeps every H2 section as a pure list of markdown links (llms.txt spec)', async () => {
    const lines = (await GET().text()).split('\n')
    let inSection = false
    for (const line of lines) {
      if (line.startsWith('## ')) { inSection = true; continue }
      if (!inSection) continue // free prose above the first H2 is allowed
      if (line.trim() === '' || line.startsWith('#')) continue
      // Inside an H2 section, every non-blank line must be a link list item.
      expect(line).toMatch(/^- \[[^\]]+\]\(https?:\/\/[^)]+\)/)
    }
  })
})
