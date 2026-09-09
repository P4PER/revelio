import { describe, it, expect } from 'vitest'
import type { SearchDocument } from '@revelio/search'
import { searchEmbed } from '../src/discord/embeds/search-embed'

function hit(n: number): SearchDocument {
  return {
    id: `base-${n}`, setCode: 'base', number: String(n), numberSort: `0:${n}`,
    name: `Card ${n}`, text: null, flavorText: null, types: [], subTypes: [],
    lesson: null, rarity: null, finishes: [], legality: null, cost: null,
    damage: null, isOfficial: true, imageLang: null, imageVersion: null,
    artCropVersion: null, defaultLanguage: 'en', orientation: null,
  }
}

const opts = { locale: 'en', query: 'card', siteBase: 'https://revelio.cards' }

describe('searchEmbed', () => {
  it('lists one line per hit', () => {
    const page = { hits: [hit(1), hit(2)], total: 2, page: 1, pageSize: 10, pages: 1 }
    const json = searchEmbed(page, opts).toJSON()
    expect(json.description).toContain('**Card 1** · base #1')
    expect(json.description).toContain('**Card 2** · base #2')
  })

  it('reports the total and links to the full search', () => {
    const page = { hits: [hit(1)], total: 42, page: 1, pageSize: 10, pages: 5 }
    const json = searchEmbed(page, opts).toJSON()
    expect(json.title).toBe('42 cards')
    expect(json.url).toBe('https://revelio.cards/search?q=card')
  })

  it('shows the page position in the footer', () => {
    const page = { hits: [hit(1)], total: 42, page: 3, pageSize: 10, pages: 5 }
    const json = searchEmbed(page, opts).toJSON()
    expect(json.footer?.text).toContain('Page 3 of 5')
  })

  it('does not throw when the page carries no hits', () => {
    // total comes from Meilisearch's estimatedTotalHits, which over-estimates, so a
    // page inside `pages` can still come back empty. setDescription('') would throw.
    const page = { hits: [], total: 25, page: 3, pageSize: 10, pages: 3 }
    const json = searchEmbed(page, opts).toJSON()
    expect(json.description ?? '').toBe('')
  })

  it('keeps the description inside the 4096 character limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...hit(i), name: 'z'.repeat(600) }))
    const page = { hits: many, total: 10, page: 1, pageSize: 10, pages: 1 }
    const json = searchEmbed(page, opts).toJSON()
    expect((json.description ?? '').length).toBeLessThanOrEqual(4096)
  })
})
