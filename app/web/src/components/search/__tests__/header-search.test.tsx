import { screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithIntl } from '@/test/intl'

const push = vi.fn()
const replace = vi.fn()
const route = { pathname: '/decks', params: new URLSearchParams('') }

vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => route.pathname,
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => route.params }))

import { HeaderSearch } from '@/components/search/header-search'

function field() {
  return screen.getByRole('searchbox') as HTMLInputElement
}

describe('HeaderSearch', () => {
  beforeEach(() => {
    push.mockClear()
    replace.mockClear()
    route.pathname = '/decks'
    route.params = new URLSearchParams('')
  })

  it('clearing off the search page leaves the field ready to mirror the next query', () => {
    const { rerender } = renderWithIntl(<HeaderSearch placeholder="Search" clearLabel="Clear search" />)

    fireEvent.change(field(), { target: { value: 'aggro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(field().value).toBe('')

    // Navigate to a search URL that carries its own query. The box mirrors the
    // search page's `q`, so it has to pick this up - a stale "skip the next
    // sync" flag left over from the clear would leave it blank.
    route.pathname = '/search'
    route.params = new URLSearchParams('q=potter')
    rerender(<HeaderSearch placeholder="Search" clearLabel="Clear search" />)

    expect(field().value).toBe('potter')
  })
})
