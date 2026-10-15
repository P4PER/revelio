import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { evaluateDeck, type DeckCardView, type DeckFormat } from '@revelio/core'
import { renderWithIntl } from '@/test/intl'
import { DeckPanel } from '@/components/deck/deck-panel'

function view(cardId: string, zone: DeckCardView['zone'], quantity: number, extra: Partial<DeckCardView> = {}): DeckCardView {
  return {
    cardId, zone, quantity, name: cardId, cost: 1, setCode: 'BS', number: '1',
    lesson: null, isOfficial: true, legality: null, isLesson: false, isStartingCharacter: zone === 'character',
    ...extra,
  }
}

function evaluate(entries: DeckCardView[], format: DeckFormat) {
  const meta = Object.fromEntries(entries.map((e) => [e.cardId, { id: e.cardId, isOfficial: e.isOfficial, legality: e.legality, isLesson: e.isLesson, isStartingCharacter: e.isStartingCharacter }]))
  return evaluateDeck(entries.map((e) => ({ cardId: e.cardId, zone: e.zone, quantity: e.quantity })), format, meta)
}

function row(key: string) {
  return document.querySelector(`[data-row-key="${key}"]`) as HTMLElement
}

describe('DeckPanel violations', () => {
  const scrollIntoView = vi.fn()
  beforeEach(() => {
    // jsdom has no scrollIntoView.
    Element.prototype.scrollIntoView = scrollIntoView
  })
  afterEach(() => {
    scrollIntoView.mockReset()
    vi.useRealTimers()
  })

  it('marks both rows when main and sideboard together pass the copy limit', () => {
    const entries = [view('harry', 'character', 1), view('wing', 'main', 3), view('wing', 'sideboard', 2)]
    const { status, violations } = evaluate(entries, 'classic')
    renderWithIntl(<DeckPanel entries={entries} imageBase="http://img.test" status={status} violations={violations} onQuantityChange={() => {}} />)
    expect(within(row('main-wing')).getByText('Max 4')).toBeInTheDocument()
    expect(within(row('sideboard-wing')).getByText('Max 4')).toBeInTheDocument()
    expect(row('character-harry')).not.toHaveAttribute('data-violation')
  })

  it('follows a format switch with no stale marks', () => {
    const entries = [view('harry', 'character', 1), view('fred', 'main', 2, { legality: 'banned' })]
    const classic = evaluate(entries, 'classic')
    const { rerender } = renderWithIntl(
      <DeckPanel entries={entries} imageBase="http://img.test" status={classic.status} violations={classic.violations} onQuantityChange={() => {}} />,
    )
    expect(row('main-fred')).not.toHaveAttribute('data-violation')

    const revival = evaluate(entries, 'revival')
    rerender(<DeckPanel entries={entries} imageBase="http://img.test" status={revival.status} violations={revival.violations} onQuantityChange={() => {}} />)
    expect(row('main-fred')).toHaveAttribute('data-violation', 'banned_card')
    expect(within(row('main-fred')).getByText('Banned')).toBeInTheDocument()

    rerender(<DeckPanel entries={entries} imageBase="http://img.test" status={classic.status} violations={classic.violations} onQuantityChange={() => {}} />)
    expect(row('main-fred')).not.toHaveAttribute('data-violation')
  })

  it('marks a character that cannot start on the character row', () => {
    const entries = [view('ron', 'character', 1, { isStartingCharacter: false })]
    const { status, violations } = evaluate(entries, 'classic')
    renderWithIntl(<DeckPanel entries={entries} imageBase="http://img.test" status={status} violations={violations} onQuantityChange={() => {}} />)
    expect(within(row('character-ron')).getByText('Not a starting character')).toBeInTheDocument()
  })

  it('marks a starting character that is not legal in the format', () => {
    const entries = [view('fanchar', 'character', 1, { isOfficial: false })]
    const { status, violations } = evaluate(entries, 'classic')
    renderWithIntl(<DeckPanel entries={entries} imageBase="http://img.test" status={status} violations={violations} onQuantityChange={() => {}} />)
    expect(row('character-fanchar')).toHaveAttribute('data-violation', 'card_not_in_format')
    expect(within(row('character-fanchar')).getByText('Not in Classic')).toBeInTheDocument()
  })

  it('keeps the copy limit off the character slot, which it does not count', () => {
    const entries = [view('harry', 'character', 1), view('harry', 'main', 5, { isStartingCharacter: true })]
    const { status, violations } = evaluate(entries, 'classic')
    renderWithIntl(<DeckPanel entries={entries} imageBase="http://img.test" status={status} violations={violations} onQuantityChange={() => {}} />)
    expect(row('main-harry')).toHaveAttribute('data-violation', 'too_many_copies')
    expect(row('character-harry')).not.toHaveAttribute('data-violation')
  })

  it('jumps a starting-character reason to the character slot, not the main deck', async () => {
    const entries = [view('ron', 'character', 1, { isStartingCharacter: false }), view('ron', 'main', 2, { isStartingCharacter: false })]
    const { status, violations } = evaluate(entries, 'classic')
    renderWithIntl(<DeckPanel entries={entries} imageBase="http://img.test" status={status} violations={violations} onQuantityChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'ron' }))
    expect(row('character-ron').className).toContain('ring-primary')
    expect(row('main-ron').className).not.toContain('bg-primary/15')
  })

  it('jumps from a reason to the main-deck row and flashes it', async () => {
    const entries = [view('harry', 'character', 1), view('wing', 'main', 3), view('wing', 'sideboard', 2)]
    const { status, violations } = evaluate(entries, 'classic')
    renderWithIntl(<DeckPanel entries={entries} imageBase="http://img.test" status={status} violations={violations} onQuantityChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'wing' }))
    expect(scrollIntoView).toHaveBeenCalled()
    expect(row('main-wing').className).toContain('bg-primary/15')
  })

  it('lets a second flash replace the first without the highlight sticking', () => {
    vi.useFakeTimers()
    const entries = [view('harry', 'character', 1), view('accio', 'main', 2), view('wing', 'main', 5)]
    const { status, violations } = evaluate(entries, 'classic')
    const { rerender } = renderWithIntl(
      <DeckPanel entries={entries} imageBase="http://img.test" status={status} violations={violations}
        highlight={{ zone: 'main', cardId: 'accio', nonce: 1 }} onQuantityChange={() => {}} />,
    )
    expect(row('main-accio').className).toContain('bg-primary/15')
    act(() => { vi.advanceTimersByTime(600) })
    rerender(
      <DeckPanel entries={entries} imageBase="http://img.test" status={status} violations={violations}
        highlight={{ zone: 'main', cardId: 'wing', nonce: 2 }} onQuantityChange={() => {}} />,
    )
    expect(row('main-wing').className).toContain('bg-primary/15')
    expect(row('main-accio').className).not.toContain('bg-primary/15')
    // The first timer must not clear the second flash early...
    act(() => { vi.advanceTimersByTime(700) })
    expect(row('main-wing').className).toContain('bg-primary/15')
    // ...and the second one ends it.
    act(() => { vi.advanceTimersByTime(600) })
    expect(row('main-wing').className).not.toContain('bg-primary/15')
  })
  it('keeps a jump made during an add-flash lit past the add timer', () => {
    vi.useFakeTimers()
    const entries = [view('harry', 'character', 1), view('accio', 'main', 2), view('wing', 'main', 5)]
    const { status, violations } = evaluate(entries, 'classic')
    renderWithIntl(
      <DeckPanel entries={entries} imageBase="http://img.test" status={status} violations={violations}
        highlight={{ zone: 'main', cardId: 'accio', nonce: 1 }} onQuantityChange={() => {}} />,
    )
    act(() => { vi.advanceTimersByTime(600) })
    fireEvent.click(screen.getByRole('button', { name: 'wing' }))
    expect(row('main-wing').className).toContain('bg-primary/15')
    // The add's timer would have ended at 1200 ms; the jump's runs to 1800.
    act(() => { vi.advanceTimersByTime(700) })
    expect(row('main-wing').className).toContain('bg-primary/15')
    act(() => { vi.advanceTimersByTime(600) })
    expect(row('main-wing').className).not.toContain('bg-primary/15')
  })
})
