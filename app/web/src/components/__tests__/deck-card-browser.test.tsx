import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import type { SearchDocument, SearchResult } from '@revelio/search'
import en from '@/../messages/en.json'
import { DeckCardBrowser } from '../deck-card-browser'

const searchDeckCards = vi.fn(async (): Promise<SearchResult> => FIXED_RESULT)
const getCardDetailAction = vi.fn(() => new Promise(() => {})) // never resolves by default
vi.mock('@/lib/actions/deck-actions', () => ({
  searchDeckCards: (...a: unknown[]) => searchDeckCards(...a),
  getCardDetailAction: (...a: unknown[]) => getCardDetailAction(...a),
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
    finishes: [],
    legality: 'legal',
    cost: 2,
    isOfficial: true,
    orientation: null,
    imageLang: null,
    defaultLanguage: 'en',
    ...overrides,
  }
}

// One banned card (Revival-illegal), one card already at the 4-copy limit, one
// plain legal/under-limit card, and one witch/wizard character card that
// qualifies as a starting character.
const FIXED_RESULT: SearchResult = {
  hits: [
    hit({ id: 'banned-card', name: 'Banned Card', legality: 'banned' }),
    hit({ id: 'maxed-card', name: 'Maxed Card', legality: 'legal' }),
    hit({ id: 'ok-card', name: 'OK Card', legality: 'legal' }),
    hit({ id: 'char-card', name: 'Char Card', legality: 'legal', types: ['character'], subTypes: ['witch'] }),
    hit({ id: 'wide-card', name: 'Wide Card', legality: 'legal', orientation: 'horizontal' }),
  ],
  total: 5,
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

beforeEach(() => {
  searchDeckCards.mockClear()
  getCardDetailAction.mockClear()
})

describe('DeckCardBrowser', () => {
  it('disables the Add trigger for a banned card in Revival, but not for a plain legal card', async () => {
    renderBrowser(() => false)

    await waitFor(() => expect(screen.getByText('5 cards')).toBeInTheDocument(), { timeout: 2000 })

    expect(screen.getByRole('button', { name: 'Add Banned Card' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add OK Card' })).not.toBeDisabled()
  })

  it('shows ghost tiles instead of the empty state until the first search resolves', async () => {
    renderBrowser(() => false)

    expect(screen.getByRole('status', { name: 'Loading cards…' })).toBeInTheDocument()
    expect(screen.queryByText('No cards found.')).not.toBeInTheDocument()

    await waitFor(() => expect(screen.getByText('5 cards')).toBeInTheDocument(), { timeout: 2000 })
    expect(screen.queryByRole('status', { name: 'Loading cards…' })).not.toBeInTheDocument()
  })

  it('keeps the results on screen while a refetch is in flight', async () => {
    const user = userEvent.setup()
    renderBrowser(() => false)
    await waitFor(() => expect(screen.getByText('5 cards')).toBeInTheDocument(), { timeout: 2000 })

    await user.type(screen.getByRole('searchbox'), 'wand')
    expect(screen.getByRole('button', { name: 'Add OK Card' })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Loading cards…' })).not.toBeInTheDocument()
  })

  it('offers Main/Sideboard items for any card, and a "starting character" item only for a character-eligible card', async () => {
    const user = userEvent.setup()
    renderBrowser(() => false)
    await waitFor(() => expect(screen.getByText('5 cards')).toBeInTheDocument(), { timeout: 2000 })

    await user.click(screen.getByRole('button', { name: 'Add OK Card' }))
    expect(await screen.findByRole('menuitem', { name: 'Add to main deck' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Add to sideboard' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Set as starting character' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: 'Add Char Card' }))
    expect(await screen.findByRole('menuitem', { name: 'Set as starting character' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Add to main deck' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Add to sideboard' })).toBeInTheDocument()
  })

  it('disables the Main/Sideboard menu items once the copy limit is reached, and clicking them does not call onAdd', async () => {
    const user = userEvent.setup()
    const copyLimitReached = (cardId: string) => cardId === 'maxed-card'
    const onAdd = vi.fn()
    renderBrowser(copyLimitReached, onAdd)
    await waitFor(() => expect(screen.getByText('5 cards')).toBeInTheDocument(), { timeout: 2000 })

    await user.click(screen.getByRole('button', { name: 'Add Maxed Card' }))
    const mainItem = await screen.findByRole('menuitem', { name: 'Add to main deck' })
    const sideboardItem = screen.getByRole('menuitem', { name: 'Add to sideboard' })
    expect(mainItem).toHaveAttribute('aria-disabled', 'true')
    expect(sideboardItem).toHaveAttribute('aria-disabled', 'true')

    await user.click(mainItem)
    await user.click(sideboardItem)
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('calls onAdd with the chosen zone when a menu item is selected', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    renderBrowser(() => false, onAdd)
    await waitFor(() => expect(screen.getByText('5 cards')).toBeInTheDocument(), { timeout: 2000 })

    await user.click(screen.getByRole('button', { name: 'Add OK Card' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Add to sideboard' }))
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ cardId: 'ok-card' }), 'sideboard')

    await user.click(screen.getByRole('button', { name: 'Add Char Card' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Set as starting character' }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ cardId: 'char-card' }), 'character')
  })

  // The deck panel sizes a card's detail skeleton from the entry's orientation,
  // so a card added here has to carry it the way the server-loaded views do -
  // otherwise a horizontal card jumps on open until the deck is saved.
  it('carries the card orientation into the added view', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    renderBrowser(() => false, onAdd)
    await waitFor(() => expect(screen.getByText('5 cards')).toBeInTheDocument(), { timeout: 2000 })

    await user.click(screen.getByRole('button', { name: 'Add Wide Card' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Add to main deck' }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ orientation: 'horizontal' }), 'main')
  })

  // A count that arrives in a freshly mounted live region goes unannounced by
  // most screen readers, so the region has to outlive the loading state.
  it('updates the result count in place rather than remounting its live region', async () => {
    renderBrowser(() => false)

    const countRegion = screen.getAllByRole('status').find((el) => !el.hasAttribute('aria-label'))
    expect(countRegion).toBeDefined()

    await waitFor(() => expect(screen.getByText('5 cards')).toBeInTheDocument(), { timeout: 2000 })
    expect(countRegion).toHaveTextContent('5 cards')
  })

  it('opens the card detail Sheet and fetches the card when the Info button is clicked', async () => {
    const user = userEvent.setup()
    renderBrowser(() => false)
    await waitFor(() => expect(screen.getByText('5 cards')).toBeInTheDocument(), { timeout: 2000 })

    await user.click(screen.getByRole('button', { name: 'View details for OK Card' }))
    expect(getCardDetailAction).toHaveBeenCalledWith('ok-card', 'en')
    expect(await screen.findByRole('status', { name: 'Loading…' })).toBeInTheDocument()
  })
})
