import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import { CardTile } from '../card-tile'
import type { SearchDocument } from '@revelio/search'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => <img alt={p.alt as string} /> }))
vi.mock('@/../i18n/navigation', () => ({ Link: (p: { href: string; children: React.ReactNode; className?: string }) => <a href={p.href}>{p.children}</a> }))

const base: SearchDocument = {
  id: 'bs-1', setCode: 'BS', number: '1', name: 'Dean Thomas', text: null, flavorText: null,
  types: ['character'], subTypes: [], lesson: null, rarity: null, finishes: [],
  legality: null, cost: null, isOfficial: true, imageLang: 'en', defaultLanguage: 'en',
  orientation: 'horizontal',
}
const messages = { card: { rotate: 'Rotate upright', rotateBack: 'Close rotated view' } }
const wrap = (hit: SearchDocument) =>
  render(<NextIntlClientProvider locale="en" messages={messages}><CardTile hit={hit} imageBase="http://img" /></NextIntlClientProvider>)

describe('CardTile rotate button', () => {
  it('shows a rotate button for a horizontal card', () => {
    wrap(base)
    expect(screen.getByRole('button', { name: /rotate upright/i })).toBeInTheDocument()
  })
  it('shows no rotate button for a vertical card', () => {
    wrap({ ...base, orientation: 'vertical' })
    expect(screen.queryByRole('button', { name: /rotate upright/i })).toBeNull()
  })
})

describe('CardTile href', () => {
  it('links to the plain card page without context', () => {
    wrap(base)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/card/bs-1')
  })

  it('carries search context (params + absolute index) when given', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <CardTile hit={base} imageBase="http://img"
          context={{ params: new URLSearchParams('q=dean&page=2'), index: 30 }} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', '/card/bs-1?q=dean&i=30')
  })
})
