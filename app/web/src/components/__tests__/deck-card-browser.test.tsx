import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { SearchDocument, SearchResult } from '@revelio/search'
import en from '@/../messages/en.json'
import { DeckCardBrowser } from '../deck-card-browser'

const searchDeckCards = vi.fn(async (): Promise<SearchResult> => FIXED_RESULT)
vi.mock('@/lib/deck-actions', () => ({
  searchDeckCards: (...a: unknown[]) => searchDeckCards(...a),
}))

function hit(overrides: Partial<SearchDocument>): SearchDocument {
  return {
    id: 'placeholder',
    setCode: 'BS',
    number: '001',
    name: 'Placeholder',
    text: null,
    flavorText: null,
    types: ['spell'],
    subTypes: [],
    lesson: 'charms',
    rarity: null,
    finish: null,
    legality: 'legal',
    cost: 2,
    isOfficial: true,
    imageLang: null,
    defaultLanguage: 'en',
    ...overrides,
  }
}

// One banned card (Revival-illegal), one card already at the 4-copy limit, and
// one plain legal/under-limit card as a contrast case.
const FIXED_RESULT: SearchResult = {
  hits: [
    hit({ id: 'banned-card', name: 'Banned Card', legality: 'banned' }),
    hit({ id: 'maxed-card', name: 'Maxed Card', legality: 'legal' }),
    hit({ id: 'ok-card', name: 'OK Card', legality: 'legal' }),
  ],
  total: 3,
  page: 1,
  hitsPerPage: 24,
}

function renderBrowser(copyLimitReached: (cardId: string, isLesson: boolean) => boolean, onAdd = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DeckCardBrowser
        format="revival"
        imageBase="http://img.test"
        sets={[]}
        copyLimitReached={copyLimitReached}
        onAdd={onAdd}
      />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => searchDeckCards.mockClear())

describe('DeckCardBrowser', () => {
  it('disables Add for a banned card in Revival and for a card already at the copy limit, but not for a plain legal card', async () => {
    const copyLimitReached = (cardId: string) => cardId === 'maxed-card'
    renderBrowser(copyLimitReached)

    await waitFor(() => expect(screen.getByText('3 cards')).toBeInTheDocument(), { timeout: 2000 })

    expect(screen.getByRole('button', { name: 'Add Banned Card' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add Maxed Card' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add OK Card' })).not.toBeDisabled()
  })

  it('does not invoke onAdd when clicking a disabled (banned or copy-limited) Add control', async () => {
    const copyLimitReached = (cardId: string) => cardId === 'maxed-card'
    const onAdd = vi.fn()
    renderBrowser(copyLimitReached, onAdd)

    await waitFor(() => expect(screen.getByText('3 cards')).toBeInTheDocument(), { timeout: 2000 })

    screen.getByRole('button', { name: 'Add Banned Card' }).click()
    screen.getByRole('button', { name: 'Add Maxed Card' }).click()
    expect(onAdd).not.toHaveBeenCalled()

    screen.getByRole('button', { name: 'Add OK Card' }).click()
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ cardId: 'ok-card' }))
  })
})
