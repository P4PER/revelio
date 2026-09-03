import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import type { SearchResult } from '@revelio/search'
import en from '@/../messages/en.json'
import type { BuilderState } from '@/lib/deck-model'
import { DeckBuilder } from '@/components/deck/deck-builder'

const EMPTY_RESULT: SearchResult = { hits: [], total: 0, page: 1, hitsPerPage: 24 }

const createDeckAction = vi.fn(async () => ({ ok: true, id: 'new-id' }))
const updateDeckAction = vi.fn(async () => ({ ok: true, id: 'existing-id' }))
const searchDeckCards = vi.fn(async (): Promise<SearchResult> => EMPTY_RESULT)
const getCardDetailAction = vi.fn(() => new Promise(() => {}))
const getCardViewsAction = vi.fn(async () => ({}))
const resolveImportNames = vi.fn(async () => ({}))
vi.mock('@/lib/actions/deck-actions', () => ({
  createDeckAction: (...a: unknown[]) => createDeckAction(...a),
  updateDeckAction: (...a: unknown[]) => updateDeckAction(...a),
  searchDeckCards: (...a: unknown[]) => searchDeckCards(...a),
  getCardDetailAction: (...a: unknown[]) => getCardDetailAction(...a),
  getCardViewsAction: (...a: unknown[]) => getCardViewsAction(...a),
  resolveImportNames: (...a: unknown[]) => resolveImportNames(...a),
}))

const push = vi.fn()
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ push }),
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// jsdom's localStorage is flaky under this test runner, and the guest-draft
// persistence itself is out of scope here — stub the localStorage-backed
// draft functions with an in-memory box so this file can focus on the
// save-on-login prompt's own logic (show/hide/accept/dismiss).
const draftBox = vi.hoisted(() => ({ current: null as BuilderState | null }))
vi.mock('@/lib/deck-model', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/deck-model')>()
  return {
    ...actual,
    loadDraft: () => draftBox.current,
    saveDraft: vi.fn(),
    clearDraft: () => {
      draftBox.current = null
    },
  }
})

// jsdom ships no IntersectionObserver. The builder uses one to retire the
// floating pane switch once the builder itself has scrolled out of view, so
// stub it and keep a handle on the callback to drive that from a test.
const observers: Array<(entries: { isIntersecting: boolean }[]) => void> = []
class StubIntersectionObserver {
  constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
    observers.push(cb)
  }
  observe() {}
  disconnect() {}
}
vi.stubGlobal('IntersectionObserver', StubIntersectionObserver)

const emptyState: BuilderState = { name: '', format: 'revival', visibility: 'private', entries: [] }

const draftEntry = {
  cardId: 'accio', zone: 'main' as const, quantity: 2, name: 'Accio', cost: 1, setCode: 'BS', number: '1',
  lesson: null, isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false,
}

function renderBuilder(overrides: Partial<Parameters<typeof DeckBuilder>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DeckBuilder initial={emptyState} deckId={null} loggedIn={false} sets={[]} imageBase="" {...overrides} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  createDeckAction.mockClear()
  updateDeckAction.mockClear()
  push.mockClear()
  draftBox.current = null
  observers.length = 0
})

