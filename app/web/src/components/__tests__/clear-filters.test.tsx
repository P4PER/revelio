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

import { ClearFilters } from '../clear-filters'

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
})
