import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import en from '@/../messages/en.json'
import { renderWithIntl } from '@/test/intl'

const push = vi.fn()
let search = ''

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
}))
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => '/collection',
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
vi.mock('@/lib/actions/collection-actions', () => ({
  setCardQuantityAction: vi.fn(async () => ({ ok: true })),
}))

import { CollectionView } from '@/components/collection/collection-view'

const sets = [
  { code: 'BS', name: 'Base', releaseDate: null, isOfficial: true, cardCount: 3, symbol: null },
]
const progress = [{ setCode: 'BS', owned: 0, total: 3 }]
const card = { id: 'bs-1', name: 'Harry', finishes: ['normal'] }

const base = {
  sets,
  progress,
  selectedSet: 'BS',
  cards: [],
  browseCards: [],
  quantities: {},
  editable: true,
  locale: 'en',
  mode: 'sets' as const,
  browseTotal: 0,
  browsePage: 1,
  browsePageSize: 24,
}

function renderView(overrides: Partial<typeof base> = {}) {
  return renderWithIntl(<CollectionView {...base} {...overrides} />)
}

// Only the active tab's panel is mounted, so `mode` decides which branch is
// under test: 'sets' renders the by-set grid, 'browse' the search results.
function renderBrowse(overrides: Partial<typeof base> = {}) {
  return renderView({ mode: 'browse', ...overrides })
}

beforeEach(() => {
  push.mockClear()
  search = ''
})

describe('CollectionView by-set tab', () => {
  it('shows the set empty state when the selected set holds no cards', () => {
    renderView()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(en.sets.empty.heading)
    expect(screen.getByText(en.sets.empty.description)).toBeInTheDocument()
  })

  it('shows the grid instead of the empty state once the set has cards', () => {
    renderView({ cards: [card] })
    expect(screen.getByTestId('card-tile-bs-1')).toBeInTheDocument()
    expect(screen.queryByText(en.sets.empty.description)).not.toBeInTheDocument()
  })
})

describe('CollectionView browse empty state', () => {
  it('blames the search, not the filters, when no filter is set', () => {
    search = 'tab=browse&q=zzzz'
    renderBrowse()
    expect(screen.getByText(en.collection.emptyBrowse.plain)).toBeInTheDocument()
    expect(screen.queryByText(en.collection.emptyBrowse.filters)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: en.filters.clearFilters })).not.toBeInTheDocument()
  })

  it('blames the filters and offers to clear them when a shared filter is set', () => {
    search = 'tab=browse&rarity=Rare'
    renderBrowse()
    expect(screen.getByText(en.collection.emptyBrowse.filters)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: en.filters.clearFilters }).length).toBeGreaterThan(0)
  })

  // The ownership facet is the collection's own filter and lives outside the
  // shared search state, so it has to be counted separately or a browse view
  // narrowed to "missing" alone would claim nothing was filtered.
  it('counts the ownership facet as a filter on its own', () => {
    search = 'tab=browse&owned=missing'
    renderBrowse()
    expect(screen.getByText(en.collection.emptyBrowse.filters)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: en.filters.clearFilters }).length).toBeGreaterThan(0)
  })

  it('shows the grid instead of the empty state once browse has results', () => {
    search = 'tab=browse'
    renderBrowse({ browseCards: [card], browseTotal: 1 })
    expect(screen.getByTestId('card-tile-bs-1')).toBeInTheDocument()
    expect(screen.queryByText(en.collection.emptyBrowse.plain)).not.toBeInTheDocument()
  })
})

describe('CollectionView clear filters', () => {
  it('drops the shared filters and the ownership facet but keeps the query and tab', async () => {
    search = 'tab=browse&q=lumos&rarity=Rare&set=BS&owned=missing'
    renderBrowse()
    const [clear] = screen.getAllByRole('button', { name: en.filters.clearFilters })
    await userEvent.click(clear)
    expect(push).toHaveBeenCalledTimes(1)
    const url = new URL(push.mock.calls[0][0] as string, 'http://x')
    expect(url.searchParams.get('q')).toBe('lumos')
    expect(url.searchParams.get('tab')).toBe('browse')
    expect(url.searchParams.get('rarity')).toBeNull()
    expect(url.searchParams.get('set')).toBeNull()
    expect(url.searchParams.get('owned')).toBeNull()
  })
})

describe('CollectionView tabs', () => {
  // `set` is the by-set sidebar selection; Browse has its own Set filter, so
  // carrying it across would silently pin Browse to the last-viewed set.
  it('drops the by-set selection when switching to Browse', async () => {
    search = 'tab=sets&set=BS'
    renderView()
    await userEvent.click(screen.getByRole('tab', { name: en.collection.browseAll }))
    const url = new URL(push.mock.calls[0][0] as string, 'http://x')
    expect(url.searchParams.get('tab')).toBe('browse')
    expect(url.searchParams.get('set')).toBeNull()
  })
})

describe('CollectionView announcements', () => {
  // One live region per update: the count. The empty state renders in the same
  // pass and would otherwise announce a second time over the top of it.
  it('announces the browse result count and nothing else', () => {
    search = 'tab=browse'
    renderBrowse()
    const live = screen.getAllByRole('status')
    expect(live).toHaveLength(1)
    expect(live[0]).toHaveTextContent(/cards?$/)
  })

  // Sets are switched by a soft navigation, so the panel is patched in place.
  // Without a count of its own an empty set would change it silently.
  it('announces the by-set count, including when the set is empty', () => {
    const { unmount } = renderView({ cards: [card] })
    expect(screen.getByRole('status')).toHaveTextContent('1 card')
    unmount()

    renderView()
    const live = screen.getAllByRole('status')
    expect(live).toHaveLength(1)
    expect(live[0]).toHaveTextContent('0 cards')
  })
})
