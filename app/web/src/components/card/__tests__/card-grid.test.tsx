import { screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'
import { renderWithIntl } from '@/test/intl'
import { CardGrid } from '@/components/card/card-grid'
import type { SearchDocument } from '@revelio/search'

vi.mock('next/image', () => ({ default: (props: Record<string, unknown>) => <img alt={props.alt as string} /> }))
vi.mock('@/../i18n/navigation', () => ({ Link: (p: { href: string; children: React.ReactNode; className?: string }) => <a href={p.href}>{p.children}</a> }))

const hit = (id: string, name: string): SearchDocument => ({
  id, setCode: 'BS', number: '1', name, text: null, flavorText: null,
  types: [], subTypes: [], lesson: null, rarity: null, finishes: [],
  legality: null, cost: null, isOfficial: true, imageLang: 'en', defaultLanguage: 'en',
  orientation: null,
})

describe('CardGrid', () => {
  it('renders a tile per hit with the card name', () => {
    renderWithIntl(<CardGrid hits={[hit('a', 'Harry Potter'), hit('b', 'Flobberworm')]} imageBase="http://img" />)
    expect(screen.getByText('Harry Potter')).toBeInTheDocument()
    expect(screen.getByAltText('Flobberworm')).toBeInTheDocument()
  })

  it('shows an empty state when there are no hits', () => {
    renderWithIntl(<CardGrid hits={[]} imageBase="http://img" />)
    expect(screen.getByRole('status')).toHaveTextContent(en.search.noResults)
  })
})

describe('CardGrid context plumbing', () => {
  it('gives each tile its absolute index when searchParams + startIndex are set', () => {
    renderWithIntl(
      <CardGrid
        hits={[hit('a', 'Harry Potter'), hit('b', 'Flobberworm')]}
        imageBase="http://img"
        searchParams={new URLSearchParams('q=x')}
        startIndex={24}
      />,
    )
    const hrefs = screen.getAllByRole('link').map((l) => l.getAttribute('href'))
    expect(hrefs).toContain('/card/a?q=x&i=24')
    expect(hrefs).toContain('/card/b?q=x&i=25')
  })
})