describe('DeckBuilder save-on-login prompt', () => {
  it('offers to save a non-empty guest draft once the user is logged in, and saves it on accept', async () => {
    draftBox.current = { name: 'My Draft', format: 'revival', visibility: 'private', entries: [draftEntry] }
    renderBuilder({ loggedIn: true, deckId: null })

    expect(await screen.findByText('Save this deck to your account?')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Save to account' }))

    await waitFor(() => expect(createDeckAction).toHaveBeenCalledTimes(1))
    expect(createDeckAction).toHaveBeenCalledWith({
      name: 'My Draft',
      format: 'revival',
      visibility: 'private',
      cards: [{ cardId: 'accio', zone: 'main', quantity: 2 }],
    })
    expect(draftBox.current).toBeNull()
    expect(push).toHaveBeenCalledWith('/decks/new-id')
  })

  it('hides the banner on dismiss without touching the stored draft', async () => {
    draftBox.current = { name: 'My Draft', format: 'revival', visibility: 'private', entries: [draftEntry] }
    renderBuilder({ loggedIn: true, deckId: null })

    expect(await screen.findByText('Save this deck to your account?')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Not now' }))

    expect(screen.queryByText('Save this deck to your account?')).not.toBeInTheDocument()
    expect(createDeckAction).not.toHaveBeenCalled()
    expect(draftBox.current).not.toBeNull()
  })

  it('does not show the prompt when there is no draft, when logged out, or when editing an existing deck', () => {
    renderBuilder({ loggedIn: true, deckId: null })
    expect(screen.queryByText('Save this deck to your account?')).not.toBeInTheDocument()

    draftBox.current = { name: '', format: 'revival', visibility: 'private', entries: [] }
    renderBuilder({ loggedIn: true, deckId: null })
    expect(screen.queryByText('Save this deck to your account?')).not.toBeInTheDocument()

    draftBox.current = { name: 'My Draft', format: 'revival', visibility: 'private', entries: [draftEntry] }
    renderBuilder({ loggedIn: true, deckId: 'existing-id' })
    expect(screen.queryByText('Save this deck to your account?')).not.toBeInTheDocument()
  })
})

describe('DeckBuilder command bar layout', () => {
  // Every control stays in the one bar, which sits above both panes and so
  // stays reachable whichever pane is on screen - the format in particular,
  // since it picks the pool the browser searches. What changed is the shape:
  // below sm the bar is a three-column grid laying those controls out in two
  // rows rather than stacking each into its own.
  it('keeps the name, format, import, export and save in a single bar', () => {
    renderBuilder({ loggedIn: true })
    const bar = screen.getByLabelText(en.decks.namePlaceholder).closest('div')!
    expect(bar).toContainElement(screen.getByRole('group', { name: en.decks.format.label }))
    expect(bar).toContainElement(screen.getByRole('button', { name: en.decks.import.button }))
    expect(bar).toContainElement(screen.getByRole('button', { name: en.decks.export.button }))
    expect(bar).toContainElement(screen.getByRole('button', { name: en.decks.save }))
  })

  it('lays the bar out in two rows below sm and one from sm up', () => {
    renderBuilder({ loggedIn: true })
    const bar = screen.getByLabelText(en.decks.namePlaceholder).closest('div')!
    expect(bar).toHaveClass('grid', 'grid-cols-[1fr_auto_auto]', 'sm:flex')
    // row one: the deck's name and the primary action
    expect(screen.getByLabelText(en.decks.namePlaceholder)).toHaveClass('col-span-2', 'row-start-1')
    expect(screen.getByRole('button', { name: en.decks.save })).toHaveClass('col-start-3', 'row-start-1')
    // row two: the format and the two secondary actions
    // justify-self-start, or the 1fr name column stretches it to full width
    expect(screen.getByRole('group', { name: en.decks.format.label })).toHaveClass(
      'col-start-1',
      'row-start-2',
      'justify-self-start',
    )
    expect(screen.getByRole('button', { name: en.decks.import.button }).parentElement).toHaveClass(
      'col-start-2',
      'row-start-2',
      'sm:contents',
    )
  })

  it('wires the format switch into the builder state', async () => {
    // Placement alone is not the feature: flipping the switch has to reach
    // BuilderState, which is what re-runs the search against the other pool.
    // The placeholder names the live format, so it doubles as the readout.
    renderBuilder()
    expect(screen.getByRole('searchbox')).toHaveAttribute(
      'placeholder',
      en.decks.browse.searchPlaceholder.replace('{format}', en.decks.format.revival),
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: en.decks.format.classic }))

    expect(screen.getByRole('searchbox')).toHaveAttribute(
      'placeholder',
      en.decks.browse.searchPlaceholder.replace('{format}', en.decks.format.classic),
    )
  })

  it('leaves every control on screen rather than behind a disclosure', () => {
    // An overflow toggle traded four rows for a hidden menu, which is worse:
    // a bare glyph that opens an inline panel reads as neither.
    renderBuilder()
    expect(screen.getByRole('group', { name: en.decks.format.label })).not.toHaveClass('hidden')
    expect(screen.getByRole('button', { name: en.decks.import.button }).parentElement).not.toHaveClass('hidden')
  })

  it('folds the import and export labels away below sm, keeping their names', () => {
    // Row two only fits the format switch plus both actions once the labels
    // give way to their icons; aria-label carries the accessible name.
    renderBuilder()
    for (const label of [en.decks.import.button, en.decks.export.button]) {
      const button = screen.getByRole('button', { name: label })
      expect(button).toHaveAttribute('aria-label', label)
      expect(button.querySelector('span')).toHaveClass('max-sm:hidden')
    }
  })
})

