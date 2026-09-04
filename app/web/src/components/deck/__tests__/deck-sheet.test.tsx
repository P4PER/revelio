import { describe, it, expect, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeckSheet, snapExpanded } from '@/components/deck/deck-sheet'

// The sheet only exists below md, and `inert` is an HTML attribute that cannot
// be breakpoint-scoped in CSS, so the component asks matchMedia whether it is
// on a phone. The shared setup stub answers "no match" to everything, which is
// the desktop answer; tests that care drive it explicitly.
function mockViewport(isPhone: boolean) {
  const listeners = new Set<() => void>()
  window.matchMedia = ((query: string) => ({
    matches: isPhone && query.includes('max-width'),
    media: query,
    onchange: null,
    addEventListener: (_: string, cb: () => void) => void listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => void listeners.delete(cb),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

const originalMatchMedia = window.matchMedia
afterEach(() => {
  window.matchMedia = originalMatchMedia
})

function Harness() {
  const [expanded, setExpanded] = useState(false)
  return (
    <DeckSheet
      expanded={expanded}
      onExpandedChange={setExpanded}
      toggleLabel="Deck, 12 cards"
      title="Gryffindor Aggro"
      subtitle="12 cards · Classic"
      badge={<span data-testid="badge">12</span>}
    >
      <button type="button">Save deck</button>
    </DeckSheet>
  )
}

describe('DeckSheet', () => {
  it('opens collapsed, with the deck one tap away', () => {
    render(<Harness />)
    const handle = screen.getByRole('button', { name: 'Deck, 12 cards' })
    expect(handle).toHaveAttribute('aria-expanded', 'false')
  })

  it('is a disclosure over the sheet body, not a dialog', () => {
    // Deck building is the comparison of two lists, so the sheet must never
    // trap focus or hide the browse pane from assistive tech. A disclosure
    // button plus aria-controls is the honest pattern, and it is keyboard
    // operable without any key handling of our own.
    render(<Harness />)
    const handle = screen.getByRole('button', { name: 'Deck, 12 cards' })
    const body = document.getElementById(handle.getAttribute('aria-controls')!)
    expect(body).not.toBeNull()
    expect(body).toContainElement(screen.getByRole('button', { name: 'Save deck' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('expands and collapses on the handle', async () => {
    render(<Harness />)
    const handle = screen.getByRole('button', { name: 'Deck, 12 cards' })
    const user = userEvent.setup()

    await user.click(handle)
    expect(handle).toHaveAttribute('aria-expanded', 'true')

    await user.click(handle)
    expect(handle).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps the collapsed body out of the tab order on a phone', async () => {
    // The body stays mounted so the deck's scroll position and the stats
    // panel's open state survive a trip to the browse pane. Mounted but
    // off-screen content has to be inert, or you tab into what you cannot see.
    mockViewport(true)
    render(<Harness />)
    const handle = screen.getByRole('button', { name: 'Deck, 12 cards' })
    const body = document.getElementById(handle.getAttribute('aria-controls')!)!
    expect(body).toHaveAttribute('inert')

    await userEvent.setup().click(handle)
    expect(body).not.toHaveAttribute('inert')
  })

  it('never marks the body inert on the workbench, where it is always laid out', () => {
    // From md up the sheet is display:contents and the deck is a grid column,
    // so a collapsed `expanded` must not reach into the desktop layout. The
    // server snapshot is "not a phone" for the same reason: no inert in the
    // SSR HTML, so a desktop render is correct from the first byte.
    mockViewport(false)
    render(<Harness />)
    const handle = screen.getByRole('button', { name: 'Deck, 12 cards' })
    const body = document.getElementById(handle.getAttribute('aria-controls')!)!
    expect(handle).toHaveAttribute('aria-expanded', 'false')
    expect(body).not.toHaveAttribute('inert')
  })

  it('dissolves into the workbench grid from md up', () => {
    // display:contents generates no box, so the sheet's position, height and
    // transform all stop applying and its children become grid items. That is
    // what lets one command bar live in the sheet on a phone and span the top
    // of the workbench on a desktop, instead of being rendered twice.
    const { container } = render(<Harness />)
    const sheet = container.querySelector('[data-deck-sheet]')!
    expect(sheet).toHaveClass('fixed', 'md:contents')
    const handle = screen.getByRole('button', { name: 'Deck, 12 cards' })
    expect(handle).toHaveClass('md:hidden')
    expect(document.getElementById(handle.getAttribute('aria-controls')!)).toHaveClass('md:contents')
  })

  it('rests flush on the bottom edge rather than floating above it', () => {
    // The old pane switch added env(safe-area-inset-bottom) to `bottom`, but a
    // fixed element already sits inside Safari's own viewport, so the home
    // indicator got counted twice and the bar floated ~39px too high. The
    // sheet is bottom-0 and carries the inset as padding instead.
    const { container } = render(<Harness />)
    const sheet = container.querySelector('[data-deck-sheet]')!
    expect(sheet).toHaveClass('bottom-0')
    expect(sheet.className).not.toContain('bottom-[')
  })

  it('shows the count badge and the summary on the collapsed handle', () => {
    // While the sheet is shut the badge is the only sign an add landed.
    render(<Harness />)
    expect(screen.getByTestId('badge')).toBeInTheDocument()
    expect(screen.getByText('Gryffindor Aggro')).toBeInTheDocument()
    expect(screen.getByText('12 cards · Classic')).toBeInTheDocument()
  })

  it('puts a dismissing scrim over the browse pane only while expanded', async () => {
    const { container } = render(<Harness />)
    expect(container.querySelector('[data-deck-sheet-scrim]')).toBeNull()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Deck, 12 cards' }))
    const scrim = container.querySelector('[data-deck-sheet-scrim]')!
    expect(scrim).toHaveClass('md:hidden')

    await user.click(scrim)
    expect(screen.getByRole('button', { name: 'Deck, 12 cards' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })
})

// The gesture itself is untestable in jsdom (no layout, no real pointers), so
// the decision it feeds is a pure function and gets tested directly. dy is the
// drag distance in px, negative upward; travel is the distance between the two
// snap positions.
describe('snapExpanded', () => {
  it('flicks open on a fast upward swipe, however short', () => {
    expect(snapExpanded(false, -20, 40, 600)).toBe(true)
  })

  it('flicks shut on a fast downward swipe, however short', () => {
    expect(snapExpanded(true, 20, 40, 600)).toBe(false)
  })

  it('opens on a slow drag past a quarter of the travel', () => {
    expect(snapExpanded(false, -200, 900, 600)).toBe(true)
  })

  it('springs back when a slow drag falls short of a quarter', () => {
    expect(snapExpanded(false, -100, 900, 600)).toBe(false)
    expect(snapExpanded(true, 100, 900, 600)).toBe(true)
  })

  it('treats a zero-duration or zero-travel drag as no decision', () => {
    // Guards against dividing by zero and against a first paint where the
    // sheet has not been measured yet.
    expect(snapExpanded(false, -300, 0, 0)).toBe(false)
    expect(snapExpanded(true, 300, 0, 0)).toBe(true)
  })
})
