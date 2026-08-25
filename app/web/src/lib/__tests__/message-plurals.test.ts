import { describe, expect, it } from 'vitest'
import { createTranslator } from 'next-intl'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

// Counted nouns have to survive a count of one. Every message here can legitimately
// reach 1 in the UI - a set with a single card, a deck with a single view.
const CASES: Array<{ key: string; values: Record<string, unknown>; en: string; de: string }> = [
  { key: 'search.results', values: { count: 1 }, en: '1 card', de: '1 Karte' },
  { key: 'decks.explore.count', values: { count: 1 }, en: '1 deck', de: '1 Deck' },
  { key: 'sets.meta', values: { count: 1, date: '2001' }, en: '1 card · released 2001', de: '1 Karte · erschienen 2001' },
  { key: 'decks.overview.cardCount', values: { count: 1 }, en: '1 card', de: '1 Karte' },
  { key: 'decks.overview.views', values: { count: 1 }, en: '1 view', de: '1 Aufruf' },
  { key: 'decks.status.incompleteNeeds', values: { count: 1 }, en: 'Incomplete · needs 1 more card', de: 'Unvollständig · noch 1 Karte nötig' },
  { key: 'decks.status.tooMany', values: { count: 1 }, en: '1 card too many', de: '1 Karte zu viel' },
  { key: 'decks.stats.lessonCards', values: { count: 1 }, en: '1 lesson card', de: '1 Lektionskarte' },
  { key: 'collection.copies', values: { count: 1 }, en: '1 copy', de: '1 Exemplar' },
]

describe('counted messages', () => {
  const t = { en: createTranslator({ locale: 'en', messages: en }), de: createTranslator({ locale: 'de', messages: de }) }

  it.each(CASES)('reads $key in the singular for a count of one', ({ key, values, ...expected }) => {
    // @ts-expect-error - the table addresses keys by string, which the generated key union rejects
    expect(t.en(key, values)).toBe(expected.en)
    // @ts-expect-error - as above, for the German catalogue
    expect(t.de(key, values)).toBe(expected.de)
  })

  it('keeps the plural form and thousand separators above one', () => {
    expect(t.en('search.results', { count: 1098 })).toBe('1,098 cards')
    expect(t.de('search.results', { count: 1098 })).toBe('1.098 Karten')
  })
})
