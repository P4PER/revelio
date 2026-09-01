import { screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import en from '@/../messages/en.json'
import { renderWithIntl } from '@/test/intl'
import { SearchEmptyResults } from '@/components/search/search-empty-results'

const push = vi.fn()
let search = ''

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
}))
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/search',
}))

beforeEach(() => {
  push.mockClear()
  search = ''
})

describe('SearchEmptyResults', () => {
  it('names the query and offers both escapes when a query and a filter are set', () => {
    search = 'q=lumos&rarity=Rare'
    renderWithIntl(<SearchEmptyResults />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(en.search.empty.heading)
    expect(screen.getByText(/lumos/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: en.filters.clearFilters })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: en.search.clear })).toBeInTheDocument()
  })

  it('offers only Clear filters when there is no query', () => {
    search = 'rarity=Rare'
    renderWithIntl(<SearchEmptyResults />)
    expect(screen.getByText(en.search.empty.filters)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: en.filters.clearFilters })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: en.search.clear })).not.toBeInTheDocument()
  })

  it('offers only Clear search when there are no filters', () => {
    search = 'q=lumos'
    renderWithIntl(<SearchEmptyResults />)
    expect(screen.getByRole('button', { name: en.search.clear })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: en.filters.clearFilters })).not.toBeInTheDocument()
  })

  it('offers nothing to clear when the URL is bare', () => {
    renderWithIntl(<SearchEmptyResults />)
    expect(screen.getByText(en.search.empty.plain)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('drops every filter but keeps the query when Clear filters is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    search = 'q=lumos&rarity=Rare&set=BS'
    renderWithIntl(<SearchEmptyResults />)
    await userEvent.click(screen.getByRole('button', { name: en.filters.clearFilters }))
    expect(push).toHaveBeenCalledTimes(1)
    const url = new URL(push.mock.calls[0][0] as string, 'http://x')
    expect(url.searchParams.get('q')).toBe('lumos')
    expect(url.searchParams.get('rarity')).toBeNull()
    expect(url.searchParams.get('set')).toBeNull()
  })

  it('drops the query but keeps the filters when Clear search is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    search = 'q=lumos&rarity=Rare'
    renderWithIntl(<SearchEmptyResults />)
    await userEvent.click(screen.getByRole('button', { name: en.search.clear }))
    const url = new URL(push.mock.calls[0][0] as string, 'http://x')
    expect(url.searchParams.get('q')).toBeNull()
    expect(url.searchParams.get('rarity')).toBe('Rare')
  })
})
