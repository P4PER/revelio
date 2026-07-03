import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

const replace = vi.fn()
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/search',
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }))

import { QuickFilters } from '../quick-filters'

describe('QuickFilters', () => {
  it('toggling a type chip adds it to the url', () => {
    render(<QuickFilters locale="en" />)
    fireEvent.click(screen.getByRole('button', { name: 'Creature' }))
    expect(replace.mock.calls.at(-1)?.[0]).toMatch(/type=creature/)
  })
})