// The deck pane's accessible name is an ICU plural, so match the parts the
// tests are about - the label out of en.json and the live count - rather than
// pasting the rendered English back in.
const deckTabName = (count: number) => new RegExp(`^${en.decks.panes.deck}\\b.*\\b${count}\\b`)

describe('DeckBuilder mobile pane switch', () => {
  // Below md the two panes used to stack, which put the deck a full
  // screen-scroll under the card browser: you added a card and nothing you
  // could see changed. A segmented switch gives each pane the viewport
  // instead, and both stay mounted so the browser's query, filters and
  // scroll position survive a trip to the deck and back.
  it('opens on the card browser with the deck a tap away', () => {
    renderBuilder()
    const group = screen.getByRole('group', { name: en.decks.panes.label })
    expect(group).toHaveClass('md:hidden')
    expect(screen.getByRole('button', { name: en.decks.panes.browse })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: deckTabName(0) })).toHaveAttribute('aria-pressed', 'false')
  })

  it('swaps which pane is on screen when the deck is picked', async () => {
    const { container } = renderBuilder()
    const browse = container.querySelector('[data-pane="browse"]')!
    const deck = container.querySelector('[data-pane="deck"]')!
    expect(browse).not.toHaveClass('hidden')
    expect(deck).toHaveClass('hidden')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: deckTabName(0) }))

    expect(deck).not.toHaveClass('hidden')
    expect(browse).toHaveClass('hidden')
  })

  it('shows both panes from md up, whichever one the switch has selected', async () => {
    const { container } = renderBuilder()
    const browse = container.querySelector('[data-pane="browse"]')!
    const deck = container.querySelector('[data-pane="deck"]')!

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: deckTabName(0) }))

    expect(browse).toHaveClass('md:block')
    expect(deck).toHaveClass('md:flex')
  })

  it('counts every copy in every zone on the deck button', () => {
    renderBuilder({
      initial: {
        ...emptyState,
        entries: [
          { ...draftEntry, quantity: 2 },
          { ...draftEntry, cardId: 'alohomora', name: 'Alohomora', zone: 'sideboard', quantity: 3 },
        ],
      },
    })
    expect(screen.getByRole('button', { name: deckTabName(5) })).toBeInTheDocument()
  })

  it('pins the switch to the bottom of the viewport, outside the builder card', () => {
    // Inline, the switch scrolled off the top the moment you started browsing,
    // so reaching the deck meant scrolling back up. It has to sit outside the
    // builder's own root, whose overflow-hidden would clip it, and its inset
    // matches the page container's px-6 so its edges line up with the card.
    // The bottom inset clears the iOS home indicator where there is one.
    renderBuilder()
    const group = screen.getByRole('group', { name: en.decks.panes.label })
    expect(group).toHaveClass('fixed', 'left-6', 'right-6', 'md:hidden')
    expect(group.className).toContain('bottom-[max(1rem,env(safe-area-inset-bottom))]')
    expect(group.closest('.overflow-hidden')).toBeNull()
  })

  it('retires the floating switch once the builder has scrolled out of view', () => {
    // Fixed to the viewport, the bar would otherwise hover over the footer and
    // sit on top of its language switcher for the whole page.
    renderBuilder()
    const group = screen.getByRole('group', { name: en.decks.panes.label })
    expect(group).not.toHaveClass('hidden')

    act(() => observers.forEach((cb) => cb([{ isIntersecting: false }])))
    expect(group).toHaveClass('hidden')

    act(() => observers.forEach((cb) => cb([{ isIntersecting: true }])))
    expect(group).not.toHaveClass('hidden')
  })

  it('replays the badge animation on every add by keying it to the add nonce', () => {
    // The count is the only feedback an add gives while you are on the browse
    // pane. Remounting the badge per add replays its enter animation, so the
    // number does not just quietly tick over.
    renderBuilder()
    const badge = screen.getByTestId('deck-pane-count')
    expect(badge).toHaveClass('motion-safe:animate-in', 'motion-safe:zoom-in-50')
  })
})
