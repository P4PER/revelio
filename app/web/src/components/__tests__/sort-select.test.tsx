import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

const replace = vi.fn()
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/search',
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }))

import { SortSelect } from '../sort-select'

describe('SortSelect', () => {
  it('defaults to Relevance', () => {
    render(<SortSelect />)
    expect(screen.getByRole('combobox')).toHaveTextContent('Relevance')
  })

  it('choosing Name updates the sort param', async () => {
    const user = userEvent.setup()
    render(<SortSelect />)
    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'Name' }))
    expect(replace.mock.calls.at(-1)?.[0]).toMatch(/sort=name/)
  })
})
