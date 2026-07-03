import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

const push = vi.fn()
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ push }) }))
const params = new URLSearchParams('rarity=rare&legality=legal&costMin=2&costMax=5')
vi.mock('next/navigation', () => ({ useSearchParams: () => params, usePathname: () => '/search' }))

import { ActiveFilters } from '../active-filters'

const sets = [{ code: 'BS', name: 'Base Set', releaseDate: null, isOfficial: true, cardCount: 1, symbol: 'BS' }]

describe('ActiveFilters', () => {
  it('renders a removable chip per active filter and removes on click', async () => {
    const user = userEvent.setup()
    render(<ActiveFilters sets={sets} locale="en" />)
    expect(screen.getByText(/Rare/)).toBeInTheDocument()
    expect(screen.getByText(/Legal/)).toBeInTheDocument()
    expect(screen.getByText(/2.*5/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /remove Rare/i }))
    const url = push.mock.calls.at(-1)?.[0] as string
    expect(url).not.toMatch(/rarity=rare/)
    expect(url).toMatch(/legality=legal/)
  })
})
