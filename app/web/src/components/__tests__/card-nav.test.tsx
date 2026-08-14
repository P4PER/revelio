import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const push = vi.fn()
const prefetch = vi.fn()
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ push, prefetch }),
  Link: (p: { href: string; children: React.ReactNode; 'aria-label'?: string }) => (
    <a href={p.href} aria-label={p['aria-label']}>{p.children}</a>
  ),
}))

import { CardNav } from '../card-nav'

const labels = {
  prev: 'Previous card', next: 'Next card',
  hint: 'to flip between cards', swipe: 'Swipe to flip between cards',
}
const prev = { id: 'p', href: '/card/p?i=1' }
const next = { id: 'n', href: '/card/n?i=3' }

// Query-aware matchMedia: the hint reads '(prefers-reduced-motion)' and '(hover: none)'.
function mockMatchMedia({ reduce = false, touch = false } = {}) {
  window.matchMedia = vi.fn((q: string) => ({
    matches: q.includes('prefers-reduced-motion') ? reduce : q.includes('hover: none') ? touch : false,
    media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) as never
}

beforeEach(() => {
  push.mockClear(); prefetch.mockClear(); localStorage.clear(); mockMatchMedia()
})

function frame(el: HTMLElement) {
  return el.querySelector('[data-testid="card-nav-frame"]') as HTMLElement
}

describe('CardNav', () => {
  it('ArrowRight navigates to next, ArrowLeft to prev', () => {
    render(<CardNav prev={prev} next={next} labels={labels}><div>card</div></CardNav>)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(push).toHaveBeenCalledWith('/card/n?i=3')
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(push).toHaveBeenCalledWith('/card/p?i=1')
  })

  it('does nothing at a missing boundary', () => {
    render(<CardNav prev={null} next={next} labels={labels}><div>card</div></CardNav>)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(push).not.toHaveBeenCalled()
  })

  it('ignores arrow keys while typing in a field', () => {
    render(
      <>
        <input data-testid="field" />
        <CardNav prev={prev} next={next} labels={labels}><div>card</div></CardNav>
      </>,
    )
    fireEvent.keyDown(screen.getByTestId('field'), { key: 'ArrowRight' })
    expect(push).not.toHaveBeenCalled()
  })

  it('ignores arrow keys inside a widget that owns them (open menu, listbox)', () => {
    render(
      <>
        <div role="menu"><button data-testid="item">Deutsch</button></div>
        <CardNav prev={prev} next={next} labels={labels}><div>card</div></CardNav>
      </>,
    )
    fireEvent.keyDown(screen.getByTestId('item'), { key: 'ArrowRight' })
    expect(push).not.toHaveBeenCalled()
  })

  it('ignores arrow keys already handled by something else', () => {
    render(<CardNav prev={prev} next={next} labels={labels}><div>card</div></CardNav>)
    const e = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true })
    e.preventDefault()
    window.dispatchEvent(e)
    expect(push).not.toHaveBeenCalled()
  })

  it('ignores arrow keys in a native select', () => {
    render(
      <>
        <select data-testid="sel"><option>a</option></select>
        <CardNav prev={prev} next={next} labels={labels}><div>card</div></CardNav>
      </>,
    )
    fireEvent.keyDown(screen.getByTestId('sel'), { key: 'ArrowRight' })
    expect(push).not.toHaveBeenCalled()
  })

  it('ignores arrow keys when a modifier is held', () => {
    render(<CardNav prev={prev} next={next} labels={labels}><div>card</div></CardNav>)
    fireEvent.keyDown(window, { key: 'ArrowRight', metaKey: true })
    expect(push).not.toHaveBeenCalled()
  })

  it('swipe left past the threshold goes to next; a tap does nothing', () => {
    const { container } = render(<CardNav prev={prev} next={next} labels={labels}><div>card</div></CardNav>)
    const f = frame(container)
    fireEvent.touchStart(f, { changedTouches: [{ clientX: 200, clientY: 100 }] })
    fireEvent.touchEnd(f, { changedTouches: [{ clientX: 120, clientY: 108 }] })
    expect(push).toHaveBeenCalledWith('/card/n?i=3')
    push.mockClear()
    fireEvent.touchStart(f, { changedTouches: [{ clientX: 200, clientY: 100 }] })
    fireEvent.touchEnd(f, { changedTouches: [{ clientX: 190, clientY: 100 }] })
    expect(push).not.toHaveBeenCalled()
  })

  it('renders labelled chevron links with the neighbor hrefs', () => {
    render(<CardNav prev={prev} next={next} labels={labels}><div>card</div></CardNav>)
    expect(screen.getByLabelText('Previous card')).toHaveAttribute('href', '/card/p?i=1')
    expect(screen.getByLabelText('Next card')).toHaveAttribute('href', '/card/n?i=3')
  })

  it('shows the desktop keys hint once, then marks it seen', () => {
    const { unmount } = render(<CardNav prev={prev} next={next} labels={labels}><div>card</div></CardNav>)
    expect(screen.getByText('to flip between cards')).toBeInTheDocument()
    expect(screen.queryByText('Swipe to flip between cards')).toBeNull()
    expect(localStorage.getItem('revelio.cardNav.hintSeen')).toBe('1')
    unmount()
    render(<CardNav prev={prev} next={next} labels={labels}><div>card</div></CardNav>)
    expect(screen.queryByText('to flip between cards')).toBeNull()
  })

  it('shows the swipe hint (not the keys hint) on touch devices', () => {
    mockMatchMedia({ touch: true })
    render(<CardNav prev={prev} next={next} labels={labels}><div>card</div></CardNav>)
    expect(screen.getByText('Swipe to flip between cards')).toBeInTheDocument()
    expect(screen.queryByText('to flip between cards')).toBeNull()
  })

  it('fades the hint out when its animation ends, then unmounts on transitionend', () => {
    const { container } = render(<CardNav prev={prev} next={next} labels={labels}><div>card</div></CardNav>)
    const hint = () => container.querySelector('[data-testid="card-nav-hint"]')
    expect(screen.getByText('to flip between cards')).toBeInTheDocument()

    // Animation done → start fading (still mounted, now opacity-0).
    // jsdom's AnimationEvent.animationName is read-only, so build the event by hand.
    const ae = new Event('animationend', { bubbles: true })
    Object.defineProperty(ae, 'animationName', { value: 'chevron-hint' })
    fireEvent(frame(container), ae)
    expect(hint()).toBeInTheDocument()
    expect(hint()).toHaveClass('opacity-0')

    // Fade finished → unmounts.
    const te = new Event('transitionend', { bubbles: true })
    Object.defineProperty(te, 'propertyName', { value: 'opacity' })
    fireEvent(hint()!, te)
    expect(screen.queryByText('to flip between cards')).toBeNull()
  })

  it('skips the hint under prefers-reduced-motion', () => {
    mockMatchMedia({ reduce: true })
    render(<CardNav prev={prev} next={next} labels={labels}><div>card</div></CardNav>)
    expect(screen.queryByText('to flip between cards')).toBeNull()
    expect(screen.queryByText('Swipe to flip between cards')).toBeNull()
    expect(localStorage.getItem('revelio.cardNav.hintSeen')).toBeNull()
  })

  it('renders only children when there are no neighbors', () => {
    render(<CardNav prev={null} next={null} labels={labels}><div>card</div></CardNav>)
    expect(screen.getByText('card')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('does not show or burn the hint when there are no neighbors', () => {
    render(<CardNav prev={null} next={null} labels={labels}><div>card</div></CardNav>)
    expect(screen.queryByText('to flip between cards')).toBeNull()
    expect(screen.queryByText('Swipe to flip between cards')).toBeNull()
    expect(localStorage.getItem('revelio.cardNav.hintSeen')).toBeNull()
  })
})
