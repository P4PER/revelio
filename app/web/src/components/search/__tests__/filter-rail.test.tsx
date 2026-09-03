import { act } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { FilterRail } from '@/components/search/filter-rail'

// jsdom has no layout: offsets are 0 and scrollLeft is read-only. Back the four
// geometry properties the rail reads with values the test can author (chips
// carry theirs as data attributes) so the centring maths runs for real.
const own = ['offsetLeft', 'offsetWidth', 'clientWidth', 'scrollWidth'] as const
const saved = own.map((k) => Object.getOwnPropertyDescriptor(HTMLElement.prototype, k))

// The setup file's ResizeObserver is inert; swap in one that hands the test its
// callback, so a lane can be re-measured after its width changes.
let resize: (() => void) | undefined
const savedRO = window.ResizeObserver

beforeAll(() => {
  window.ResizeObserver = class {
    constructor(cb: () => void) {
      resize = cb
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  for (const key of own) {
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get(this: HTMLElement) {
        return Number(this.dataset[key.toLowerCase()] ?? 0)
      },
    })
  }
  Object.defineProperty(HTMLElement.prototype, 'scrollLeft', {
    configurable: true,
    get(this: HTMLElement) {
      return Number(this.dataset.scrollleft ?? 0)
    },
    set(this: HTMLElement, v: number) {
      // Clamp as a real scrolling box does, so an off-screen chip at either
      // end lands at the bound instead of a negative or overlong offset.
      const max = Math.max(0, this.scrollWidth - this.clientWidth)
      this.dataset.scrollleft = String(Math.min(Math.max(v, 0), max))
    },
  })
})

afterAll(() => {
  own.forEach((k, i) => {
    if (saved[i]) Object.defineProperty(HTMLElement.prototype, k, saved[i]!)
  })
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollLeft
  window.ResizeObserver = savedRO
})

// A 300px lane holding four 100px chips, so it scrolls by 100px.
function renderRail(activeIndex?: number) {
  return render(
    <FilterRail role="group" aria-label="Type" data-clientwidth="300" data-scrollwidth="400">
      {[0, 1, 2, 3].map((i) => (
        <button
          key={i}
          type="button"
          aria-pressed={i === activeIndex}
          data-offsetleft={i * 100}
          data-offsetwidth="100"
        >
          chip {i}
        </button>
      ))}
    </FilterRail>,
  )
}

describe('FilterRail', () => {
  it('renders its chips inside the group it is given', () => {
    renderRail()
    const lane = screen.getByRole('group', { name: 'Type' })
    expect(lane).toContainElement(screen.getByRole('button', { name: 'chip 3' }))
  })

  it('scrolls an active chip into the middle of the lane on mount', () => {
    renderRail(3)
    // chip 3 sits at 300; centring wants 300 - (300 - 100) / 2 = 200, clamped
    // to the 100px the lane can actually scroll.
    expect(screen.getByRole('group', { name: 'Type' }).scrollLeft).toBe(100)
  })

  it('leaves the lane at the start when nothing is active', () => {
    renderRail()
    expect(screen.getByRole('group', { name: 'Type' }).scrollLeft).toBe(0)
  })

  it('fades only the end the lane continues past', () => {
    renderRail()
    const lane = screen.getByRole('group', { name: 'Type' })
    // Resting at the start: the far end is cut off, the near end is not.
    expect(lane.style.maskImage).toContain('#000 0px')
    expect(lane.style.maskImage).toContain('calc(100% - 2rem)')

    lane.scrollLeft = 100
    fireEvent.scroll(lane)
    expect(lane.style.maskImage).toContain('#000 2rem')
    expect(lane.style.maskImage).toContain('#000 100%')
  })

  it('drops the fade once the lane is wide enough to stop scrolling', () => {
    renderRail()
    const lane = screen.getByRole('group', { name: 'Type' })
    expect(lane.style.maskImage).not.toBe('')
    // What md does: the lane wraps instead of scrolling, so nothing overflows.
    lane.dataset.clientwidth = '400'
    act(() => resize?.())
    expect(lane.style.maskImage).toBe('')
  })

  it('wears no mask when every chip already fits', () => {
    render(
      <FilterRail role="group" aria-label="Lesson" data-clientwidth="300" data-scrollwidth="300">
        <button type="button" aria-pressed={false} data-offsetleft="0" data-offsetwidth="40">
          one
        </button>
      </FilterRail>,
    )
    expect(screen.getByRole('group', { name: 'Lesson' }).style.maskImage).toBe('')
  })
})
