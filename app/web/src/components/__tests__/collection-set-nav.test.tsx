import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from '@/test/intl'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { CollectionSetNav } from '@/components/collection-set-nav'

const sets = [
  { code: 'BS', name: 'Base', releaseDate: null, isOfficial: true, cardCount: 3, symbol: null },
  { code: 'PR', name: 'Promo', releaseDate: null, isOfficial: false, cardCount: 1, symbol: null },
]
const progress = [
  { setCode: 'BS', owned: 2, total: 3 },
  { setCode: 'PR', owned: 0, total: 1 },
]

describe('CollectionSetNav', () => {
  it('renders every set in the desktop rail', () => {
    renderWithIntl(
      <CollectionSetNav sets={sets} progress={progress} selected="BS" hrefFor={(c) => `?tab=sets&set=${c}`} />,
    )
    expect(screen.getByText('Base')).toBeInTheDocument()
    expect(screen.getByText('Promo')).toBeInTheDocument()
  })

  it('renders a mobile drawer trigger labelled Sets', () => {
    renderWithIntl(
      <CollectionSetNav sets={sets} progress={progress} selected="BS" hrefFor={(c) => `?tab=sets&set=${c}`} />,
    )
    expect(screen.getByRole('button', { name: /sets/i })).toBeInTheDocument()
  })
})
