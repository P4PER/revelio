import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'

const push = vi.fn()
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/search',
}))

let params = new URLSearchParams()
vi.mock('next/navigation', () => ({ useSearchParams: () => params }))

import { ClearFilters } from '@/components/search/clear-filters'

const messages = { filters: { clearFilters: 'Clear filters' } }
function renderClear() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ClearFilters />
    </NextIntlClientProvider>,
  )
}

describe('ClearFilters', () => {
  beforeEach(() => push.mockClear())

  it('renders nothing when no filters are active', () => {
    params = new URLSearchParams('q=aggro&sort=name')
    const { container } = renderClear()
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the button and clears filters while keeping q and sort', async () => {
    const user = userEvent.setup()
    params = new URLSearchParams('q=aggro&sort=name&type=creature&rarity=rare&official=fan&costMin=2')
    renderClear()
    await user.click(screen.getByRole('button', { name: /clear filters/i }))
    const url = push.mock.calls.at(-1)?.[0] as string
    expect(url).toMatch(/q=aggro/)
    expect(url).toMatch(/sort=name/)
    expect(url).not.toMatch(/type=/)
    expect(url).not.toMatch(/rarity=/)
    expect(url).not.toMatch(/official=/)
    expect(url).not.toMatch(/costMin=/)
  })

  // The control mounts into rows that otherwise hold nothing but the result
  // count (the deck builder's browse panel, the collection's Browse tab), so a
  // fixed button box would grow those rows the moment a filter is applied and
  // shove the grid below them down. jsdom has no layout, so this pins the exact
  // set of box utilities that survive tailwind-merge: h-auto and px-0 keep the
  // control the size of its label, and py-1.5 with the equal and opposite
  // -my-1.5 grows the pointer target without the padding counting towards the
  // row. Adding any further padding, height or vertical margin fails here,
  // because it would resize the row. e2e/clear-filters.spec.ts measures the
  // rendered result in a browser.
  it('carries only the box utilities that keep the row a fixed height', () => {
    params = new URLSearchParams('q=aggro&type=creature')
    renderClear()
    const button = screen.getByRole('button', { name: /clear filters/i })
    const box = button.className
      .split(/\s+/)
      // Variant-prefixed classes (has-[>svg]:px-3) apply only to states this
      // control never enters, and tailwind-merge keeps them in their own group.
      .filter((c) => !c.includes(':'))
      .filter((c) => /^-?(h|min-h|p|px|py|pt|pb|m|my|mt|mb)-/.test(c))
    expect(new Set(box)).toEqual(new Set(['h-auto', 'px-0', 'py-1.5', '-my-1.5']))
  })

  it('labels the control with visible text rather than an icon alone', () => {
    params = new URLSearchParams('q=aggro&type=creature')
    renderClear()
    const button = screen.getByRole('button', { name: /clear filters/i })
    expect(button).toHaveTextContent('Clear filters')
  })
})
