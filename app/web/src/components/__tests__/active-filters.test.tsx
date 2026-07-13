import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'

const push = vi.fn()
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ push }) }))
const params = new URLSearchParams('rarity=rare&legality=legal&costMin=2&costMax=5&official=fan')
vi.mock('next/navigation', () => ({ useSearchParams: () => params, usePathname: () => '/search' }))

import { ActiveFilters } from '../active-filters'

const messages = { filters: { official: 'Official only', fan: 'Fan / Revival only' } }
const sets = [{ code: 'BS', name: 'Base Set', releaseDate: null, isOfficial: true, cardCount: 1, symbol: 'BS' }]

function renderFilters() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ActiveFilters sets={sets} locale="en" />
    </NextIntlClientProvider>,
  )
}

describe('ActiveFilters', () => {
  it('renders a removable chip per active filter and removes on click', async () => {
    const user = userEvent.setup()
    renderFilters()
    expect(screen.getByText(/Rare/)).toBeInTheDocument()
    expect(screen.getByText(/Legal/)).toBeInTheDocument()
    expect(screen.getByText(/2.*5/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /remove Rare/i }))
    const url = push.mock.calls.at(-1)?.[0] as string
    expect(url).not.toMatch(/rarity=rare/)
    expect(url).toMatch(/legality=legal/)
  })

  it('renders a removable chip for the official/fan filter', async () => {
    const user = userEvent.setup()
    renderFilters()
    expect(screen.getByText('Fan / Revival only')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /remove Fan \/ Revival only/i }))
    const url = push.mock.calls.at(-1)?.[0] as string
    expect(url).not.toMatch(/official=/)
  })
})
