import { describe, it, expect, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Violation } from '@revelio/core'
import { renderWithIntl } from '@/test/intl'
import { DeckLegalityBar } from '@/components/deck/deck-legality-bar'

const violations: Violation[] = [
  { code: 'too_many_copies', cardId: 'wing', count: 5 },
  { code: 'main_deck_size', actual: 58 },
]
const soft: Violation[] = [{ code: 'main_deck_size', actual: 58 }]
const names = { wing: 'Wingardium Leviosa' }

describe('DeckLegalityBar reasons', () => {
  it('shows a plain label and no button when there are no violations', () => {
    renderWithIntl(<DeckLegalityBar status="legal" mainCount={60} hasCharacter />)
    expect(screen.getByText('Tournament legal')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('counts the issues and starts open when the deck is illegal', () => {
    renderWithIntl(<DeckLegalityBar status="illegal" mainCount={58} hasCharacter violations={violations} names={names} />)
    const button = screen.getByRole('button', { name: /Illegal · 2 issues/ })
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('list')).toBeInTheDocument()
  })

  it('starts closed when the deck is only incomplete', () => {
    renderWithIntl(<DeckLegalityBar status="incomplete" mainCount={58} hasCharacter violations={soft} names={names} />)
    expect(screen.getByRole('button', { name: /Incomplete/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('keeps a collapsed list shut while the deck stays illegal', async () => {
    const { rerender } = renderWithIntl(
      <DeckLegalityBar status="illegal" mainCount={58} hasCharacter violations={violations} names={names} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Illegal/ }))
    rerender(<DeckLegalityBar status="illegal" mainCount={59} hasCharacter violations={[...violations, { code: 'banned_card', cardId: 'fred' }]} names={names} />)
    expect(screen.getByRole('button', { name: /Illegal · 3 issues/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('opens again when the deck turns illegal after being legal', async () => {
    const { rerender } = renderWithIntl(
      <DeckLegalityBar status="illegal" mainCount={58} hasCharacter violations={violations} names={names} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Illegal/ }))
    rerender(<DeckLegalityBar status="legal" mainCount={60} hasCharacter violations={[]} names={names} />)
    rerender(<DeckLegalityBar status="illegal" mainCount={58} hasCharacter violations={violations} names={names} />)
    expect(screen.getByRole('list')).toBeInTheDocument()
  })

  it('opens again when the deck turns illegal after being incomplete', async () => {
    const { rerender } = renderWithIntl(
      <DeckLegalityBar status="illegal" mainCount={58} hasCharacter violations={violations} names={names} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Illegal/ }))
    rerender(<DeckLegalityBar status="incomplete" mainCount={58} hasCharacter violations={soft} names={names} />)
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    rerender(<DeckLegalityBar status="illegal" mainCount={58} hasCharacter violations={violations} names={names} />)
    expect(screen.getByRole('list')).toBeInTheDocument()
  })

  it('keeps an incomplete list the user opened open while it stays incomplete', async () => {
    const { rerender } = renderWithIntl(
      <DeckLegalityBar status="incomplete" mainCount={58} hasCharacter violations={soft} names={names} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Incomplete/ }))
    rerender(<DeckLegalityBar status="incomplete" mainCount={59} hasCharacter violations={[{ code: 'main_deck_size', actual: 59 }]} names={names} />)
    expect(screen.getByRole('list')).toHaveTextContent('Main deck has 59 / 60 cards')
  })

  it('lists every reason by card name', () => {
    renderWithIntl(<DeckLegalityBar status="illegal" mainCount={58} hasCharacter violations={violations} names={names} />)
    const list = screen.getByRole('list')
    expect(list).toHaveTextContent('5 copies of Wingardium Leviosa (max 4)')
    expect(list).toHaveTextContent('Main deck has 58 / 60 cards')
  })

  it('makes a card name a jump button only when onJump is given', async () => {
    const onJump = vi.fn()
    const { unmount } = renderWithIntl(
      <DeckLegalityBar status="illegal" mainCount={58} hasCharacter violations={violations} names={names} onJump={onJump} />,
    )
    await userEvent.click(within(screen.getByRole('list')).getByRole('button', { name: 'Show Wingardium Leviosa in the deck' }))
    expect(onJump).toHaveBeenCalledWith('wing')
    unmount()

    // Read-only overview: no onJump, so the name is plain text.
    renderWithIntl(<DeckLegalityBar status="illegal" mainCount={58} hasCharacter violations={violations} names={names} />)
    expect(within(screen.getByRole('list')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('drops the button and list once the deck turns legal', () => {
    const { rerender } = renderWithIntl(
      <DeckLegalityBar status="illegal" mainCount={58} hasCharacter violations={violations} names={names} />,
    )
    rerender(<DeckLegalityBar status="legal" mainCount={60} hasCharacter violations={[]} names={names} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByText('Tournament legal')).toBeInTheDocument()
  })
})
