import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CardGrid } from '../card-grid'
import type { SearchDocument } from '@revelio/search'

vi.mock('next/image', () => ({ default: (props: Record<string, unknown>) => <img alt={props.alt as string} /> }))
vi.mock('@/../i18n/navigation', () => ({ Link: (p: { href: string; children: React.ReactNode; className?: string }) => <a href={p.href}>{p.children}</a> }))

const hit = (id: string, name: string): SearchDocument => ({
  id, setCode: 'BS', setName: 'Base', number: '1', name, text: null, flavorText: null,
  types: [], subTypes: [], lesson: null, lessonColor: null, rarity: null, finish: null,
  legality: null, cost: null, isOfficial: true, imageFile: 'x.png',
})

describe('CardGrid', () => {
  it('renders a tile per hit with the card name', () => {
    render(<CardGrid hits={[hit('a', 'Harry Potter'), hit('b', 'Flobberworm')]} imageBase="http://img" />)
    expect(screen.getByText('Harry Potter')).toBeInTheDocument()
    expect(screen.getByAltText('Flobberworm')).toBeInTheDocument()
  })

  it('shows an empty state when there are no hits', () => {
    render(<CardGrid hits={[]} imageBase="http://img" />)
    expect(screen.getByRole('status')).toHaveTextContent(/no cards found/i)
  })
})
